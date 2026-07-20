# Deep sweep 2026-07-19 (deep-sweep routine)

Fresh session, branch `claude/deep-sweep-2026-07-19` based on `origin/main` at `ef3d030`. This run's two
real findings both come from the Phase-1.5 cross-lane seams pass over **rider standing**
(`accountStatus`/`onHold`/`isOnline`/`kycStatus`) — the seam this codebase funnels through
`TrackingGateway.evictRiderFromSupply`. Phase 1 (`lane-bug-hunt` agentic loop, 5 lenses) and Phase 3
(adversarial raw-API attacker pass) both came back clean, consistent with the repeatedly-hunted state of
the backend-correctness lane.

## Phase 0 — inherit history

`docs/KNOWN_BUGS.md` read in full. No open `claude/*` sibling PRs at session start — nothing in flight to
dedupe against beyond the ledger itself.

## Phase 0.5 — cluster-claim re-verification

Rotated to two "→ FIXED" cluster headers not re-checked by the last few runs (2026-07-19 UX checked
**KYC / Object-authz-IDOR / Mobile-journey-dead-ends**; 2026-07-18-night bug-hunt checked
**Auth/identity / Data-integrity / Money-fraud**):

- **Notifications/FCM cluster** — re-verified against current code: the notify-me at-most-once claim-lock
  + delivery-set clear (KB-F18b), the `pushDestination` orderId-vs-standing routing fallback, the
  synthesized feed rows (`feedForUser` offer/account-status synthesis, KB-FEED-SYNTH), and the
  fire-and-forget `.catch`-guarded push emitters throughout `notifications.service.ts` /
  `order-lifecycle.service.ts` — **all INTACT**.
- **Edge/abuse cluster** (7 members: global `ThrottleGuard`, global exception filter, security-header
  middleware, CORS allow-list, Socket.IO CORS, 1 MB body cap, outbound fetch timeouts) — **all INTACT**.

**0 stale claims, 0 regressions.** Both cluster headers accurately describe the current code.

## Phase 1 — orthogonal sweep (`lane-bug-hunt`, deep-sweep lane)

5 finder lenses fanned out over the deep-sweep lane (backend-correctness/tx-rollback,
concurrency-idempotency, authz-IDOR, timer-expiry, adversarial-API). **Zero candidates** — every reading
path traced back to an existing, correctly-wired control already tracked in `docs/KNOWN_BUGS.md`. Nothing
survived to the adversarial-verify stage because nothing was raised.

## Phase 1.5 — cross-lane seams pass (deep-sweep-owned)

**Seam picked (rotation):** rider standing — `accountStatus`/`onHold`/`isOnline`/`kycStatus`. The invariant:
whenever a rider is *demoted* (any of these flips to a restricted state), the same write must set
`isOnline:false` AND a post-commit best-effort call must evict them from every live-supply plane (Redis geo
index + WS board rooms) via `TrackingGateway.evictRiderFromSupply` (or the `evictRiderFromGeo` +
`kickRiderFromBoard` pair it wraps); session/token revocation applies where a demotion should also cut
API access.

**Writer inventory — 14 standing writers traced across every lane:**

