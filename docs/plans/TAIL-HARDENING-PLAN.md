# Tail-hardening plan — remaining bug-hunt items

The last open findings from `docs/BUG-HUNT.md` / `docs/JOURNEY-BUGS.md` after PRs #100 and #102 (and
after #103/#104 landed the trust/safety designs + national-ID-at-registration, which closed **C12**).

## In scope

1. **R8 — durable post-pickup hand-back on reopen (P2).** When the customer cancels a job the rider has
   already picked up, and the rider's app was backgrounded (socket down), the `job:cancelled` event is
   missed; on reopen `activeForRider` returns null (a cancelled order isn't in `ACTIVE_RIDE_STATUSES`),
   so the rider sees "No active job" while holding the parcel, with no hand-back guidance.
   **Fix:** `activeForRider` also surfaces a *recently* cancelled order that this rider had collected
   (`status = cancelled`, `riderId = me`, `collectedAt != null`, `cancelledAt` within a bound), so the
   rider job screen can render the existing hand-back terminal from the snapshot. Mobile: when the
   fetched active order is `cancelled` + collected, render the hand-back (reuse the existing
   `job:cancelled` terminal), instead of "No active job".

2. **SEC-1 — `x-user-id` dev-auth fallback keyed on `NODE_ENV` (P3).** `resolveCurrentUser` accepts a
   plaintext `x-user-id` header whenever `NODE_ENV !== "production"`, read from raw `process.env`. If a
   prod deploy forgets to set `NODE_ENV=production`, that's header-only identity spoofing.
   **Fix (fail-safe):** gate the fallback on an explicit allowlist — `nodeEnv === "development" || "test"`
   — so an unset/unknown `NODE_ENV` (the misconfig) grants NO fallback. No new env var; dev/test unchanged.

3. **SEC-2 — gateway in-memory map growth (P3).** `positionEmit` keeps one `CoalesceState` per order room
   forever on the steady-state leading-edge path (fixes >1s apart never hit the cleanup branch); a slow
   leak proportional to total orders an instance has served. `customerPresence` similarly.
   **Fix:** prune stale entries on the existing presence-watchdog interval — drop `positionEmit` entries
   whose `lastEmit` is older than a bound and have no pending timer; drop `customerPresence` entries with
   no live sockets whose dark clock has aged out. Bounded memory, no behavior change.

## Out of scope / noted

- **C12 National ID** — done in #104 (`Profile.idNumber`, `updateProfile`).
- **CONCURRENTLY for future index migrations (P2-6)** — a convention, not a code change; the already-run
  0006/0007 can't be retro-fixed. Documented as a migration-authoring note, not implemented here.
- The ABSENT-mockup screens — the ongoing Claude-design work.

## Verification

Per-fix unit tests (decorator allowlist, gateway prune, `activeForRider` cancelled-handback), then the
full gate: typecheck 5/5, API + mobile tests, and CI's PostGIS migration proof (no migration here).

## GSTACK REVIEW REPORT (plan)

_Run 2026-07-06 on this branch, text-only (no designer binary; this plan is almost entirely backend)._

### gstack `/plan-design-review` — designer's eye

This is 2/3 backend hardening with **one** user-facing surface: R8's reopen hand-back. Rated only where UI exists.

| Dimension | Score | Note |
| --- | --- | --- |
| State coverage | **9** | R8 reuses the existing `job:cancelled` hand-back terminal for the reopen path, so the dead-end ("No active job" while holding a parcel) becomes a real state with warmth + a next action. Reuse over a new screen is the right call. |
| Hierarchy / copy | **8** | The hand-back copy already exists and is calm ("you still have the parcel — arrange the hand-back… doesn't affect your reliability"). No new copy invented. |
| Edge cases | **7** | Good: the reopen path is bounded to 24h and only collected orders. Gap the review flags: without `cancelled` in the reveal set, the reopened hand-back may show **no sender phone** — acceptable (the guidance stands), but worth a follow-up to reveal the sender to the assigned rider on a collected-cancel. |
| SEC-1 / SEC-2 | n/a | No UI. |

**Verdict:** design-sound; the only open question (sender-phone on the reopened hand-back) is deliberately deferred to avoid a broad `PHONE_REVEAL_STATUSES` change with privacy implications.

### gstack `/plan-eng-review` — eng-manager's eye

**Scope.** Tight, correct: three well-isolated fixes, no rewrites, C12 correctly recognised as already-done (#104).

**Architecture / correctness.**
- **SEC-1** is the strongest fix: flipping the gate from `!== "production"` to an explicit `development|test` allowlist makes an unset/unknown `NODE_ENV` **fail safe** (no header fallback), which is exactly the misconfig class. No new env var, dev/test unchanged. ✅
- **SEC-2** prunes on the existing 30s watchdog rather than adding infra; the TTL (60s quiet) is safe because a pruned entry is re-created as a fresh leading edge, so coalescing correctness is preserved. Bounds the map by currently-active rides. ✅
- **R8** reuses `getSnapshot` (already party-gated) and only surfaces a cancelled order the rider *collected*, bounded to 24h — no unbounded resurfacing.

**Edge cases / risks.**
- R8: the reopened snapshot's `counterpartyPhone` will be null (cancelled ∉ reveal). Non-blocking — the hand-back guidance doesn't require it — but note it so the "call sender" affordance simply hides.
- SEC-2: prune only removes entries with **no pending timer**, so an in-flight trailing flush is never dropped mid-window. Correct.

**Test coverage.** Each fix has a unit test (decorator allowlist incl. the misconfig branch, gateway prune keep-vs-drop, `activeForRider` hand-back fallback). Good.

**Verdict: mergeable, proceed.** No P0/P1. One tracked follow-up (reveal the sender to the assigned rider on a collected-cancel) if product wants the one-tap call on the reopen path.

<!-- work-done review summary appended after implementation -->

