# Day-0 audit — Harare low-connectivity program (2026-08-01)

The bootstrap sweep for the program in `docs/plans/2026-08-01-low-connectivity-program.md`. Four
surfaces (mobile, API, admin+merchant web, infra/CI read-only) were run through a multi-agent
loop-until-dry engine: diverse Go-class/2G finder lenses → 3-skeptic adversarial verify (defects
need ≥2 "real" votes, optimizations need unanimous impact+safety) → sibling-sweep. Finders and
verifiers ran on Opus; synthesis on Fable.

## Honesty note on coverage

The sweep ran into the account's usage limit **twice** (11:40 and 16:40 UTC resets). Each surface
was resumed from cache, so **round-1 finders completed for all four surfaces** and their
candidates were adversarially verified for **infra, API, and web**. **Mobile verification did not
complete** — all of mobile's verifier agents died on the second usage limit, so mobile's 40
candidates are **found but not yet panel-verified**. They are recorded below as CANDIDATES, not
CONFIRMED, and are the LC lanes' first audit-territory work (the lanes re-run the verify step).
"0 confirmed" for mobile in the raw workflow output is an artifact of the limit, **not** a clean
result — three of the strongest mobile candidates were instead self-verified and fixed in this PR
(below).

Verification status is stated per finding. Nothing here is claimed proven that wasn't.

## Shipped in this PR (trivial Day-0 fixes, self-verified)

| ID | Finding | Fix | Evidence |
|---|---|---|---|
| LC-A01 | `apps/mobile/src/ui/fonts.ts:1` imported Inter from the package **barrel**, pulling all weights' TTFs into the Metro graph for the 3 weights actually registered. | Per-weight subpath imports (`@expo-google-fonts/inter/400Regular` etc.). JS-only, OTA-able. | `expo export` Android total **12.51 MiB → 7.13 MiB (−5.4 MB, −43%)**; Hermes bundle 6.43 MiB. `size-budget.json` ratcheted 12,690,000 → 7,850,000 (commit `9affb36`). |
| LC-A02 | `expo-localization` declared in `apps/mobile/package.json`, imported nowhere, wired into no config plugin. | Removed the dependency (EAS dormant, so no shipped fingerprint depended on it). | grep confirms zero imports; `pnpm typecheck` green. |
| LC-D01 | **Regression:** `./plugins/with-remove-ad-id` (strips `com.google.android.gms.permission.AD_ID` from the merged Android manifest — keeps the Play Data-safety "No" truthful) was dropped from `app.config.ts` `plugins[]` after commit `c2c5c17`; the plugin file survived but no longer applied. | Re-wired the plugin entry. Native manifest change → lands on next binary. | git history shows the entry present in `c2c5c17`, absent on `main`. |

## CONFIRMED findings (adversarially verified) — ledgered OPEN, first on lane checklists

Per the program's Day-0 exception (§4), confirmed defects are ledgered OPEN with an owning lane
and stand **first** on that lane's checklist; the lane's next firing fixes each with the required
regression test (and, on money/trust paths, the sensitive-lane 4-question treatment). They are
**not** fixed unattended in this bootstrap PR — several touch sensitive paths (the shared
auth/OTP Redis client; the admin wallet-credit idempotency key) where an unverified behavior
change is exactly what the doctrine forbids.

### Live-API resilience (→ LC-C, one is CRITICAL)

- **LC-C01 · CRITICAL · `apps/api/src/common/redis.ts:26`** — A Memorystore outage **hangs** the
  live API instead of degrading. `createRedisClient` sets only `maxRetriesPerRequest: null` with
  no `commandTimeout` and the default `enableOfflineQueue: true`, so a command issued while Redis
  is unreachable is queued and never rejected — every documented "best-effort / falls back"
  `try/catch` (OTP store, MicroCache L2 single-flight, geo-candidate search on the order path) is
  unreachable. Only `health.service.ts` works around it, with a 2s `Promise.race`. On BASIC-tier
  (single-node) Memorystore a restart becomes a total login+order outage, and each hung request
  holds a Cloud Run concurrency slot up to the 3600s timeout → instance saturation that persists
  after Redis recovers. Fix is app-code (not terraform): add `commandTimeout` (and evaluate
  `enableOfflineQueue: false`) so the existing fallbacks fire. **Sensitive (auth path) — LC-C
  applies the 4-question treatment + a spec asserting a command rejects rather than pends when
  disconnected.** Latent since DS15-01; ledgered CRITICAL for same-cycle fix rather than shipped
  unverified here.
- **LC-C02 · HIGH · `apps/merchant/app/lib/api-client.ts:76`** — No request timeout anywhere in
  the merchant API client (the admin client has `ADMIN_FETCH_TIMEOUT_MS = 10_000`; the mobile
  client aborts). One stalled 2G request freezes the kitchen board with the header still showing
  "Connected" and no CONNECTION LOST bar. Compounds LC-C05.
