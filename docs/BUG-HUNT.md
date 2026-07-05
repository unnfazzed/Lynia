# Lynia — Bug Hunt Report

_Adversarial code audit of the Lynia monorepo (API + mobile + admin + shared + infra)._
_Method: risk-domain fan-out, then line-level verification of every finding against source._

## Strategy

Lynia is a fintech/logistics product: cash **settlements**, **KYC**, **OTP** auth, a
concurrent **offer-loop** marketplace, and **WebSocket** live tracking. The value-at-risk is
money movement, identity, concurrency, and location privacy — so the hunt was organised around
those risk domains rather than by file.

Seven domains were each audited in depth, then **every candidate finding was re-checked against
the actual code** (file:line, exploit path, and blast radius) before being kept. Style nits,
missing tests, and speculative concerns were dropped. Domains:

1. **Auth / OTP / tokens / guards** — replay, brute-force, forgery, IDOR
2. **Offer-loop / matching / order-lifecycle** — concurrency, state-machine holes, delivery OTP
3. **KYC / uploads / notifications / webhooks** — signature verification, SSRF, decision trust
4. **Tracking WebSocket / admin / pricing** — live-location IDOR, authz, money math
5. **Mobile app** — token storage, money input, double-submit, socket leaks, consent
6. **Schema / migrations / shared contracts** — constraints, money precision, lock-safety
7. **Cross-cutting** — raw SQL injection, config defaults, rate limiting

**Headline:** the concurrency and crypto core is genuinely well-built — guarded compare-and-swap
with the `one_active_ride` partial-unique index, `FOR UPDATE` row locks on the delivery-OTP gate,
CSPRNG OTPs compared with `timingSafeEqual` and stored HMAC-hashed, a hardened Didit webhook
(canonical-body HMAC, timing-safe compare, replay window, fail-closed), parameterized raw SQL, and
SecureStore token storage on mobile. **No P0 was found in the hot path.** The real defects live in
the gating/authorization layer around that core, in config/deploy safety, and in operational
lock-safety.

Severity: **P1** = exploitable now or high-impact with a plausible trigger · **P2** = real
security/integrity/operational impact, bounded trigger · **P3** = defense-in-depth / latent / minor.

---

## P1 — fix before pilot

### P1-1 · Insecure default JWT signing secret, no production boot-guard
`apps/api/src/config/env.ts:33`

```ts
JWT_SIGNING_SECRET: z.string().min(16).default("dev-insecure-secret-change-me-please"),
```

The `superRefine` boot-guard (`env.ts:67`) forces `REDIS_URL` in production but **not**
`JWT_SIGNING_SECRET`. A prod boot with the var unset succeeds using a secret that is public in this
repo. That secret signs every access JWT **and** HMAC-hashes every OTP and refresh token
(`token.service.ts:18,23,36`).

- **Impact:** an attacker signs `{ sub: <any>, role: "admin" }`, passes `JwtAuthGuard` + `AdminGuard`,
  and owns `/admin/*` — including self-approving any rider's KYC. Full pre-auth account/admin takeover.
- **Mitigation today:** Terraform generates and injects the secret from Secret Manager
  (`infra/terraform/secrets.tf:29`, `release.yml:154`), so the current deploy path does set it. The
  bug is the **absence of an in-code guard** — a future misconfig (dropped mapping, container run
  outside CI, `NODE_ENV` not `production`) silently falls back to the known secret with no failure.
- **Fix:** in the production branch of `superRefine`, reject boot when `JWT_SIGNING_SECRET` is unset
  or equals the default — exactly as already done for `REDIS_URL`.

### P1-2 · Mobile sign-out leaks the previous user's data and skips the liability disclaimer
`apps/mobile/src/auth/auth-context.tsx:47` (+ `app/home.tsx:113,347`, `src/auth/session.ts`)

`signOut()` deletes only the `lynia.session` key. It does **not** clear the React Query cache, the
saved order draft (`lynia.orderDraft`), or the disclaimer flag (`lynia.disclaimerAccepted`).

- **Impact (shared devices are common in the target market):** user A signs out, user B signs in.
  `loadDraft()` (`home.tsx:158`) rehydrates **user A's pickup/drop-off pins and landmarks** (home/work
  addresses). `loadDisclaimerAccepted()` returns A's acceptance, so `home.tsx:347` **skips the liability
  disclaimer** for B before their first broadcast — a consent/legal gap. Cached `["me"]`, `["history"]`,
  `["activeJob"]` queries also serve A's data until refetch.
