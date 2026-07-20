# Deep sweep 2026-07-20 (deep-sweep routine)

Fresh session, branch `claude/deep-sweep-2026-07-20` based on latest `main`. This run's two real findings
come from Phase 1 (`lane-bug-hunt` agentic loop): DS20-01 from the timer-expiry lens and DS20-02 from the
adversarial-API lens, both confirmed REAL by a 3-skeptic adversarial panel (3/3, high confidence each).
Phase 1.5 (deep-sweep-owned cross-lane seams pass) traced the **"one DB column, two writers"** class
(the IR16-02 seam) across every Rider/Order counter/flag column and surfaced one LOW hardening item,
DS20-03 (`cooldownUntil`'s two independent writers). Phase 3 (adversarial raw-API pass) came back clean.

## Phase 0 — inherit history

`docs/KNOWN_BUGS.md` read in full. **Zero open `claude/*` sibling PRs at session start** (confirmed via
`mcp__github__list_pull_requests` state=open → empty result) — nothing in flight to dedupe against beyond
the ledger itself.

## Phase 0.5 — cluster-claim re-verification

Rotated to three "→ FIXED" cluster headers not re-checked in the last few runs — **Object-authz/IDOR**,
**Ship/infra correctness**, and **Money-fraud** (rotated away from Auth/identity / Notifications-FCM /
Edge/abuse, which UX-2026-07-20 just re-checked, and KYC / Mobile-journey-dead-ends, which UX-2026-07-19
checked). **All 3 INTACT/MOOT-confirmed, 0 stale claims:**

- **Object-authz/IDOR** — re-verified against current code: the self-bid block (`offers.service.ts:38-41`),
  the standing gate (`offers.service.ts:61-79`), the `listForOrder` ownership gate
  (`offers.service.ts:161-167`), and the `getSnapshot` party gate (`orders.service.ts:754-758`) — **all
  INTACT** (every id-scoped read/write still checks caller ownership server-side).
- **Ship/infra correctness** — Cloud Run request timeout, VPC connector, dedicated service account,
  keyless `signBlob`, and Workload Identity Federation config all re-read — **all INTACT**.
- **Money-fraud** — full `settlements.service.ts` re-read plus a repo-wide grep for `recordPayment` /
  `autoPause` / `markPaid` (the removed post-paid weekly-settlement engine) — **MOOT-confirmed**: none of
  those sinks exist in current code; the prepaid-per-ride model is the only commission path, every
  money-affecting field is server-computed/recomputed.

**0 stale claims, 0 regressions.**

## Phase 1 — orthogonal sweep (`lane-bug-hunt`, deep-sweep lane)

5 finder lenses fanned out over the deep-sweep lane (tx-rollback, concurrency-idempotency, authz-IDOR,
timer-expiry, adversarial-API). **2 candidates**, both confirmed REAL by a 3-skeptic adversarial panel
(3/3 REAL, high confidence each):

- **DS20-01** (timer-expiry lens) — two `STUCK_AFTER_MS` constants drifted (25 min vs 20 min).
- **DS20-02** (adversarial-API lens) — the WS `rider:location` handler skips the bounded-lat/lng
  validation every sibling REST path enforces.

## Phase 1.5 — cross-lane seams pass (deep-sweep-owned)

**Seam picked (rotation):** "a single DB column with two (or more) independent writers" — the IR16-02
class. The invariant: two writers of the same column must either be coordinated (row-locked
read-then-write, CAS, or a shared monotonic rule) or provably commutative; otherwise a later shorter/older
write silently clobbers an earlier one. Traced across every Rider/Order counter/flag column:

| Column | Writers | Discipline | Disposition |
|---|---|---|---|
| `tripsCount` | completion path | single writer, incremented under lock | RACE-SAFE |
| `ratingAvg` / `ratingCount` | `rate()` | recomputed under `lockRiderRow` | RACE-SAFE |
| `cancelStrikes` | `cancel()` | read-increment-reset under `lockRiderRow` | RACE-SAFE |
| `disputeStrikes` | issues `rider_strike` | read-increment-reset under `FOR UPDATE` | RACE-SAFE |
| **`cooldownUntil`** | **`cancel()` strike-limit + issues dispute-strike-limit** | **two independent writers, unconditional overwrite** | **GAP → DS20-03 (fixed this run)** |
| `kycAttempts` | `applyKycResult` / retry | monotonic-apply guard | RACE-SAFE |
| `accountStatus` / `suspendReason` | admin suspend/ban/lift | CAS-guarded | RACE-SAFE |
| `reliabilityScore` / `onHold` / `heldReason` | `applyReliabilityDelta` sites | clamp + hysteresis under lock (DS19-01 closed the eviction gap) | RACE-SAFE |
| `deliveryOtpAttempts` | confirm-delivery | row-lock + attempt cap | RACE-SAFE |
| `deliveryAttempts` / `undeliveredReason` / `undeliveredAt` | `markUndelivered` | single writer under CAS | RACE-SAFE |
| position / heartbeat fields | `recordFix` / heartbeat | last-writer-wins by design (freshest fix) | RACE-SAFE |

**Result:** every column RACE-SAFE (FOR UPDATE + CAS discipline holds) **except `cooldownUntil`**, whose
two independent writers only avoid clobbering each other today because their hardcoded 2-hour durations
happen to be numerically equal → **DS20-03**.

## Phase 3 — adversarial API pass

Acted as an authenticated attacker with raw API access (no client-side validation) across
wallet/orders/offers/issues/sos/privacy/uploads/admin. **Zero new gaps** — every money-affecting field is
server-computed/recomputed, every id-scoped read/write checks caller ownership, idempotency-keys and CAS
guards hold. Every candidate traced to an existing closed ledger item.

## Findings — this sweep

| ID | Description | Area | Sev | Confidence | Why past sweeps missed it |
|---|---|---|---|---|---|
| DS20-01 | Two separate `STUCK_AFTER_MS` constants governed the "stuck order" heuristic and had drifted apart. `admin.service.ts:18` declared its own `25 * 60 * 1000` (25 min), keyed off `order.updatedAt`, feeding the ops-dashboard `stuckOrders` count / `stuckOrderId` (`overview()` lines ~53/113-118/145-146). `admin.shared.ts:65` declared a SEPARATE `20 * 60 * 1000` (20 min), keyed off the last `OrderEvent.createdAt`, consumed by `admin-orders.service.ts:513` for the per-order detail page's `stuck` badge / `stuckMins`. Neither imported the other. Effect: the same order could read "stuck" on its detail page (elapsed since last OrderEvent > 20 min) while NOT appearing in the dashboard's stuck-order alert (elapsed since `updatedAt` < 25 min) — e.g. a non-status write like `attachPickupPhoto`/`confirmItems` bumps `updatedAt` without creating an `OrderEvent`, so the two clocks diverge in exactly the 20–25 min window. | `apps/api/src/admin/admin.service.ts`, `apps/api/src/admin/admin.shared.ts` | MEDIUM | High | The two constants live in different files, share a name but not a symbol, and read as belonging to two different features (a dashboard aggregate vs a detail badge). No prior sweep grepped `STUCK_AFTER_MS` across the admin module to notice there were two definitions with different values; each looked locally correct. |
| DS20-02 | The WS `@SubscribeMessage(WS_EVENTS.riderLocation)` handler (`tracking.gateway.ts:319-340`) typed `@MessageBody()` as `{ orderId; lat; lng }` — a TypeScript-only annotation with NO runtime validation. The authenticated rider's socket JSON was never `.parse()`d: the handler called `coalescePositionEmit(...)` broadcasting the raw `lat`/`lng` to the order room's `position` event BEFORE persistence, then `recordFix(user.sub, body.lat, body.lng)` with zero guard and no try/catch. Every sibling REST entry point validates the identical bounded lat/lng (`riders.controller.ts:22-31` SetOnline/Heartbeat `z.number().min(-90).max(90)` / `min(-180).max(180)`; `lifecycle.controller.ts:16-20` AttachDeliveryProof) before hitting the same `TrackingService.recordFix` sink. So a malicious/buggy rider client could stream an out-of-range or NaN fix that was broadcast live to the customer's map and persisted, unlike every REST path. | `apps/api/src/tracking/tracking.gateway.ts` (`riderLocation`) | HIGH | High | The REST controllers all validate via `ZodBody`, so the sink (`recordFix`) *looked* uniformly guarded from the REST side. The WS gateway is the one caller that reaches the sink without a `ZodBody` pipe — and the TS type annotation on `@MessageBody()` created a false sense of validation. No prior sweep enumerated every `recordFix` caller and checked each for runtime (not compile-time) bounds. |
| DS20-03 | Two independently-hardcoded 2-hour cooldown constants that today only avoid clobbering each other because they happen to be numerically equal. `order-lifecycle.service.ts:58` (`COOLDOWN_MS`, 3rd cancel-strike, used at `:800-803`) and `issues.service.ts:23` (`DISPUTE_STRIKE_COOLDOWN_MS`, 3rd dispute-strike, used at `:298`) both `2 * 60 * 60 * 1000`, neither sourced from `packages/shared/src/policy.ts` (where `RIDER_STRIKE_LIMIT` lives). Both write `riders.cooldownUntil` with an unconditional overwrite (no read of the existing value). If either is ever changed independently, whichever writer fires SECOND with the SHORTER duration would silently TRUNCATE a longer cooldown the other just set (a rider mid-dispute-cooldown who also trips a cancel-strike would have their cooldown shortened, not extended). No repro today (values equal), but no invariant enforced they stay equal or that a cooldown never shortens. | `apps/api/src/orders/order-lifecycle.service.ts`, `apps/api/src/issues/issues.service.ts` | LOW | High | Both writers pass their own literal, both are correct in isolation, and the two live in different modules deliberately kept decoupled (issues.service didn't import from the lifecycle service "to avoid pulling the whole service in for one constant" — per the code comment). The latent-clobber is only visible when you trace the shared *column* across both writers, which is exactly the Phase-1.5 seam this run picked. |

## Sibling-sweep

**DS20-01** — `grep -rn "STUCK_AFTER_MS\|25 \* 60 \* 1000\|20 \* 60 \* 1000" apps/api/src/` (excluding
specs): the stuck-threshold literal appears in **exactly these 2 files, no third occurrence**. Post-fix
disposition:

```
apps/api/src/admin/admin.shared.ts:71   export const STUCK_AFTER_MS = 20 * 60 * 1000   (THE single source of truth)
apps/api/src/admin/admin.service.ts:7   import { ..., STUCK_AFTER_MS } from "./admin.shared"   (was: own 25-min literal — FIXED)
apps/api/src/admin/admin-orders.service.ts:19  import { ..., STUCK_AFTER_MS } from "./admin.shared"   (already imported — unchanged)
```

Both call sites now reference the single `admin.shared.STUCK_AFTER_MS` (20 min — the A-04 design spec's
"~15–20 min", `DESIGN-SYSTEM-3-IMPLEMENTATION-PLAN.md:113`). The two DIFFERENT data sources
(`order.updatedAt` for the cheap dashboard aggregate vs last `OrderEvent.createdAt` for the precise detail
page) are preserved intentionally, with a one-line comment at each usage site so a future reader doesn't
"fix" the data-source difference into a new bug.

**DS20-02** — `grep -rn "@SubscribeMessage" apps/api/src/` returns **4 WS handlers**, `grep -rn
"@MessageBody" apps/api/src/` **3 body-taking handlers** (`boardLeave` takes no body). Per-hit disposition:

```
tracking.gateway.ts:200  subscribeOrder   @MessageBody body: { orderId: string }
tracking.gateway.ts:283  boardSubscribe   @MessageBody body: unknown  → BoardSubscribeEvent.parse(...)   (already validated — correct)
tracking.gateway.ts:310  boardLeave       (no body)
tracking.gateway.ts:319  riderLocation    @MessageBody body: unknown  → RiderLocationEvent.safeParse(...)  (FIXED this run)
```

- `boardSubscribe` — **already correct**: `.parse()`s the untrusted body through `BoardSubscribeEvent`
  (the shared bounded-lat/lng schema) before use.
- `subscribeOrder` — **assessed, NOT a defect of this class**: its `orderId` is not range-validated, but
  its ONLY use of the body is an ownership-checked lookup (`canAccessOrder`, a Prisma-parameterized query)
  plus a room join — there is no numeric sink that gets broadcast/persisted. A malformed value simply fails
  `canAccessOrder` → `{ error: "forbidden" }`. Left as-is (out of scope; not the garbage-broadcast/persist
  sink DS20-02 is about).
- `riderLocation` — **fixed this run**: the only handler broadcasting + persisting an unvalidated numeric
  payload.

**DS20-03** — `grep -rn "cooldownUntil:" apps/api/src/` (excluding specs): the only two `data:`-side
**writers** of `riders.cooldownUntil` are `order-lifecycle.service.ts` (cancel-strike limit) and
`issues.service.ts` (dispute-strike limit) — every other hit is a `select: { cooldownUntil: true }` read or
a type declaration. `grep -rn "2 \* 60 \* 60 \* 1000" apps/api/src/ packages/shared/src/` (excluding
specs) post-fix shows the literal exists in **exactly one place**: the new
`packages/shared/src/policy.ts:241 RIDER_STRIKE_COOLDOWN_MS`. The other duration literals in the tree
(`RECYCLE_DORMANCY_MS` 90d, `RATING_WINDOW_MS` 6h, `FEED_UNREAD_WINDOW_MS` 24h, `NOTIFY_TTL_MS` 1h) are
unrelated single-writer constants, not cooldown writers — correctly left alone.

## Fixes

- **DS20-01** — `admin.shared.STUCK_AFTER_MS` is now the single source of truth (kept at 20 min, the A-04
  design value); its doc comment records that the two consumers measure elapsed time from different data
  sources on purpose. `admin.service.ts` imports it and its local `25 * 60 * 1000` literal is deleted; a
  comment at the dashboard `stuckCutoff` and at `admin-orders.service.ts`'s detail-badge site each note the
  intentional `updatedAt`-aggregate vs `OrderEvent`-precision difference. Regression test in
  `admin.service.spec.ts`: asserts the dashboard stuck query's `updatedAt.lt` cutoff equals `now -
  STUCK_AFTER_MS` (the shared constant `admin-orders.service` also imports), and that the shared constant
  is the 20-min value — proving the drift is gone.
- **DS20-02** — added a shared `RiderLocationEvent` zod schema in `packages/shared/src/contracts.ts`
  (mirroring the existing `BoardSubscribeEvent` WS-schema pattern: `orderId` uuid + bounded lat/lng, the
  SAME bounds the REST siblings enforce, so the literal can't drift like DS20-01). The `riderLocation`
  handler now types `@MessageBody() body: unknown` and `RiderLocationEvent.safeParse(body)`s it — an
  out-of-range / NaN / malformed fix is rejected with `{ error: "invalid" }` (this gateway's error-ack
  convention) BEFORE `coalescePositionEmit`, so garbage is never broadcast or persisted; the auth check no
  longer runs on unvalidated input either. The `recordFix` call is now wrapped in try/catch (log + swallow)
  mirroring the REST heartbeat caller (`rider.service.ts:403-408`), so a persistence failure no longer
  rejects the socket handler unhandled. Regression tests in `tracking.gateway.spec.ts`: an out-of-range lat
  (999999) and a NaN lng are each rejected before any emit/persist; an in-range fix still emits + persists;
  and a `recordFix` failure now resolves `{ ok: true }` instead of rejecting.
- **DS20-03** — hoisted `RIDER_STRIKE_COOLDOWN_MS` into `packages/shared/src/policy.ts` alongside
  `RIDER_STRIKE_LIMIT`; both `order-lifecycle.service.ts` and `issues.service.ts` import it and their local
  `COOLDOWN_MS` / `DISPUTE_STRIKE_COOLDOWN_MS` literals are deleted. At both write sites, the unconditional
  `cooldownUntil: new Date(now + …)` becomes the later of the fresh window and any existing FUTURE
  `cooldownUntil` (read under the same row lock — `lockRiderRow` / `FOR UPDATE`, both already held, and the
  read-then-write stays inside the same locked transaction), so a cooldown write can never SHORTEN an
  already-active cooldown a sibling strike axis set. Also fixed the stale comment at
  `tracking.service.ts:251-252` (it claimed "an on_hold rider stays isOnline:true", made false for
  newly-tripped holds by DS19-01) — reworded to note the check is still load-bearing for PRE-EXISTING /
  legacy holds that predate DS19-01's `isOnline:false` write. Regression tests in `issues.service.spec.ts`:
  a shorter fresh cooldown does NOT shorten a longer existing future `cooldownUntil`; a fresh cooldown DOES
  extend a shorter existing one.

## Stopping rule

**2 new MEDIUM+HIGH findings this run (DS20-01 MEDIUM, DS20-02 HIGH), no CRITICAL, plus one LOW hardening
item (DS20-03)** — not padded with noise. Phase 1 raised exactly 2 candidates (both verified 3/3 real),
Phase 1.5 surfaced the single `cooldownUntil` seam, Phase 3 was clean. Consistent with the repeatedly-hunted
state of the backend-correctness lane.

`pnpm typecheck` (5 packages) + `pnpm test` (1114 API + 21 admin + 492 mobile tests) + `pnpm build`
(`@lynia/api` inclusive) all green, zero regressions.