- **LC-C03 · HIGH · `apps/merchant/app/lib/api-client.ts:166`** — A transient blip or 5xx on
  `/auth/refresh` signs the merchant out of the tablet mid-shift.

### Merchant/kitchen runtime & journeys (→ LC-B / LC-D, two are CRITICAL)

- **LC-B04 · CRITICAL · `apps/merchant/app/components/KitchenConnectionProvider.tsx:112`** —
  Unmemoized context value + a tick-bumping alarm effect spin an **unbounded React render loop**
  for the entire shift (reproduced: ~273k renders in 1.5s idle, no crash/warning in a production
  build). One A53 core pegged continuously on a Go-class tablet — battery, heat, main-thread
  contention against the Accept tap. Fix: `useMemo` the value/alarm, depend on the stable
  callbacks; regression test asserting a bounded render count.
- **LC-D02 · CRITICAL · `apps/merchant/app/components/queue/NewOrderTakeover.tsx:52`** — On the
  success path `submitting` is never reset, and the takeover is rendered with no `key`, so when a
  second queued order becomes active it reuses the same instance with `submitting === true` — both
  Accept and "Can't take it" are permanently disabled. **The second of two simultaneous orders is
  physically unanswerable.** (`unavailable`/`showReject` state also leaks across the order
  boundary.) Fix: reset on success + `key={active.id}`.
- **LC-C04 · CRITICAL · `apps/merchant/app/lib/use-queue-poll.ts:31`** — The in-flight latch is
  cleared only in `finally`; with no fetch timeout a stalled request never resolves, so the latch
  sticks and every subsequent poll early-returns. The board freezes on the last-known list, the
  new-order alarm never rings, and the "Connected" pill stays green — for the whole 3-min accept
  window. Fix pairs with LC-C02 (timeout) + a self-healing latch + an independent healthz probe.
- **LC-D03 · HIGH · `apps/merchant/app/components/queue/QueueBoard.tsx:128`** — Mark-ready,
  pickup-code reveal, and cash-debt settlement are fired as bare `void promise` with no `.catch` —
  they fail silently at the counter (cooked food never announced ready; the pickup code, the only
  way to re-learn the discarded hashed code with the rider present, silently blanks).
- **LC-D04 · MEDIUM · `apps/merchant/app/lib/reachability.ts:98`** — Offline discipline is
  structurally dead on Menu/Shop/Hours/Statement (the only `reportUnreachable` producer is the
  queue poll); "Connected" never turns red there and two mutations swallow their own failures.
- **LC-D05 · MEDIUM · `apps/merchant/app/(app)/hours/page.tsx:408` (+ `menu/page.tsx`)** — Busy
  mode, back-in-stock, and starter-category taps have `try/finally` with no `catch` — they do
  nothing and say nothing when the network drops (sibling handlers on the same pages do it right).
- **LC-C05 · MEDIUM · `apps/merchant/app/lib/use-queue-poll.ts:33`** — The post-mutation refetch
  is dropped when a poll is in flight, and responses apply out-of-order with no sequencing guard —
  a stale response can resurrect an answered NEW ORDER takeover and re-ring the alarm.

### Admin console (→ LC-D, sensitive: money)

- **LC-D06 · HIGH · `apps/admin/app/components/ConfirmModal.tsx:118`** — Cancel/Escape/backdrop
  are not `pending`-guarded, and `formKey` is re-minted per open, so a dismissed-but-landed
  **wallet credit can be double-applied** and failed compliance writes render into an unmounted
  subtree (invisible). This breaks the component's own stated idempotency invariant. **Sensitive
  (money) — 4-question treatment + regression test.**
- **LC-D07 · MEDIUM · `apps/admin/app/riders/[id]/page.tsx:269`** — Money ledgers (rider wallet,
  merchant debt) silently stop at the server cap with no disclosure and no way to page back.

### Server query efficiency (→ Performance-watch lane; also speeds Go-class responses)

- **PW-LC1 · HIGH · `apps/api/src/notifications/notifications-feed.service.ts:196`** — `audit_logs`
  has no index on `target`/`action`; the feed runs 6 scans of a never-pruned, ever-growing table
  per open (the empty-result customer case scans the whole table). Fix: additive
  `CREATE INDEX CONCURRENTLY audit_logs_target_action_idx` + `@@index([target, action])`.
- **PW-LC2 · MEDIUM · `apps/api/src/merchant/food-order.service.ts:290`** — `orders.merchant_id`
  is unindexed (FK added in 0042 without an index); the 5s kitchen-queue poll sequential-scans the
  parcel-dominated orders table, and `listQueue` is uncapped with an unbounded `debtStatus:'open'`
  arm. Fix: additive `orders_merchant_id_created_at_idx` + `take` bound + split the debt arm.

> These two are additive-index migrations — safe and high-value on the live API. They are
> server-side latency/cost, which the weekly **performance watch** lane owns (program §4); tagged
> `PW-LC` so PW picks them up. LC-A may also take them under [data] (faster responses = fewer
> radio-seconds) if PW hasn't.

