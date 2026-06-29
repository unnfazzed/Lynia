# Lynia — Engineering Review Log

> **Living log of the engineering reviews** across the gstack sprint, oldest stage first: **Plan** (the
> required pre-build architecture gate) → **Build** (first-principles correctness audits) → **Ship** (the
> cloud-provisioning and ship-prep reviews). Each pass is a gstack `/plan-eng-review` / `/review`-style run.
>
> This is design rationale and decision history. **For where the build stands** (the T0–T13 scorecard, the
> live deployment) see **`docs/PILOT-READINESS.md`** — the single source of truth for status. Companions:
> `docs/CEO-REVIEW.md` (product), `docs/DESIGN-REVIEW.md` (design), `docs/CONCEPT.md` (§5 architecture).
> The **ET1–ET10** task IDs defined here are referenced by the schema, migrations, and the offer-loop
> concurrency test — they are stable identifiers, do not renumber.

| # | Stage | Date | Verdict (one line) |
|---|-------|------|--------------------|
| 1 | **Plan** — architecture gate | 2026-06 (pre-build) | ENG CLEARED — decisions E1–E4, offer-loop concurrency folded into P1 tasks with tests. |
| 2 | **Build** — first-principles audits | 2026-06-27 | LAND WITH FIXES — P0 auth/PII/race holes closed in the same pass. |
| 3 | **Ship** — provisioning + ship-prep | 2026-06-29 | LAND WITH FIXES — three "green CI, dead service" P1s closed before arming. |

---

## 1. Plan stage — architecture gate (pre-build)

> Output of the gstack `/plan-eng-review` stage — the required shipping gate. Makes the build plan concrete
> and technically correct on top of `docs/CONCEPT.md` + `docs/CEO-REVIEW.md`. Status: **ENG CLEARED**.

### Engineering decisions locked

| # | Decision | Choice |
|---|----------|--------|
| E1 | Backend stack | **NestJS / TypeScript** (one-language with Expo; BullMQ + Socket.IO + Prisma first-class) |
| E2 | Repo layout | **Monorepo — pnpm + Turborepo** (shared TS types across app / API / admin) |
| E3 | Data access | **Prisma for schema/migrations + raw parameterized SQL for the hot path** (CAS, PostGIS) |
| E4 | OTP delivery | **Send-adapter; WhatsApp default, SMS behind a flag** (schedule insurance vs BSP delay) |

### The offer loop — concurrency design (the core build)

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
  Second concurrent select → unique violation → "rider just became unavailable." On assign, bulk-expire the
  rider's other `pending` offers + notify those customers.
- **ET3 (P1) Selection transaction:** canonical lock order (orders by id, then offers by id), short TX,
  `lock_timeout`; liveness = `is_online AND last_heartbeat > now()-30s` checked *inside* the TX (ghost-rider).

### Realtime — WS is push, REST is truth

- **ET4 (P1)** Socket.IO + Redis adapter for broadcast fan-out + GPS. **No replay buffer.** On (re)connect the
  client calls `GET /orders/:id` → status + last `current_lat/lng` + `location_updated_at` + recent
  `order_events`. Persist last GPS to Redis/Postgres on every update so reconnect is a stateless read;
  `location_updated_at` lets the client label a stale map instead of showing a frozen one. Mobile background +
  expensive ZW data make this mandatory.

### Auth — custom WhatsApp/SMS OTP (own subsystem)

- **ET5 (P1)** Send-adapter (WhatsApp default / SMS flag, E4). OTP codes single-use, short TTL, **hashed**,
  with a server-side attempt counter in **Redis** (not the JWT). Rate-limit **per-phone AND per-IP AND
  global** + backoff + daily cap (each send costs BSP money → enumeration/spam is a budget-DoS). Short-lived
  access JWT + rotating refresh token with a **server-side session table** (own revoke/ban/logout).
  `role`/`kyc_status` checked **server-side per request**, not baked immutably into the JWT (rider upgrade must
  take effect without re-login).

### Data model — concrete constraints (refines CONCEPT §5)