| # | Writer | Demotes? | Handling | Disposition |
|---|---|---|---|---|
| 1 | `admin-riders.service.ts` `suspendRider` | yes (→ suspended) | `isOnline:false` + `session.updateMany` revoke in-tx + `evictRiderFromSupply` post-commit | correct (IR16-01 / DS17-02) |
| 2 | `admin-riders.service.ts` `banRider` | yes (→ banned) | `isOnline:false` + session revoke in-tx + `evictRiderFromSupply` | correct (IR16-01 / DS17-02) |
| 3 | `admin-riders.service.ts` `liftRider` | no (re-enable) | CAS-guarded restore, no eviction needed | correct |
| 4 | `admin-riders.service.ts` `clearHold` | no (re-enable) | CAS-guarded clear of `onHold` | correct |
| 5 | `order-lifecycle.service.ts` `markUndelivered` (velocity/reliability auto-hold) | yes | `isOnline:false` (`newlyHeld`) + `evictRiderFromGeo` + `kickRiderFromBoard` | **reference implementation** (BR-01 / KB-BOARD-REVOKE) |
| 6 | `order-lifecycle.service.ts` `cancel()` **strike-limit** branch | yes (forced offline + cooldown) | `isOnline:false` + `evictRiderFromSupply` | correct (DS17-02) |
| 7 | `order-lifecycle.service.ts` `cancel()` **below-limit** branch | yes, when the `-prePickupCancel` penalty trips `onHold` | was `isOnline`-only-absent, **no eviction** | **GAP → DS19-01 (fixed this run)** |
| 8 | `order-lifecycle.service.ts` `rate()` | yes, when the `-lowRating` penalty trips `onHold` | was `isOnline`-absent, **no eviction** | **GAP → DS19-01 (fixed this run)** |
| 9 | `order-lifecycle.service.ts` `completeOrder()` | no (recovery only, raises score) | `+RECOVER_PER_COMPLETION` can never trip a hold | correct / N/A |
| 10 | `issues.service.ts` dispute-strike limit | yes (forced offline + cooldown) | `isOnline:false` + `evictRiderFromSupply` | correct (DS17-02) |
| 11 | `rider.service.ts` `applyKycResult` (KYC lapse — `failed`/`expired`) | yes | `isOnline:false` + `evictRiderFromSupply` funnel | correct |
| 12 | `rider.service.ts` `setOnline(false)` | voluntary offline | `isOnline:false` + `evictRiderFromGeo` **only**, by design | pre-existing, out of scope, previously dispositioned (DS17-02) |
| 13 | `rider.service.ts` `setOnline(true)` | no (go-online) | CAS-gated on `accountStatus:"active", onHold:false` | correct (DS14-06) |
| 14 | `privacy.service.ts` `eraseAccount` | yes (account erasure) | `isOnline:false` in-tx + session `deleteMany` in-tx, but **geo-only** eviction post-commit | **GAP → DS19-02 (fixed this run)** |

(`admin-orders.service.ts adjudicateDelivered` also touches reliability, but only recovery — raise-only,
never demotes.)

**Result:** 3 gaps + 1 flagged-not-fixed asymmetry.

