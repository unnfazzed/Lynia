# LC-C report — 2026-08-03g (offline & 2G resilience)

Tenth LC-C increment. Phase 0: read `docs/plans/2026-08-01-low-connectivity-program.md` on
`main` — all five Lane C audit territories (C-T1…C-T5) are already checked, so Lane C stays in
**OPTIMIZE MODE**. Checked open `claude/*` PRs: none from this lane (`claude/lc-c*`) — no
in-flight work to babysit. Read `docs/KNOWN_BUGS.md` — LC-C08 (this run's target) was ledgered
OPEN by the 2026-08-02 C-T1 audit; LC-C09/10(fixed)/11/13/14 are untouched by this run.

Took the first unchecked Lane C optimization item: **C-O6 (LC-C08)**.

## The gap

`apps/mobile/app/order/[id].tsx`'s `selectM` mutation (the customer accepting a rider's offer)
showed the identical muted "That rider was just taken — choose another." notice for every 409
from `selectOffer`, regardless of cause. Two are conflated:

1. **Genuine race-loss** — a different offer got selected first (a double-tap, a second device, or
   the tapped rider going offline/stale between listing and selecting). The notice is correct.
2. **Lost-response retry** — the request actually landed server-side (the customer's own pick),
   but the client's response never arrived (timeout on a slow reconnect) and a client-side retry
   or the mutation's own error path re-runs into the same CAS conflict the server now reports for
   an already-resolved offer/order. The notice is actively misleading here — it tells the customer
   they lost a rider they in fact got.

`onSettled`'s unconditional `invalidateQueries` always resyncs the real order state within one
render, so this was never a stuck or incorrect END state — but on a slow reconnect the misleading
flash is real and user-perceptible, per the C-T1 audit finding.

## Fix

Mirrors the rider-side `deliverM`/`advanceM` 409-reconciliation pattern
(`apps/mobile/app/rider/job.tsx:283`, `advanceReconciled`/`deliverReconciled`-style):

- `onMutate` now looks up the tapped offer's rider `profileId` from `offersQ.data` (captured at
  mutate-time, not re-derived in `onError` — by the time a 409 comes back the offers list may
  already be invalidated/cleared) and returns it in the mutation context.
- `onError`, on a 409, checks whether the tapped offer's rider could be resolved locally. If not
  (nothing to compare against), it falls back to the old always-show-notice behavior. If it can,
  it fires a direct `getOrder(orderId)` and asks the new pure `selectOfferReconciled` whether the
  fresh snapshot shows the order landed on that SAME rider — only showing the notice when it
  didn't (a real conflict) or the reconciliation fetch itself fails (ambiguous — safe default is
  the pre-fix behavior, since a genuinely-successful pick self-heals visually via the `onSettled`
  invalidate regardless of whether the notice briefly flashed).

`selectOfferReconciled` (`apps/mobile/src/logic/order-tracking.ts`) is a small pure decision:
`false` while the order is still `open_for_offers` (nobody landed yet), `false` if a *different*
rider ended up attached, `true` only when the fresh rider matches the one that was tapped —
covering the exact CAS shape `matching.service.ts`'s `selectOffer` guards (order
status/offer status/rider-liveness).

No server-side change — `apps/api/src/offers/matching.service.ts`'s `selectOffer` CAS was already
correct and untouched; this is purely a client-side notice-accuracy fix.

## Incidental find while regression-testing: LC-C08b (HIGH — screen-crashing hook-order bug)

`order/[id].tsx` had never had a full-screen-mount regression test before this run. Building one
for C-O6 surfaced a real, independent defect: the component declared

```ts
const [rebroadcasting, setRebroadcasting] = useState(false);
```

at line 635 — **after** two conditional early returns (`if (orderQ.isLoading) return …`,
`if (!orderQ.data) return …`). That's a genuine Rules-of-Hooks violation, not a lint nit: on a
render where `orderQ.isLoading` is still true (the very first render of any mount where
`orderKey(orderId)`'s cache entry isn't already pre-seeded), the component returns before that
hook is ever called. The next render, once the fetch resolves, proceeds past both guards and DOES
call it — growing the hook count between two renders of the *same* component instance. React
treats that as a hard error ("Rendered more hooks than during the previous render"), thrown
unconditionally (not a dev-only warning) — it crashes the screen on that exact transition.

