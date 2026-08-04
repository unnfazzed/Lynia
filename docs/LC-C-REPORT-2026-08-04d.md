# LC loop C — offline & 2G resilience — 2026-08-04d

**Mode:** OPTIMIZE (all 5 audit territories C-T1…C-T5 already checked; every Day-0 defect
C-D0a…C-D0e already fixed; C-O5, C-O6, C-O7, C-O8, C-O9 already done). First unchecked checklist
item: **C-O1** (`ALR-09`).

## What shipped

`apps/mobile/src/query/client.ts` keeps mutations on the default `networkMode:"online"`
deliberately (per ALR-09's own note — a global flip to `"always"` would touch every mutation's
rollback path at once, an unreviewable blast radius). The consequence: a mutation fired while the
reachability store (`src/net/reachability.ts`) reports offline doesn't send — it **pauses**.
`isPending` stays `true` for the entire outage, exactly as it would for a request genuinely on the
wire (`isPaused` is the only bit that tells the two apart). Every mutation-driving `Button` in the
app was wired straight off `loading={mutation.isPending}`, so a tap while offline rendered the
same bare `ActivityIndicator` spinner as a real in-flight request — spinning silently, forever,
with the optimistic UI (where present) already painted, and nothing on screen distinguishing
"the server is slow" from "this hasn't even left the device."

### Fix

Two small, mechanically-applied pieces, no new abstraction beyond what the repeated pattern
already called for:

1. **`Button`** (`apps/mobile/src/ui/index.tsx`) — `loading` widens from `boolean` to
   `boolean | "queued"`. `loading==="queued"` renders a plain, honest label ("Waiting to
   reconnect…") instead of the spinner, and still disables the press target
   (`disabled={props.disabled || !!props.loading}` — unchanged shape, just coerced for the new
   union). Every intermediate component that forwards a `pending`/`busy`/`saving`/`logPending`/
   `reportPending`/`reissuing`/`loading` prop straight into a child `Button` (`DeliveryOtp`,
   `UndeliveredSheet`, `BailSheet`, `PickupChecklist`, `PickupCodeCard`, `RiderCashHandshakeCard`,
   `UnreachableCustomerCard`, `LiveTrackingCard`, `CounterOfferCard`) just widens that prop's type
   to match and forwards it unchanged — no new prop, no new branch, since the value already flows
   straight through to `Button`'s own `loading`.
2. **`pendingOrQueued(...mutations)`** (`apps/mobile/src/query/client.ts`) — a small pure helper:
   `"queued"` if any mutation in the (usually one-element) list is `isPaused`, else `true`/`false`
   from `isPending`. Every call site that used to read `mutation.isPending` (or an `||` of several
   sharing one control, e.g. accept+dispute, log-call+report) now reads
   `pendingOrQueued(mutation)`/`pendingOrQueued(m1, m2)` instead.

One component got a bespoke branch rather than the generic pass-through, because it doesn't render
a `Button` for its pending text: `RatingCard`'s `saving` prop (also widened to
`boolean | "queued"`) now shows "Waiting to reconnect — we'll save it once you're back online."
distinctly from "Saving your rating…", instead of collapsing both into the same claim.

**One additional finding, fixed the same run:** `SosControl` (`apps/mobile/src/ui/safety.tsx`) —
the emergency SOS sheet's status line branched only on `isError`/`isPending`, so opening it while
offline (no signal, the exact moment an SOS is likely to be raised) rendered "Alerting the LyniaGo
team…" for the whole outage — a false reassurance in the one flow where that lie is most costly.
The `tel:` call buttons underneath are unaffected (deliberately never gated on the mutation), but
the status text was asserting progress that hadn't started. Added an explicit `m.isPaused` branch:
"No signal right now — we'll alert our team the instant you're back online. Please call for help
below."

### Scope check (why this is the whole ALR-09 fix, not a partial pass)

`grep -rn "loading={.*\.isPending" apps/mobile/app apps/mobile/src` returns zero hits post-fix —
every `Button` in the mobile app that was driven by a mutation's `isPending` now goes through
`pendingOrQueued`. Checked `apps/merchant` and `apps/admin` for the same pattern: neither uses
`@tanstack/react-query`'s `useMutation` at all (merchant uses its own polling/fetch client,
already hardened by C-D0b…C-D0e; admin is Next.js Server Actions) — so ALR-09 was scoped to
`apps/mobile` exactly as the ledger row said, and that scope is now fully covered.

Two disabled-but-not-spinner-driven sites were deliberately left as plain `isPending` booleans,
consistent with what the rest of the app already treats as fine not to distinguish: the rate-the-
sender/rate-the-customer star rows in `apps/mobile/app/rider/job.tsx` and
`apps/mobile/app/rider/food-job.tsx` disable the stars via `disabled={xM.isPending}` with no
spinner text — a disabled star tap is not the "indefinite button spinner" ALR-09 named, and rating
is a best-effort, non-blocking action on both journeys already.

## Regression tests

- `src/query/__tests__/client.test.tsx` — new `describe("pendingOrQueued (ALR-09)")`: idle → `false`;
  genuinely pending (not paused) → `true`; paused → `"queued"`; multi-mutation combinations
  (`"queued"` wins if any is paused; otherwise `true`/`false` from the `isPending`s).
- `src/ui/__tests__/button.test.tsx` (new) — `Button` renders the plain label when idle, a spinner
  (no label) when `loading:true`, and the "Waiting to reconnect…" text with no spinner and no label
  when `loading:"queued"`; the press target is disabled in the queued state.
- `src/ui/order/__tests__/RatingCard.test.tsx` (new) — `saving:true` shows "Saving your rating…";
  `saving:"queued"` shows the reconnect cue instead (never the "Saving…" claim) and disables the
  stars; a live tap-to-rate armed *while* queued still shows its own "Submitting N★…" countdown
  (a real user action in progress takes priority over the ambient queued cue).
- `src/ui/__tests__/sos-control.test.tsx` — new `describe("SosControl offline honesty (ALR-09)")`:
  opening the sheet while `onlineManager` reports offline shows the "No signal" cue, never calls
  `raiseSos` (confirming it's genuinely paused, not a fired-and-lost request), and never renders
  the "Alerting the LyniaGo team" claim.

All four new/extended test files were run in isolation and confirmed to test the actual branch
(the `RatingCard` and `Button` "queued" assertions read the union's `"queued"` literal, which did
not exist as a valid `loading`/`saving` value before this change — passing it pre-fix would have
hit the plain-truthy branch and rendered the spinner/"Saving…" text these tests assert against).

`pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` —
114 suites / 804 tests green (was 112 suites / 789 tests before the 2 new files + extensions).
Full monorepo `pnpm typecheck && pnpm test` green (6/6 packages; API 97 files / 1540 tests).

## Ledger

- `docs/KNOWN_BUGS.md`: `ALR-09` row updated OPEN → **FIXED** (2026-08-04d, C-O1).
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: `C-O1` ticked done.

## Next Lane C checklist item

`C-O2` (central mobile fetch/retry policy: one module for timeout/retry/backoff-with-jitter tuned
for 600 ms RTT, replacing per-call-site defaults) is next in the optimization queue, followed by
`C-O4` (MicroCache serve-stale mode) and `C-O10` (mobile socket auth-callback pattern).