### Infra / CI (READ-ONLY — report + ledger only, founder applies)

- **LC-INF1 · CRITICAL · `infra/terraform/armor.tf:41`** — The always-enforced Cloud Armor rate
  limit keys on raw client IP (600/60s). Zimbabwean carriers run **CGNAT**, so thousands of
  Econet/NetOne/Telecel subscribers share one bucket — the whole carrier gets 600 req/min combined.
  At socket-down polling (~25 req/min/user, i.e. exactly on a flaky 2G link) the shared budget
  saturates at ~24 users behind one NAT IP, indiscriminately 429-ing riders mid-delivery, auctions,
  and OTP sign-ins before requests reach the app. Founder: re-key off a per-device/session header
  or exempt authenticated routes (the in-app `@Throttle` keys on the JWT already).
- **LC-INF2 · HIGH · `infra/terraform/sql.tf:22`** — Cloud SQL on a 10 GB PD_SSD is capped at
  ~300 IOPS by GCP's per-GB SSD provisioning; `disk_autoresize` won't lift it for a write-heavy
  GPS workload. Founder: raise disk size (IOPS scale with GB) or move to a provisioned-IOPS tier.
- **LC-INF3 · HIGH · `.github/workflows/release.yml:648`** — Prod Cloud Run deploys with **no
  `--max-instances`** (default 100) and **no `--concurrency`** (default 80) against a 10-conn/
  instance pool on an unflagged 1-vCPU Cloud SQL, while staging caps at 2 — unbounded autoscale can
  exhaust DB connections, and long-lived Socket.IO connections each hold a concurrency slot.
  `docs/PERFORMANCE.md` documents `max_instances=3`, the opposite of what release.yml sets — a
  doc/reality drift. Founder: set explicit `--max-instances`/`--concurrency` matched to the pool.
- **LC-INF4 · HIGH · `infra/terraform/monitoring.tf:29`** — No uptime checks; every alert policy
  is a PromQL ratio over app-emitted series that goes silent when the app is down (and is gated off
  by default). A whole-service outage pages nobody. Founder: add a black-box uptime check on
  `/healthz`. *(Additional infra candidates from round-1 finders — scheduler.tf singleton work in
  an autoscaled service; staging under-provisioned vs its load target — recorded for LC-D's infra
  territory to verify.)*

## CANDIDATES — mobile (found, verification incomplete; LC lanes verify first)

These are round-1 finder candidates whose adversarial panel did not run (usage limit). Recorded
as the LC-A/LC-B first audit-territory work; the lanes re-run verify before fixing.

- **[data] `apps/mobile/src/telemetry/rum.ts:87`** — RUM ships a ~0.9 KB POST every 10s with no
  sampling — costs more bytes than the hot-path requests it measures. (→ LC-A A-O6)
- **[data] `apps/mobile/app/food/order/[orderId].tsx:96`** — Customer food-tracking runs two
  ungated full-order polls for the whole delivery; the snapshot's live GPS defeats the 304 layer.
  No WebSocket, unlike the parcel sibling. (→ LC-A / LC-C)
- **[data] `apps/mobile/app/rider/food-job.tsx:60`** — Rider food-job runs three concurrent
  ungated polls (8s+5s+5s) for the whole delivery, unlike its socket-gated parcel sibling.
  (→ LC-A / LC-C)
- **[data] `apps/mobile/src/net/use-feature-flags.ts:45`** — Cold start pays 3 redundant config
  round trips (`/app/version-gate` duplicates a `/app/bootstrap` field; `/app/feature-flags`
  refetched per hook with no dedup). (→ LC-A / LC-B)
- **[data/runtime defect] `apps/mobile/src/api/client.ts:203`** — The conditional-GET store evicts
  hot pollers first (a 304 never refreshes recency, and full-precision board lat/lng churns a fresh
  key per GPS fix). (→ LC-B)
- **[size] `packages/shared/src/contracts.ts:5`** — zod v4 classic entry may pull i18n locale
  tables + the JSON-Schema converter into the Hermes bundle (~392 KB) — verify the reachable set.
  (→ LC-A A-T2)
- **[size] `packages/shared/src/index.ts:3`** — the `@lynia/shared` CJS barrel may ship
  test fixtures / server-only policy constants into the mobile bundle — verify. (→ LC-A A-T2)

## What the lanes do next

Each confirmed defect above is a `KNOWN_BUGS.md` OPEN row and a first-position checklist item in
its lane (`docs/plans/2026-08-01-low-connectivity-program.md` §5). The lanes fire from 03:00 UTC
(LC-A Mon–Sat), 04:00 (LC-B), 06:00 (LC-C), 07:00 (LC-D), burning these down one increment per
firing with regression tests, sensitive-lane treatment where flagged, and merge-on-green. The
Sunday Fable steer re-ranks from the evidence. Infra items (`LC-INF*`) stay OPEN for the founder
(read-only doctrine); `PW-LC*` are the performance-watch lane's.
