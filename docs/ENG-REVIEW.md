# Lynia — Engineering Review (Plan stage)

> Output of the gstack `/plan-eng-review` stage — the required shipping gate. Makes the build plan
> concrete and technically correct on top of `docs/CONCEPT.md` + `docs/CEO-REVIEW.md`.
> Status: **ENG CLEARED — ready to build** (design review recommended for the UI surfaces).

## Engineering decisions locked

| # | Decision | Choice |
|---|----------|--------|
| E1 | Backend stack | **NestJS / TypeScript** (one-language with Expo; BullMQ + Socket.IO + Prisma first-class) |
| E2 | Repo layout | **Monorepo — pnpm + Turborepo** (shared TS types across app / API / admin) |
| E3 | Data access | **Prisma for schema/migrations + raw parameterized SQL for the hot path** (CAS, PostGIS) |
| E4 | OTP delivery | **Send-adapter; WhatsApp default, SMS behind a flag** (schedule insurance vs BSP delay) |

## The offer loop — concurrency design (the core build)

```
                 ┌─ customer selects offer ─┐
open_for_offers ─┤  TX: lock order→offer,    ├─▶ assigned     (guarded CAS on orders.status)
                 │  liveness-check rider,     │
                 └─ BullMQ expiry job ───────┘──▶ expired      (SAME guarded CAS; 0 rows = no-op)
```
- **ET1 (P1) Selection + expiry are ONE compare-and-swap.** Both run
  `UPDATE orders SET status=$new, rider_id=$r WHERE id=$o AND status='open_for_offers'`. 0 rows affected ⇒
  the other path already won ⇒ no-op. BullMQ job `jobId = order_id` (idempotent; retries can't double-fire).
- **ET2 (P1) Rider double-book is a DB constraint, not app logic:**
  `CREATE UNIQUE INDEX one_active_ride ON orders(rider_id) WHERE status IN ('assigned','confirmed','en_route_pickup','picked_up','en_route_dropoff')`.
  Second concurrent select → unique violation → "rider just became unavailable." On assign, bulk-expire the rider's
  other `pending` offers + notify those customers.
- **ET3 (P1) Selection transaction:** canonical lock order (orders by id, then offers by id), short TX, `lock_timeout`;
  liveness = `is_online AND last_heartbeat > now()-30s` checked *inside* the TX (ghost-rider).

## Realtime — WS is push, REST is truth

- **ET4 (P1)** Socket.IO + Redis adapter for broadcast fan-out + GPS. **No replay buffer.** On (re)connect the client
  calls `GET /orders/:id` → status + last `current_lat/lng` + `location_updated_at` + recent `order_events`. Persist last
  GPS to Redis/Postgres on every update so reconnect is a stateless read; `location_updated_at` lets the client label a
  stale map instead of showing a frozen one. Mobile background + expensive ZW data make this mandatory.

## Auth — custom WhatsApp/SMS OTP (own subsystem)

- **ET5 (P1)** Send-adapter (WhatsApp default / SMS flag, E4). OTP codes single-use, short TTL, **hashed**, with a
  server-side attempt counter in **Redis** (not the JWT). Rate-limit **per-phone AND per-IP AND global** + backoff +
  daily cap (each send costs BSP money → enumeration/spam is a budget-DoS). Short-lived access JWT + rotating refresh
  token with a **server-side session table** (own revoke/ban/logout). `role`/`kyc_status` checked **server-side per
  request**, not baked immutably into the JWT (rider upgrade must take effect without re-login).

## Data model — concrete constraints (refines CONCEPT §5)

- **ET6 (P1)** Geo: `riders.geog geography(Point)` + **GiST index**; query `ST_DWithin` (NOT `ST_Distance < x` — can't
  use the index). Plain lat/lng won't index for radius search.
- **ET7 (P1)** Missing constraints: unique `(order_id, rider_id)` on `offers` (the "one round" rule as a *constraint*);
  `CHECK offered_fare > 0`; native enums/CHECKs on status; FK `ON DELETE`; **hash `delivery_otp`** (no plaintext);
  defined writer for denormalized `rating_avg`/`trips_count`/`orders_count` (transactional increment or trigger — else drift).
- Indexes: `offers(order_id,status)`, `orders(status)`, the partial `one_active_ride`, the unique `(order_id,rider_id)`.

## Module structure & portability seam

NestJS modules: `auth · profiles · riders · orders · offers · matching · tracking(ws) · notifications · kyc · storage · observability`.
- **ET8 (P1)** Three cloud adapters (storage / secrets / push) = one interface, two impls — the DRY seam that makes D7 real.
- **ET9 (P2)** D7 leaks to seal: storage adapter abstracts **URL generation** (Blob SAS vs GCS signed URLs) incl. the RN
  upload flow; **inject secrets as env at deploy** (avoid Azure managed-identity — no GCP line-for-line equal); **plain
  connection-string Postgres auth** (avoid Azure-AD / Cloud-SQL-IAM). T13 exit-test = a **real CI smoke-deploy on GCP**.

## Test coverage (the "2am Friday" suite = offer-loop concurrency)

```
[unit/integration] two customers select same rider at once  → exactly one assign (ET2 unique violation)
[integration]      select vs expiry-job race, same order    → one wins, other no-ops (ET1 CAS)
[integration]      select offline/ghost rider               → liveness rejects in-TX (ET3)
[unit]             OTP brute-force + enumeration + send-spam → per-phone/IP/global limit (ET5)
[integration]      KYC reject / ZIM-ID unsupported          → manual backstop, rider stays gated
[integration]      WS drop mid-delivery → reopen            → REST snapshot, stale-labelled map (ET4)
[E2E]              signup→KYC→online ; broadcast→offer→select→deliver(OTP)→rate
```

## Outside voice — cross-model tension (resolved)

- **Timeline:** the independent reviewer puts the honest critical path at ~8 weeks to a closed pilot / ~12 to
  Play-Store-stable, bottlenecked by **vendor lead time** (WhatsApp BSP 2–4 wks, KYC ZIM-ID coverage unproven), not code.
  Recorded against CEO review D3 (founder holds the 1-month target). **E4** (SMS send-adapter behind a flag) decouples
  signup from a BSP slip; KYC stays async + manual backstop so riders onboard while verification is pending.
- No other cross-model tension — both reviewers agree on the architecture.

## Implementation Tasks (eng)

| ID | P | Task | Verify |
|----|---|------|--------|
| ET1 | P1 | Guarded CAS for select + expiry; BullMQ job idempotent on order_id | concurrent select+expiry → one outcome, no orphan "hired" rider |
| ET2 | P1 | `one_active_ride` partial unique index + bulk-expire rider's other offers on assign | two simultaneous selects of one rider → exactly one assign |
| ET3 | P1 | Selection TX: canonical lock order, `lock_timeout`, in-TX liveness | deadlock test passes; ghost rider rejected |
| ET4 | P1 | Socket.IO + Redis adapter; REST `GET /orders/:id` snapshot; persist last GPS | kill socket mid-ride, reopen → correct state + stale label |
| ET5 | P1 | WhatsApp/SMS OTP send-adapter; hashed codes; per-phone/IP/global limit; rotating refresh + session table | brute-force locks; flag flip switches channel; logout revokes |
| ET6 | P1 | PostGIS `geography(Point)` + GiST index; `ST_DWithin` broadcast query | `EXPLAIN` uses GiST index; nearby-rider within radius |
| ET7 | P1 | Schema constraints (unique offers, `offered_fare>0`, enums, FKs, hashed OTP, counter writer) | duplicate offer rejected; counters consistent under concurrent ratings |
| ET8 | P1 | Storage/secrets/push adapters (one interface, two impls) | unit tests pass against both Azure and GCP impls |
| ET9 | P2 | Seal D7 leaks (URL-gen, env secrets, conn-string auth) + T13 CI smoke-deploy on GCP | CI boots the API on Cloud Run with config-only changes |
| ET10 | P1 | Monorepo scaffold (pnpm + Turborepo): app, API, admin, shared types, CI | one CI run builds all three; types shared |

## Parallelization (worktree lanes)

| Lane | Work | Depends on |
|------|------|------------|
| A | Foundations: monorepo + NestJS skeleton + Prisma schema/migrations + cloud adapters + CI (ET10, ET7, ET8) | — |
| B | Auth: WhatsApp/SMS OTP + sessions (ET5) | A |
| C | **Offer loop**: orders/offers/matching + CAS + expiry + indexes (ET1, ET2, ET3, ET6) | A |
| D | Realtime tracking: WS gateway + GPS + REST snapshot (ET4) | A, integrates C |
| E | KYC + rider onboarding | A, B |
| F | Admin dashboard (Next.js) | A |

Execution: A first → **B + C in parallel** → **D + E + F in parallel**. C is the critical path.

## Next steps (gstack flow)

- ✅ **Plan → CEO review** (`docs/CEO-REVIEW.md`).
- ✅ **Plan → Eng review** (this doc) — required gate cleared.
- ⬜ **Plan → `/plan-design-review`** — offer list, 7-step tracker, empty-state screens (heavy UI, un-designed).
- ⬜ **Build** — lane A → B/C → D/E/F.

**Verdict:** ENG CLEARED. Architecture and tests reviewed; decisions E1–E4 made; the critical offer-loop concurrency
findings are folded into P1 tasks with tests. No unresolved decisions.