- **DS19-01** (two sub-sites: writers #7 and #8) — MEDIUM. Reliability-penalty hold trips `onHold:true` but
  never forces the rider offline or evicts them.
- **DS19-02** (writer #14) — LOW. Account erasure evicts the geo plane but not the board plane.
- **KB-HOLD-SESSION-SCOPE** — flagged-not-fixed asymmetry (see below): session/token revocation on demotion
  is implemented only for admin suspend/ban; `auth.service.ts refresh()` re-checks only `accountStatus`,
  never `onHold`/`kycStatus`, so a velocity-held or KYC-lapsed rider keeps full API access (incl. token
  refresh) indefinitely. **Not a proven defect** — plausibly intentional (a held/lapsed rider may need to
  stay logged in to retry KYC, contact support, or finish an active delivery). Logged OPEN for a product
  decision; no speculative code change made.

## Phase 3 — adversarial API pass

Acted as an authenticated attacker with raw API access (no client-side validation) across
orders/offers/wallet/riders/kyc/auth/issues/reports/sos/notifications/uploads. Fare/commission manipulation
(the WD-005 post-CAS `agreedFare` re-read, WD-012 commission-basis floor, the `chargeCommission` one-debit
uniqueness), IDOR (the party/ownership gates on `getSnapshot`/`listForOrder`, the pickup/delivery-proof key
namespacing), TOCTOU/replay (the offer `FOR UPDATE`, the delivery-OTP row-lock + attempt cap, the KYC
monotonic-apply guard, the DS18-04 erasure/KYC CAS re-assertions), and gate-bypass classes (the offers
standing gate, KYC gating, DS15-02 erasure standing gate) all held. **Zero new gaps** — every candidate
traced to an existing closed ledger item.

## Findings — this sweep

| ID | Description | Area | Sev | Confidence | Why past sweeps missed it |
|---|---|---|---|---|---|
| DS19-01 | Two sibling call sites of `applyReliabilityDelta` trip `onHold:true` (score below `RELIABILITY.ON_HOLD_BELOW`) without following the standing-demotion invariant the rest of the codebase enforces — no `isOnline:false` in the same write, no post-commit supply-plane eviction. **(a)** `rate()`'s customer-rating flow (`order-lifecycle.service.ts` ~line 620-642): a low rating (`<= LOW_RATING_AT`) from a trusted/distinct-pair customer can push the score below the hold threshold; the `tx.rider.update` writes `{...reliability}` only. **(b)** `cancel()`'s below-strike-limit branch (~line 810-822): a 1st/2nd pre-pickup cancel's `-prePickupCancel` penalty can cross the threshold; the `else` branch writes `{cancelStrikes, ...reliability}` only. Either flips `onHold:true` in the DB while `isOnline` stays `true` and the rider keeps their board rooms + `rider:geo` entry indefinitely (until an admin clears the hold or they go offline themselves) — inflating the admin online-rider count and leaving a live GEOSEARCH/board ghost, even though `offers.service.ts`'s standing gate already blocks them from bidding. | `apps/api/src/orders/order-lifecycle.service.ts` (`rate`, `cancel`) | MEDIUM | High | The reference implementation (`markUndelivered`'s `newlyHeld` pattern) and the two DS17-02 strike-limit paths all evict correctly, and every prior standing sweep checked *those* paths by name — but the reliability-hold-as-a-side-effect-of-rating/below-limit-cancel sub-sites are the two writers where the hold is incidental to the primary action (rate a delivery / count a strike), not the primary action itself, so they read as "rating" / "strike" code, not "demotion" code. No prior sweep re-derived "every `applyReliabilityDelta` call site can trip a hold" and grepped all three. |
| DS19-02 | On a rider's own account erasure, the post-commit best-effort eviction calls only `this.gateway?.evictRiderFromGeo(profileId)` — never `kickRiderFromBoard`. Sessions ARE revoked in-transaction (`session.deleteMany`), but an already-open WebSocket (authenticated at handshake, independent of the now-deleted session row) keeps its board-room subscriptions until it disconnects on its own. Every other demotion path (admin suspend/ban, KYC-lapse, auto-hold, cancel/dispute-strike limits) evicts BOTH planes via `evictRiderFromSupply`; erasure is geo-only — a funnel bypass. | `apps/api/src/privacy/privacy.service.ts` (~line 384-388) | LOW | High | The DS15-05 geo-eviction on erasure predates the KB-BOARD-REVOKE board-kick + the `evictRiderFromSupply` funnel that unified both planes; when the funnel was introduced (and every other demotion path migrated onto it), the erasure call site was left on the older geo-only shape. A column/method grep for `evictRiderFromGeo(` surfaced it as the sole standalone (unpaired) caller outside the funnel's own internals. |

## Sibling-sweep

**DS19-01** — `grep -rn "applyReliabilityDelta" apps/api/src` returns exactly 3 call sites in service code
(plus the definition, `admin-orders.service.ts`'s recovery-only use, and spec files). Disposition:

- `apps/api/src/orders/order-lifecycle.service.ts:487` (`markUndelivered`) — **already correct** (the
  reference `newlyHeld` + `isOnline:false` + `evictRiderFromGeo`/`kickRiderFromBoard` implementation).
- `apps/api/src/orders/order-lifecycle.service.ts:628` (`rate`) — **fixed this run** (sub-site a).
- `apps/api/src/orders/order-lifecycle.service.ts:786` (`cancel`, below-limit branch) — **fixed this run**
  (sub-site b).
- `apps/api/src/admin/admin-orders.service.ts:241` (`adjudicateDelivered`) — **not a sibling**: applies
  `RECOVER_PER_COMPLETION` (recovery only, raises the score) — a recovery can never *trip* a hold, only
  clear one; there's no demotion to evict for.
- `apps/api/src/orders/order-lifecycle.service.ts:993` (`completeOrder`) and `:487`'s recovery peers —
  recovery paths, same reasoning: raise-only, no demotion.

```
apps/api/src/admin/admin-orders.service.ts:241  (recovery — not a sibling)
apps/api/src/orders/order-lifecycle.service.ts:487  (markUndelivered — already correct)
apps/api/src/orders/order-lifecycle.service.ts:628  (rate — FIXED)
apps/api/src/orders/order-lifecycle.service.ts:786  (cancel below-limit — FIXED)
apps/api/src/orders/order-lifecycle.service.ts:993  (completeOrder recovery — not a sibling)
```

**DS19-02** — `grep -rn "evictRiderFromGeo(" apps/api/src --include=*.ts` (excluding specs) surfaces:

```
apps/api/src/orders/order-lifecycle.service.ts:528  (markUndelivered auto-hold — PAIRED with kickRiderFromBoard right below at :535 — correct)
apps/api/src/tracking/tracking.gateway.ts:414       (the funnel's own definition; :464 the internal call inside evictRiderFromSupply — not a caller)
apps/api/src/privacy/privacy.service.ts:391         (the sole STANDALONE/unpaired caller — FIXED this run → evictRiderFromSupply)
```

Disposition:
- `order-lifecycle.service.ts:528` — already paired with `kickRiderFromBoard(:535)`, so both planes are
  covered; correct, left as-is.
- `tracking.gateway.ts:414/464` — the funnel's own internals, not a demotion call site.
- `rider.service.ts` `setOnline(false)` voluntary-offline path calls `evictRiderFromGeo` alone **by design**
  — a voluntary go-offline doesn't need a board-kick the way a forced demotion does. Dispositioned as
  correct by a prior sweep (**DS17-02**). **Pre-existing, out of scope, previously dispositioned** — not
  touched this run.
- `privacy.service.ts:391` — **fixed this run**: swapped the geo-only `evictRiderFromGeo(profileId)` for the
  `evictRiderFromSupply(profileId)` funnel (evicts geo + board), keeping the same optional-gateway /
  best-effort / `.catch`-guarded / never-throws shape.

## Fixes

Both fixes mirror the existing `markUndelivered` / cancel-strike-limit patterns exactly; each carries
regression tests that would have caught the gap.

- **DS19-01** — `rate()`: before its `tx.rider.update`, compute
  `newlyHeld = "onHold" in reliability && reliability.onHold === true && !rider.onHold` (the `in` check
  because `reliability` is `{}` when the rating carries no weight), add `isOnline:false` to that same write
  when `newlyHeld`, capture the rider id in a new outer-scope `newlyHeldRiderId`, and add a post-commit
  best-effort `evictRiderFromSupply(newlyHeldRiderId)` (the service had no prior post-commit block).
  `cancel()`'s below-limit `else` branch: compute
  `newlyHeld = reliability.onHold === true && !(rider?.onHold ?? false)`, add `isOnline:false` when
  `newlyHeld`, capture into a new outer-scope `reliabilityHoldRiderId`, and evict it in a second post-commit
  guard alongside the existing `strikeLimitRiderId` block (the two are mutually exclusive — a cancel hits
  exactly one branch). Tests in `order-lifecycle.service.spec.ts`: a `rate()` positive (68 → 58 trips
  `onHold`, asserts `isOnline:false` + `evictedFromSupply == ["r1"]`) plus two negatives (a good rating that
  doesn't cross; an untrusted-customer rating where `reliability` stays `{}`); a `cancel()` positive (strike
  2, 63 → 58 trips, same assertions) plus a below-limit negative (80 → 75, no demotion).
- **DS19-02** — `privacy.service.ts eraseAccount`'s post-commit rider block now calls
  `this.gateway?.evictRiderFromSupply(profileId)` (both planes) in place of the geo-only
  `evictRiderFromGeo`. Tests in `privacy.service.spec.ts`: the existing geo-eviction assertion updated to
  assert the funnel is called with the rider's id, and the non-rider negative confirms a plain customer's
  erasure calls no supply-eviction method.

## Stopping rule

Two new findings this run — **one MEDIUM (DS19-01), one LOW (DS19-02)**; **zero CRITICAL/HIGH** from Phase 1
+ Phase 1.5 + Phase 3. Consistent with the repeatedly-hunted state of the backend-correctness lane, so the
run was not padded with LOW-severity noise beyond these two. One asymmetry (KB-HOLD-SESSION-SCOPE) logged
OPEN for a product decision rather than fixed speculatively.

`pnpm typecheck` (5 packages) + `pnpm test` (1070 API tests + 449 mobile tests) + `pnpm --filter @lynia/api
build` all green, zero regressions.