This is reachable on several real navigation paths that do **not** pre-seed `orderKey(orderId)`
before navigating:
- `apps/mobile/app/history/index.tsx:102` — tapping any row in Trip History.
- `apps/mobile/app/order/[id].tsx:250` — the F-01 rider-bail auto-redirect to a fresh order id.
- `apps/mobile/app/order/[id].tsx:1029` — the `rebroadcastedToId` "follow your re-sent request" button.
- `apps/mobile/app/(tabs)/orders.tsx:124,149` — the Orders tab list.
- `apps/mobile/src/push/push.ts` — every push-notification deep link that resolves to `/order/:id`.

The common paths that happened to avoid it: `send.tsx:521` (`qc.setQueryData` immediately before
`router.push` after creating an order) and `home.tsx`'s focused active-order write-back both
pre-seed the exact `orderKey(id)` cache entry ahead of navigating, so those mounts never see
`orderQ.isLoading === true` on the first render. That's presumably why this had gone uncaught —
it needs a genuinely cold mount to reproduce, and no test ever drove one for this screen before.

**Verified real, not a test artifact**: a from-scratch smoke test (bare mount + settle, zero
interaction with `selectM` or anything else) reproduced the crash against the pre-fix code, and
stopped reproducing once fixed.

**Fix**: hoisted `const [rebroadcasting, setRebroadcasting] = useState(false);` above both early
returns, grouped with the component's other top-level `useState` calls (next to `staleTick`). No
behavior change to `rebroadcast()` or the CTAs that use it — purely moving the hook declaration to
where it's called unconditionally on every render, like every other hook in this component.

## Regression tests

- `apps/mobile/src/logic/__tests__/order-tracking.test.ts` — 6 new unit cases for
  `selectOfferReconciled`: same-rider-landed (at `assigned` and past it), different-rider-landed,
  still-open, no-rider-attached, and the "can't resolve the tapped rider locally" fallback.
- New `apps/mobile/app/order/__tests__/select-offer-reconcile.test.tsx` — the screen's first-ever
  full-mount component test (mocks only the API/router/storage/socket edges, following
  `app/rider/__tests__/job.test.tsx`'s pattern), driving the real `selectM` mutation:
  1. **Reconciled case**: taps "Choose this rider", `selectOffer` rejects 409, a fresh `getOrder`
     shows the order now `assigned` to the SAME rider that was tapped — asserts the muted notice
     is NOT shown.
  2. **Unreconciled case**: same tap/409, but the fresh `getOrder` shows the order still
     `open_for_offers` (the tapped rider genuinely went unavailable) — asserts the notice IS
     shown. (Deliberately not "assigned to a different rider" for this case: that state removes
     the offers section — and the notice inside it — from the tree entirely once `onSettled`'s
     invalidate lands, which is correct self-healing behavior but makes for an inherently flaky
     presence assertion; "still open" exercises the same reconciliation-false branch without that
     race.)
  This same test file is also LC-C08b's regression coverage — it mounts the screen cold (no
  pre-seeded cache), exactly the condition that reproduces the hook-order crash, so both tests in
  this file independently prove the crash is gone.

## Verification

`pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm --filter mobile test` — all
green: 107 suites / 740 tests, including the 2 new component tests and 6 new unit tests
(`order-tracking.test.ts` now 39 tests). No API-side changes.

## Ledger

- `docs/KNOWN_BUGS.md`: LC-C08 marked **FIXED** (2026-08-03g); new row LC-C08b added and marked
  **FIXED** (2026-08-03g) for the incidental hook-order crash.
- `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane C: C-O6 ticked, marked **DONE
  (2026-08-03g)**, with the LC-C08b find/fix folded into the same entry (not a separate checklist
  item — it was discovered and fixed within this same increment, not deferred).

Lane C's next unchecked optimization item is C-O7 (LC-C09, `PickupChecklist`'s optional
proof-of-pickup photo durability) — left for the next firing, per the one-increment-per-run
discipline.