- **Fix:** in `signOut()`, after `clearSession()`, also `queryClient.clear()` and delete the
  `orderDraft` / `rolePreference` / `disclaimerAccepted` / delivery-code keys.

---

## P2 — real impact, bounded trigger

### P2-1 · Banned / suspended / on-hold riders can still bid and be assigned
`apps/api/src/offers/offers.service.ts:38` · `apps/api/src/matching/matching.service.ts:61` · `apps/api/src/admin/admin.service.ts:315,370`

`makeOffer` gates only on `kycStatus === "verified" && isOnline`; `selectOffer` liveness checks only
`isOnline` + heartbeat. Neither consults `accountStatus`, `onHold`, or `cooldownUntil` — even though
`onlineRefusalReason()` exists and does exactly that (but only at `setOnline`). Meanwhile
`suspendRider`/`banRider` set `accountStatus` but **never force `isOnline = false`**.

- **Impact:** a rider who is online when an admin bans them stays `isOnline = true`, keeps making
  offers, and gets selected and completes deliveries — collecting cash the platform must then settle.
  The ban is a no-op against an already-online rider.
- **Fix:** gate `makeOffer` and `selectOffer` on `onlineRefusalReason()`, and set `isOnline = false`
  inside `suspendRider`/`banRider`.

### P2-2 · `GET /orders/:id` snapshot exposes live rider GPS + addresses to any authenticated user
`apps/api/src/orders/orders.service.ts:386`

`getSnapshot` computes `isCustomer`/`isRider` but uses them **only** to gate the phone number and
rider-waypoint contact details. The `rider` object (live `currentLat`/`currentLng` from Redis),
pickup/drop-off coordinates, item list, and the event timeline (per-event lat/lng) are returned to
**any** authenticated caller holding the order UUID. The WebSocket path (`subscribeOrder`) correctly
gates via `canAccessOrder`; the REST snapshot has no equivalent party-gate.

- **Impact:** a stranger with an order id can live-track a rider's location and read delivery
  addresses — a privacy and rider-safety exposure.
- **Fix:** early-return `ForbiddenException` unless `callerId === customerId || callerId === riderId`.

### P2-3 · Admin `cancelOrder` bypasses the invariants the customer/rider cancel enforces
`apps/api/src/admin/admin.service.ts:391`

The lifecycle `cancel()` declines pending offers and emits `job:cancelled` / status to the order room.
Admin `cancelOrder` only flips status, writes an OrderEvent, and audits — it does **neither**.

- **Impact:** cancelling a live order leaves its offer rows `pending` against a terminal `cancelled`
  order (integrity drift; riders still see "offer sent"), and an assigned rider gets **no**
  notification — stranded on a job the DB considers dead.
- **Fix:** in the same transaction, `updateMany` pending offers → `declined`; after commit emit
  `jobCancelled` / `orderStatus` to `orderRoom(orderId)`.

### P2-4 · `recordPayment` (mark settlement paid) has no audit row, no actor, no already-paid guard
`apps/api/src/settlements/settlements.service.ts:184` · `apps/api/src/admin/admin.controller.ts:191`

Every other admin mutation (suspend/ban/lift/cancel/fare, even the automated `auto_pause`) writes an
`AuditLog` in the same transaction. `recordPayment` writes none, and the controller doesn't even pass
`@CurrentUser()`. There is also no `status === paid` guard.

- **Impact:** the one destructive **money** action has zero attribution — no record of who marked a
  rider's cash settlement paid or when — and it can be re-applied repeatedly.
- **Fix:** pass the acting admin in and `auditLog.create({ action: "settlement.pay", actor, target })`
  in the same `$transaction`; reject if already `paid`.

### P2-5 · `normalizePhone` mints duplicate identities for common trunk-0 / country-code forms
`packages/shared/src/phone.ts:28`

It never strips a trunk `0` that follows the country code, and the `+` branch trusts its digits
verbatim. The same subscriber produces distinct E.164 strings:

- `"0771234567"` → `+263771234567` (canonical)
- `"+263 0771234567"` / `"2630771234567"` (country code **plus** retained trunk 0 — an ordinary way
  ZW numbers are written) → `+2630771234567`
- `"+0771234567"` → `+0771234567` passes the `/^\+\d{8,15}$/` gate despite the leading-0 country code.