- **ET6 (P1)** Geo: `riders.geog geography(Point)` + **GiST index**; query `ST_DWithin` (NOT `ST_Distance < x`
  — can't use the index). Plain lat/lng won't index for radius search.
- **ET7 (P1)** Missing constraints: unique `(order_id, rider_id)` on `offers` (the "one round" rule as a
  *constraint*); `CHECK offered_fare > 0`; native enums/CHECKs on status; FK `ON DELETE`; **hash
  `delivery_otp`** (no plaintext); defined writer for denormalized `rating_avg`/`trips_count`/`orders_count`
  (transactional increment or trigger — else drift).
- Indexes: `offers(order_id,status)`, `orders(status)`, the partial `one_active_ride`, the unique
  `(order_id,rider_id)`.

### Module structure & portability seam

NestJS modules: `auth · profiles · riders · orders · offers · matching · tracking(ws) · notifications · kyc · storage · observability`.
- **ET8 (P1)** Three cloud adapters (storage / secrets / push) = one interface, two impls — the DRY seam that
  makes D7 real.
- **ET9 (P2)** D7 leaks to seal: storage adapter abstracts **URL generation** (Blob SAS vs GCS signed URLs)
  incl. the RN upload flow; **inject secrets as env at deploy** (avoid managed-identity — no GCP line-for-line
  equal); **plain connection-string Postgres auth** (avoid Azure-AD / Cloud-SQL-IAM). T13 exit-test = a
  **real CI smoke-deploy on GCP**.

### Test coverage (the "2am Friday" suite = offer-loop concurrency)

```
[unit/integration] two customers select same rider at once  → exactly one assign (ET2 unique violation)
[integration]      select vs expiry-job race, same order    → one wins, other no-ops (ET1 CAS)
[integration]      select offline/ghost rider               → liveness rejects in-TX (ET3)
[unit]             OTP brute-force + enumeration + send-spam → per-phone/IP/global limit (ET5)
[integration]      KYC reject / ZIM-ID unsupported          → manual backstop, rider stays gated
[integration]      WS drop mid-delivery → reopen            → REST snapshot, stale-labelled map (ET4)
[E2E]              signup→KYC→online ; broadcast→offer→select→deliver(OTP)→rate
```

### Outside voice — cross-model tension (resolved)

The independent reviewer put the honest critical path at ~8 weeks to a closed pilot / ~12 to Play-Store-stable,
bottlenecked by **vendor lead time** (WhatsApp BSP 2–4 wks, KYC ZIM-ID coverage unproven), not code. Recorded
against CEO review D3 (founder holds the 1-month target). **E4** (SMS send-adapter behind a flag) decouples
signup from a BSP slip; KYC stays async + manual backstop so riders onboard while verification is pending.

### Implementation tasks (eng)

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

### Parallelization (worktree lanes)

| Lane | Work | Depends on |
|------|------|------------|
| A | Foundations: monorepo + NestJS skeleton + Prisma schema/migrations + cloud adapters + CI (ET10, ET7, ET8) | — |
| B | Auth: WhatsApp/SMS OTP + sessions (ET5) | A |
| C | **Offer loop**: orders/offers/matching + CAS + expiry + indexes (ET1, ET2, ET3, ET6) | A |
| D | Realtime tracking: WS gateway + GPS + REST snapshot (ET4) | A, integrates C |
| E | KYC + rider onboarding | A, B |
| F | Admin dashboard (Next.js) | A |

Execution: A first → **B + C in parallel** → **D + E + F in parallel**. C is the critical path.

**Verdict:** ENG CLEARED. Architecture and tests reviewed; E1–E4 made; the critical offer-loop concurrency
findings folded into P1 tasks with tests. No unresolved decisions. → handed to Build.

---

## 2. Build stage — first-principles correctness audits (2026-06-27)

> Two independent first-principles engineering audits over the as-built backend (the offer loop, auth, and
> the delivery lifecycle), looking for trust-boundary and concurrency holes the plan-stage review couldn't
> see in code. Verdict: **LAND WITH FIXES** — the P0s below were closed in the same pass, then re-confirmed
> in the comprehensive post-build review.

### P0 holes found and closed

| Area | Hole | Fix |
|------|------|-----|
| **Auth — `x-user-id` spoof** | A dev-only `x-user-id` header fallback could stand in for a real user identity outside dev. | Gated to non-production — in production the header is ignored entirely; identity is only ever the JWT subject. Resolver extracted to a pure `resolveCurrentUser()` and unit-tested (JWT wins / dev fallback / prod ignores header / no-identity throws). *(Booked as Track B #1; see Ship-prep below.)* |
| **Auth — concurrent-refresh race** | Two refreshes racing on the same rotating refresh token could both succeed. | Refresh made atomic against the server-side session table — rotation is single-use; a replayed/raced token is rejected. |
| **PII — pre-assignment leak** | The counterparty's real phone could be read before the reveal window (`assigned`→`completed`). | Pre-assignment PII leak sealed — the number is gated strictly by order state (§5d), confirmed by an authz test on `history`/`/auth/me`. |
| **Rider online-invariant** | A rider could appear online/b+id outside the intended state. | The online-invariant is enforced server-side (heartbeat + cooldown 403 taken-offline path). |

### Comprehensive post-build review

An independent eng + adversarial + static-design pass over the whole build. Backend confirmed clean
(history/`me` authz + PII). Fixed a **systemic error-state-honesty P1** (errors were swallowed into success-
looking states) and the **rider-gate staleness**. Consciously-deferred remainder tracked as deferred work.
Test count climbed 21 → 72 → 112 → **119** API tests through this stage, with mobile typecheck in the CI gate.

**Verdict:** Build engineering CLEARED — foundations sound, P0s closed, lifecycle whole and tested. → Ship.

### 2c. Notifications / FCM feature review (post-merge, 2026-06-29)

> The FCM push feature (device-token registry + send-wiring; PRs #58/#59) **shipped without a review pass**
> — and worse, merged red, twice (an invalid `ignoreDeprecations` tsconfig value; a `/** */` block comment
> Prisma rejects). This is the retrospective gstack `/review` + `/codex` it should have had: a staff-engineer
> audit paired with an independent adversarial second opinion over the merged code. Verdict: **LAND WITH
> FIXES** — fixes applied in the follow-up change; no security/IDOR or concurrency defects.

**Confirmed sound (both reviewers, by code):**
- **Auth / IDOR.** `POST/DELETE /notifications/device-token` are class-`@UseGuards(JwtAuthGuard)`; identity is
  the JWT `sub` via `@CurrentUser`, never a client field. `unregisterToken` is scoped `{ token, profileId }`
  (can't delete another user's token). Token re-home on register is the standard FCM ownership-transfer
  pattern (a token is a device secret), not a practical hijack vector.
- **Concurrency.** Every `notify*` is `void`-fired **after** commit and wraps its whole body in try/catch, so
  it never rejects (no `unhandledRejection`) and a push failure can't roll back an offer-loop/lifecycle write.
  No double-notify (`assigned` only from `MatchingService`; `completed` only once via the delivered→completed
  CAS). Audience mappings correct (assigned→rider, lifecycle→customer, cancelled→both, expired→customer).
- **Migration fidelity.** `0004_device_tokens` matches the `DeviceToken` model (types, nullability, FK
  `ON DELETE CASCADE`, unique-on-token, profile index); CI's PostGIS job applying it confirms it.

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Dead/expired FCM tokens were never pruned.** The adapter swallowed *every* send error, including the one that identifies a permanently-dead token (`registration-token-not-registered`), and `NotificationsService` discarded all results — so `device_tokens` grows unbounded and keeps sending to dead devices (and a token FCM later reassigns would deliver to the wrong user). | ✅ **Fixed** — `PushAdapter.send` now returns `PushResult { ok, invalidToken }`; `FcmPush` maps the two unambiguous dead-token codes (never transient/5xx); `NotificationsService.send` collects and `deleteMany`s the dead tokens. Unit-tested (prunes only the invalid one; never prunes on a transient throw). |
| **P2** | **Device tokens were logged whole** (`fcm.push.ts`, `noop.push.ts`) — bearer-ish credentials at `warn` level in prod logs. | ✅ **Fixed** — a shared `maskToken()` (head+tail only) used on every push log line; unit-tested. |
| **P2** | **`PUSH_PROVIDER=fcm` with no `FCM_PROJECT_ID` failed silently** off Cloud Run (ADC has no ambient project) — push looks armed, delivers nothing, no signal. | ✅ **Fixed** — `selectPush` logs a boot `warn` when fcm is selected without a project id. |
| **P2** | **Unbounded fan-out** — `Promise.all(tokens.map(send))` fires one FCM call per device with no batching. Trivial at pilot scale. | ◐ **Deferred** — switch to FCM `sendEach` (≤500/call); also halves the dead-token-cleanup cost. Booked. |
| **P2** | **Rider-broadcast push gap.** CONCEPT §3.10 calls fast new-order alerts to nearby riders "critical — push is the primary channel," but only the WS board broadcast exists; no push to nearby riders on `open_for_offers`. | ◐ **Deferred** — needs the PostGIS nearby-rider query at broadcast time; a real feature, booked for the rider-notifications pass. |
| NIT | `notifyOrderStatus` re-fetches `customerId`/`riderId` the caller already holds (1 extra query per transition, off the hot path since it's fire-and-forget). | Deferred — add a recipient-ids overload if it ever matters. |
| NIT | No controller-level test (guard application / `@CurrentUser` wiring untested). | Deferred — low risk; the guard is class-level and shared across the codebase. |

**Verdict:** LAND WITH FIXES. The one correctness issue (token pruning) is closed in code with tests; the
logging and config-gating P2s are closed alongside; the fan-out batching and the rider-broadcast push are
booked follow-ups. **Process note:** this feature should have had `/review` + a green CI gate *before* merge,
not after — the two red-CI merges were avoidable.

---

## 3. Ship stage — provisioning + ship-prep reviews (2026-06-29)

> Two ship-stage engineering passes: the **ship-prep increment** review (release workflow, GCS V4 signing,
> the `x-user-id` gate) and the **GCP provisioning IaC** review (`infra/terraform/`), plus the engineering
> lens of the post-launch follow-up triage. Both verdicts: **LAND WITH FIXES**, fixes applied in the same
> change.
>
> **Method note (honest):** the gstack `/review` / `/plan-eng-review` skills could not run in this
> environment — the egress policy blocks cloning `garrytan/gstack` (GitHub access scoped to `unnfazzed/lynia`),
> and no `terraform`/`tofu` binary is installed, so `terraform validate`/`plan` were not executed here. These
> are structured staff-engineer passes applying the same gates; **run `terraform validate` + `plan` and a
> gstack `/review` locally before the next apply.**

### 3a. Ship-prep increment (release workflow · GCS V4 signing · x-user-id gate)

Independent staff-engineer audit (SQL safety, auth/trust boundaries, conditional side-effects). Confirmed
correct:

- **`x-user-id` gate is unbypassable.** `nodeEnv === "production"` is exact; `NODE_ENV` is Zod-validated at
  boot. All six `@CurrentUser` consumers are behind `JwtAuthGuard`; the unguarded auth routes (`otp/*`,
  `refresh`) are correctly pre-auth.
- **`--allow-unauthenticated` on Cloud Run is appropriate** — the service has public auth/health routes;
  protected routes are guarded at the controller layer, not the edge.
- **GCS V4 signing correct** — write vs read action, content-type binding, ms expiry, no network at
  construction; the offline throwaway-RSA-key test genuinely proves the signing path.

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | `release.yml` armed-but-misconfigured (e.g. `GCP_PROJECT_ID` unset) would fail opaquely mid-run after a build starts. | ✅ **Fixed** — a *Validate required deploy config* step that fails fast listing every missing var/secret and points at the arming docs. |

### 3b. GCP provisioning IaC (`infra/terraform/`)

Greenfield IaC: VPC + private services access + Serverless VPC connector, Cloud SQL (Postgres 16/PostGIS),
Memorystore Redis, Cloud Storage, Artifact Registry, Secret Manager, runtime/deployer service accounts, plus
the matching `release.yml` edits. **Verdict: LAND WITH FIXES** — three P1 correctness gaps between a naive
runbook and a Cloud Run service that actually boots, all fixed in the change.

**Confirmed correct:** D7 portability preserved (ET9 — secrets via `--set-secrets`, plain connection-string
DB auth, storage abstracts URL generation; the Azure adapter stays drop-in); the PostGIS path (`0001_init`
runs `CREATE EXTENSION IF NOT EXISTS postgis`, app user has `cloudsqlsuperuser`); least-privilege runtime SA
(bucket-scoped, per-secret, Cloud SQL Client only).

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Cloud Run could not reach Redis.** Memorystore is private-only; serverless Cloud Run has no VPC route by default. Every BullMQ job / Socket.IO broadcast / OTP-counter op would fail at runtime — an outage only visible post-deploy. | ✅ **Fixed** — `google_vpc_access_connector.lynia-connector`; `release.yml` passes `--vpc-connector` + `--vpc-egress private-ranges-only` via a `VPC_CONNECTOR` repo variable. |
| **P1** | **Service ran as the default compute SA.** `gcloud run deploy` set no `--service-account` → over-privileged identity, and the keyless V4-signing grant would be on the wrong principal. | ✅ **Fixed** — dedicated `lynia-run` runtime SA; `--service-account` wired via `CLOUD_RUN_SERVICE_ACCOUNT`. Deployer gets `actAs`. |
| **P1** | **Keyless V4 signed URLs need self-`signBlob`.** `gcs.storage.ts` signs via ADC (no exported key) → the runtime SA must hold `serviceAccountTokenCreator` **on itself**, or every signed-URL mint 500s. | ✅ **Fixed** — `google_service_account_iam_member.runtime_sign_self`; `GCP_STORAGE_PROJECT_ID` set in the deploy env. |
| **P2** | **Cloud SQL public IP enabled** (so the GitHub-hosted runner's Auth Proxy can run migrations). Widens surface. | ◐ **Accepted with guardrails** — `ssl_mode = ENCRYPTED_ONLY`, **no** `authorized_networks`, private IP also provisioned. Follow-up: move migrations to a VPC-internal runner, then `ipv4_enabled = false`. |
| **P2** | **Deployer SA JSON key in TF state** — a long-lived credential. | ✅ **Resolved — keyless WIF.** The org enforces `iam.disableServiceAccountKeyCreation`; `wif.tf` provisions a Workload Identity pool/provider scoped to `assertion.repository == "unnfazzed/Lynia"`; `release.yml` auths via `workload_identity_provider` + `service_account`. No long-lived secret exists. |
| NIT | Bucket CORS defaults to `["*"]`. | Deferred — signed URLs are the gate; `bucket_cors_origins` is a variable, tighten before launch. |
| NIT | PSA peering range could overlap the connector `/28`. | ✅ Fixed — PSA pinned `10.10.0.0/16`, connector `10.8.0.0/28`; provably disjoint. |

**Cost (pilot, rough, africa-south1):** Cloud SQL `db-custom-1-3840` (~$50/mo) + Memorystore BASIC 1 GB
(~$35/mo) + VPC connector (~$10/mo) dominate; Cloud Run / Storage / AR are ~$0 at pilot traffic. **~$95–110/mo**
before Google for Startups credits; downsize `db_tier` to `db-g1-small` to stretch further.

**Post-apply addendum** (project provisioned `lynia-500911`, external HTTPS LB landed). Prior fixes verified
present in source. New finding worth carrying:

| Sev | Finding | Recommendation |
|-----|---------|----------------|
| **P1 (partly fixed)** | **`--allow-unauthenticated` + no `--ingress` may collide with org policy.** A hardened org likely enforces `run.allowedIngress = internal-and-cloud-load-balancing` (a new service defaults to `all` → rejected) and/or `iam.allowedPolicyMemberDomains` (blocks the `allUsers` binding → deploy fails). Either reds the **first** deploy after a green build — the exact "green CI, dead service" class. | ✅ **`--ingress internal-and-cloud-load-balancing` added** (the ALB fronts the service). **Still verify** `allUsers` before arming: `gcloud resource-manager org-policies list --project lynia-500911`. If domain-restricted sharing is enforced, drop `--allow-unauthenticated` and grant invoker to an org-allowed principal. |
| **P2** | Managed TLS cert (`lynia-api-cert`) is a two-step rollout — ACTIVE only once the forwarding rule is live **and** DNS A-record for `lyniago.lyniafinance.com` resolves; until then `https://` serves a cert error, easy to misread as a deploy failure. | Runbook: after first deploy, `terraform output load_balancer_ip` → create the A record → poll `gcloud compute ssl-certificates describe lynia-api-cert --global` until ACTIVE. |

### 3c. Post-launch follow-ups (engineering lens)

The engineering column of the three-lens ship triage (product lens in `docs/CEO-REVIEW.md` §3, design lens in
`docs/DESIGN-REVIEW.md` §Ship). Only **Task A — point the mobile app at the live HTTPS API** cleared all
gates; **executed**. The engineering catches that made it correct:

1. **`infra/terraform/lb.tf` `timeout_sec = 3600`** on the backend service — for a serverless-NEG backend
   `timeout_sec` bounds the *whole* WebSocket connection; the default 30s would have severed every tracking
   socket ~30s into a delivery (reconnect storm on a constrained network).
2. **`release.yml --timeout 3600`** on `gcloud run deploy` — Cloud Run's own request timeout (default 300s)
   must also be raised for WS parity, else sockets cap at 5 min.
3. **`apps/mobile/src/api/client.ts` `AbortController` (15s)** — `apiFetch` used raw `fetch` with no timeout;
   on a weak link the first-touch screens would hang unbounded. *(Surfaced as the design lens's #1 cutover
   risk — see DESIGN-REVIEW §Ship.)*

The rest were triaged **blocked-external** (B production OTP, C FCM, E real Didit run — founder/vendor) or
**deferred** (D OTEL endpoint; F1 needs a VPC-internal migrator first; F2/F3 contradict the lean-pilot
decision; F4 pairs with the admin deploy). Deferred infra hardening is tracked in `infra/terraform/README.md`.

**Verdict:** Ship engineering CLEARED. The three P1s that would have produced a green CI deploy of a
non-functional service (no Redis, wrong identity, broken signed URLs) are closed in code; the one thing that
can still red the *first* real deploy is the org-policy interaction on ingress/`allUsers` — verify before
arming. Remaining items are hardening follow-ups with explicit triggers. **Current status →
`docs/PILOT-READINESS.md`.**