Auth keys accounts, OTP records, and rate limits on this value, so one person becomes several accounts
with split history/OTP state — the exact failure the doc-comment says it prevents.
- **Fix:** after resolving the country code, strip a leading `0` from the national remainder and reject
  a country code beginning with `0`.

### P2-6 · Migrations 0006/0007 take exclusive/write locks on the live `orders` table
`apps/api/prisma/migrations/0006_pickup_geog/migration.sql:5` · `0007_history_indexes/migration.sql:12`

`0006` adds a `GENERATED ALWAYS AS (…) STORED` column — a **full table rewrite under
`ACCESS EXCLUSIVE`**. `0006:17` and `0007:15` build GiST/btree indexes and `0007:12` drops/creates
indexes, all **without `CONCURRENTLY`**, blocking writes for the duration. `DROP INDEX` lacks
`IF EXISTS`, so a half-applied migration isn't re-runnable.

- **Impact:** on the deployed pilot with a populated `orders` table, deploys stall all order writes
  for the migration's duration (scales with row count).
- **Fix:** add the column nullable + backfill in batches; build indexes `CONCURRENTLY` out-of-band;
  add `IF EXISTS` to the drops.

### P2-7 · `boardLeave` leaves an offline rider in every geo-cell board room
`apps/api/src/tracking/tracking.gateway.ts:239`

`boardSubscribe` with a location joins 9 `board:geo:*` rooms, but `boardLeave` only calls
`client.leave(BOARD_ROOM)` — it never leaves the geo rooms.

- **Impact:** a rider who went online with a location and then taps "go offline" keeps receiving
  `board:new-order` pushes for new jobs while `isOnline = false`.
- **Fix:** in `boardLeave`, iterate `client.rooms` and leave every `board:geo:*` room (mirror the
  cleanup loop already in `boardSubscribe`).

---

## P3 — defense-in-depth, latent, or minor

- **Offers IDOR — rider PII.** `GET /orders/:orderId/offers` (`offers.controller.ts:27`) has no
  `caller === order.customerId` check (the controller comment even claims it should). Any authenticated
  user with the order id gets rider names, photo URLs, ratings, and bids. → gate on ownership.
- **Nearby-rider enumeration.** `GET /riders/nearby` (`tracking.controller.ts:11`) is `JwtAuthGuard`-only,
  so any customer can sweep coordinates to enumerate online riders' `profileId` + distance. → role-restrict
  or drop `profileId` from the response.
- **Logout IDOR.** `logout()` (`auth.service.ts:220`) revokes by caller-supplied `sessionId` with no
  `profileId` filter — a targeted forced-logout if a session UUID leaks. → add `profileId` to the where.
- **Unbounded / sub-cent fares.** `proposedFare`/`offeredFare` are `z.number().positive()` with no
  max/step (`contracts.ts:60,80`) while money columns are `NUMERIC(10,2)`. `1e8` → Postgres `22003`
  overflow (500); `5.005` is silently rounded so the charged fare ≠ agreed. → `.max(100_000).multipleOf(0.01)`.
- **`adjustFare` no status guard.** `admin.service.ts:420` overwrites `agreedFare` on any order; on a
  `completed` order in an already-`paid` settlement week, collected commission silently diverges from the
  fare on record (the settlement service's own comment warns of this). → reject on closed periods.
- **`photoUrl` latent IDOR.** `POST /riders/become` stores a client-supplied storage key verbatim
  (`riders.controller.ts:17`, `rider.service.ts:110`) with no `kyc/<callerId>/` prefix check. Harmless
  until a reviewer UI mints a signed read URL from it. → validate the prefix before persisting.
- **`/kyc/callback` unsigned in non-didit mode.** The fail-closed check (`kyc.controller.ts:64`) only
  fires for `KYC_PROVIDER === "didit"`; in stub mode with no secret, the signature/replay block is
  skipped and anyone can `POST` a status flip by `session_id`. Bounded (stub riders auto-verify), but a
  gap on an unauthenticated endpoint. → require the signed path whenever a secret is set / refuse in stub.
- **Device-token re-homing.** `registerToken` (`notifications.service.ts:44`) upserts on `token` with
  `update: { profileId }`, so posting a victim's FCM token reassigns delivery to the attacker. Needs the
  opaque token, hence low. → treat a token owned by another profile as a conflict.
- **Two-way rating structurally blocked.** `ratings.order_id` is globally `UNIQUE`
  (`schema.prisma:302`) with no rater discriminator; the moment the rider→customer rating (C8) is wired
  it hits the unique violation. → `@@unique([orderId, byProfileId])` or add `raterRole`.
- **Few DB CHECK constraints.** Only `offers.offered_fare` has a `CHECK` (`0001:95`). No DB guard on
  `ratings.score` (1–5), `offers.eta_minutes` (≥0), or the fare/value columns — any non-Zod write path
  (admin tooling, backfill, raw SQL) can persist a 9-star rating or negative fare. → add CHECKs.
- **`orders.cancelled_by` has no FK.** Unlike every other actor id, it's a bare UUID
  (`schema.prisma:235`) — can hold a dangling id; attribution queries can't join-verify. → add FK to
  `profiles(id)`.
- **Gateway in-memory map growth.** `positionEmit` (`gateway.ts:275`) is deleted only on the trailing-flush
  "nothing buffered" branch, so in steady state (fixes >1s apart) one entry per order room ever seen
  persists for the instance lifetime; `customerPresence` similarly leaks for a socket that never
  disconnects. Slow leak, not a crash. → delete after a leading-edge emit; TTL the presence maps.
- **Rider GPS watch leak (mobile).** `use-rider-location.ts:16` assigns `sub` only after
  `await watchPositionAsync(...)`; with no `cancelled` guard after that await, an unmount/`orderId`→null
  during the first-fix window creates a subscription post-cleanup that's never removed (battery drain,
  location sampling after the job ends). → re-check `cancelled` after the await and `sub.remove()`.
- **`x-user-id` dev fallback depends on `NODE_ENV`.** `resolveCurrentUser` (`current-user.decorator.ts:18`)
  trusts a plaintext `x-user-id` header whenever `NODE_ENV !== "production"`, read from raw
  `process.env`. Same misconfig class as P1-1: if `NODE_ENV` isn't `production` in prod, header-only
  identity spoof with no token. → fail boot on an unexpected `NODE_ENV`, or gate on a dedicated flag.
- **`jwt.verify` doesn't pin `algorithms`.** `token.service.ts:28` — not exploitable given a symmetric
  secret, but pin `["HS256"]` as defense-in-depth.
- **Minor mobile UX.** `MapPicker.useMyLocation` silently swallows a denied permission
  (`MapPicker.tsx:79`); `parseNum` replaces only the first comma (`util.ts:6`) so grouped comma-locale
  amounts like `1,250,00` fail to parse and grey out the CTA with no hint.

---

## Verified sound (checked, no defect)

- **Offer-loop concurrency:** guarded `updateMany` CAS on `status` + the `one_active_ride` partial-unique
  index correctly prevent double-assign / one-order-two-riders / select-vs-expiry races; covered by real
  concurrency tests.
- **Delivery OTP:** CSPRNG, HMAC-hashed, `timingSafeEqual` under `FOR UPDATE` with a 5-attempt cap and
  persisted attempt count. No brute-force / replay / bypass.
- **OTP login:** 5-attempt cap enforced, record deleted on success/lockout, per-phone/IP/global send
  caps, CSPRNG codes, hashed storage. Refresh flow rotates + revokes correctly.
- **Didit webhook:** HMAC over raw + canonical V2 body, timing-safe compare, fail-closed when
  `provider=didit` lacks a secret, 300s replay window, monotonic event-time guard, no client-trusted verdict.
- **Admin authz:** `JwtAuthGuard + AdminGuard` on every `/admin/*` route (class-level); AdminGuard fails closed.
- **Money types:** all currency columns are `NUMERIC(10,2)`/`Decimal` — no floats. `commissionOn` /
  `suggestFare` / `haversineKm` guard NaN/negative/overflow; reliability clamp + hysteresis are correct.
- **Raw SQL:** all `$queryRaw`/`$executeRaw` use parameterized tagged templates; no `*Unsafe` calls.
- **PostGIS:** GiST indexes exist and are used (`ST_DWithin`); `ST_MakePoint(lng, lat)` order correct;
  `geog` kept in sync with lat/lng in the same write.
- **Mobile:** tokens in SecureStore (never AsyncStorage/logged), buttons disable while loading (no
  double-submit), optimistic mutations roll back, sockets clean up on unmount, no hardcoded secrets.
- **Client-metrics ingest:** strict bounded zod schema + runtime cardinality cap — no injection/DoS.
