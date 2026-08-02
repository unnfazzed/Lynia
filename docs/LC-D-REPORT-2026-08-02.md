# LC-D report — 2026-08-02 (journey & soundness sweep)

Four LC-D increments landed 2026-08-02. Per §5 Lane D's priority order, the Confirmed Day-0
defects list (fix first, one per firing, before the audit territories) had six unchecked boxes.
Firing 1 fixed D-D0a / LC-D02; firing 2 fixed D-D0b / LC-D03; firing 3 fixed D-D0c / LC-D06
(sensitive: money); firing 4 (this section) fixes D-D0d / LC-D04, leaving D-D0e..f for
subsequent firings.

## Fixed — D-D0a / LC-D02 (CRITICAL): the second of two simultaneous orders was unanswerable

**Defect.** `NewOrderTakeover` (`apps/merchant/app/components/queue/NewOrderTakeover.tsx`) is
the full-viewport NEW ORDER alarm takeover the kitchen tablet renders for `groups.awaitingAccept[0]`.
`submitAccept`/`submitReject` set `submitting` to `true` before calling `onAccept`/`onReject`, but
only reset it back to `false` in the `catch` branch — never on success. `QueueBoard` rendered
`<NewOrderTakeover active={active} .../>` with **no `key`**, so when the first order's accept
succeeded and `refetch()` advanced `active` to the second queued order, React reconciled it as an
update to the *same* component instance rather than mounting a fresh one. The stale
`submitting === true` from the first order's successful accept therefore carried straight into the
second order's render — disabling both the Accept and "Can't take it" buttons. **The second of two
simultaneous orders was physically unanswerable** until the tablet was reloaded. The same missing
`key` also leaked `unavailable` (item-level accept selections) and `showReject` (the reject sheet's
open/closed state) across the order boundary. The sibling `NoRiderHoldTakeover` had the identical
`submitting`-never-reset-on-success shape (flagged in the same audit finding).

**Fix (matches the audit's prescribed fix exactly).**
- `NewOrderTakeover.submitAccept`/`submitReject` and `NoRiderHoldTakeover.run` now call
  `setSubmitting(false)` on the success path too, not only in `catch`.
- `QueueBoard` now renders `<NewOrderTakeover key={active.id} .../>` and
  `<NoRiderHoldTakeover key={holdToShow.id} .../>` — a full remount at the order boundary, which
  resets every per-order piece of local state (`submitting`, `unavailable`, `showReject`) by
  construction instead of relying on each one being reset by hand.

**Regression test.** The merchant app (`apps/merchant`) previously had zero component-rendering
tests — only pure-logic tests under a `node` vitest environment (see
`apps/merchant/vitest.config.ts`'s prior comment). Wiring an actual regression test for this defect
class (React state surviving a prop change with no `key`) requires rendering the component tree, so
this PR adds `jsdom` + `@testing-library/react`/`@testing-library/dom` as merchant devDependencies
and a `// @vitest-environment jsdom` per-file opt-in (`.test.ts` files stay on `node`, unaffected).
The new `apps/merchant/app/components/queue/QueueBoard.test.tsx`:
- Renders `QueueBoard` inside a small harness that mimics the real page (`orders` state owned by the
  parent, `refetch` removing the just-accepted order — the same contract `QueueBoard` itself relies
  on).
- Mocks `../../lib/orders-api` so `acceptOrder` resolves without a network call.
- Simulates two queued `awaiting_accept` orders, clicks Accept on the first, waits for the
  refetch-driven re-render onto the second order, and asserts the second order's Accept button is
  **not** disabled.
- Verified this test fails on the pre-fix code (`AssertionError: expected true to be false`, i.e.
  the button stayed disabled) and passes after the fix — confirmed by temporarily stashing the three
  fix files and re-running.

**Verification:** `pnpm --filter @lynia/merchant typecheck` clean; `pnpm --filter @lynia/merchant
lint` 0 warnings/errors; `pnpm --filter @lynia/merchant test` 87/87 (86 pre-existing + 1 new)
green. Full workspace `pnpm run typecheck` (6 packages) and `pnpm run lint` (5 packages) also
green after a clean `pnpm install --frozen-lockfile=false` (matching CI's install step).

## Fixed — D-D0b / LC-D03 (HIGH): mark-ready, pickup-code reveal, and goods-back confirm fired as bare fire-and-forget promises

**Defect.** Three merchant-board mutations in the kitchen queue fired without any failure path,
so a network drop at the counter looked identical to success:
- `QueueBoard.handleMarkReady` (`apps/merchant/app/components/queue/QueueBoard.tsx:128`):
  `void markReady(orderId).then(refetch);` — no `.catch`. A rejected promise became an unhandled
  rejection; the "Mark ready" button had no busy state and nothing told the merchant the tap
  didn't register, so the natural move was to tap again (or worse, assume the order was ready when
  the server never got the update).
- `QueueBoard.handleRevealPickupCode`: had a `.finally()` to clear the loading flag but **no
  `.catch`** — a failed reveal silently reset back to the "Show pickup code" button with no error,
  as if nothing had been tried.
- `ReturnsSection`'s "Confirm the food is back" button (`onClick={() => (goodsBack ? void
  onConfirmGoodsReturned(o.id) : ...)}`) had no busy state and no `.catch` at all — unlike its
  sibling cash/non-return actions in the same file, which already route through sheet-owned
  busy/error state with a `.catch`.

**Fix.** Matches the `run()` busy+error pattern `PaymentBucketActions` (same `OrderCard.tsx`)
already uses for the payment-lane actions, applied per order:
- `QueueBoard.handleMarkReady`/`handleRevealPickupCode` are now `async` functions that `await`
  and let rejections propagate (no `void`), instead of swallowing them.
- `OrderCard` now owns local `markReadyBusy`/`markReadyError` and `pickupCode`/`revealBusy`/
  `revealError` state (previously `pickupCodes`/`revealingId` were lifted into `QueueBoard`, which
  only allowed one code reveal in flight globally and had no error slot at all). Each is wrapped in
  a small `try/catch/finally` that surfaces `err.message` under the button and disables the button
  only while its own request is in flight.
- `ReturnsSection` gained a `handleGoodsBack` helper with a `Record<orderId, string>` error map and
  a `goodsBackBusyId` — busy/error state per return card, since more than one return can be open at
  once (unlike the single-sheet cash/non-return flows).

**Regression test.** Added three cases to `QueueBoard.test.tsx` (D-D0b / LC-D03 describe block),
each forcing the underlying `orders-api` mock to reject once and asserting (a) the error message
renders and (b) the button re-enables instead of staying stuck disabled: mark-ready failure,
pickup-code reveal failure (after dismissing the `RiderSecuredTakeover`'s own on-mount reveal),
and goods-back-confirm failure.

**Verification:** full-workspace `pnpm typecheck` (6/6), `pnpm lint` (5/5, one pre-existing
unrelated warning in `apps/api/src/admin/admin-orders.service.spec.ts`), and `pnpm test`
(6/6 — 2275 tests, including the 4 `QueueBoard.test.tsx` cases) all green.

## Fixed — D-D0c / LC-D06 (HIGH, sensitive: money): admin ConfirmModal dismissal could double-apply a wallet credit

**Defect.** `ConfirmModal` (`apps/admin/app/components/ConfirmModal.tsx`) is the reason-coded
destructive/money-action dialog used across the admin console, including
`WalletActions.WalletCreditButton` (`apps/admin/app/riders/[id]/WalletActions.tsx`) — a manual
prepaid credit to a rider's commission balance. Its own doc comment states the invariant: `formKey`
is "a form-open idempotency key... fresh per modal-open," forwarded to `onConfirm` so a caller's
domain mutation (here, `creditRiderWallet`) can dedup a retried submit against the same key instead
of applying it twice. That invariant depended on the dialog being **undismissable** while a submit
was in flight — but none of its three dismiss paths (Escape, backdrop click, Cancel button) checked
that. On a slow/2G connection an operator hitting Escape (or clicking the backdrop, or clicking
Cancel) while the credit POST was still in flight closed the dialog; the trigger button's `onClick`
mints a **new** `formKey` on every genuine reopen, so retrying the credit after the accidental
dismiss used a different idempotency key than the original in-flight request. If both requests
landed, the credit applied twice. The same premature-close also meant a failed compliance/audit
write's `setError(...)` call landed on an already-closed (but still mounted) dialog — the error
banner never rendered, so a failed write silently looked like nothing happened.

**A second, more fundamental defect surfaced while writing the regression test.** The existing
guard target, `useTransition`'s `pending`, does **not** track the duration of an `async` callback
passed to `startTransition` in React 18 — `react-dom`'s `startTransition` calls `setPending(false)`
synchronously, before invoking the callback, so `pending` flips back to `false` as soon as the
callback yields at its first `await` (confirmed empirically: rendering the dialog, clicking Confirm
with an unresolved mocked `onConfirm`, and inspecting the DOM showed the Confirm button already
re-enabled with its normal label, not "Working…", well before the mocked promise resolved). Gating
the three dismiss paths on `pending` — the fix as literally specified in the audit finding — would
therefore **not** have actually closed the race: `pending` would already read `false` by the time an
operator could react, so Escape/backdrop/Cancel would still dismiss mid-flight.

**Fix.**
- Added an explicit `submitting` boolean `useState`, set to `true` synchronously in `confirm()`
  *before* `startTransition` is called (not inside the async callback), and cleared in a `finally`
  block that wraps the whole submit/await chain — so it stays `true` for the actual network-request
  lifetime, not just the transition's synchronous slice.
  `canConfirm`, the Confirm button's "Working…" label, and the Cancel button's `disabled` all now
  read `submitting` instead of `pending`.
- Escape (handled in a `keydown` listener attached once per dialog-open via `useEffect(..., [open])`)
  now no-ops while `submitting`. Since that listener's closure is only refreshed when `open` changes
  — not on every `submitting` toggle — it reads a `submittingRef` kept in sync via a separate
  `useEffect(() => { submittingRef.current = submitting }, [submitting])`, avoiding a stale-closure
  read of a mount-time `submitting` value.
  Backdrop click and Cancel's `onClick` read `submitting` directly (both are recreated every render,
  so no staleness risk there).
- `formKey` minting itself is unchanged — it was always correctly scoped to one genuine trigger-open;
  the bug was that a submit in flight could be prematurely turned into a "closed" state from which a
  new open (and new key) was reachable. Guarding all three dismiss paths on the *real* in-flight
  state closes that path.

**Regression test.** `apps/admin` had no component-rendering tests (only `node`-environment
pure-logic `*.test.ts`), so this PR wires `jsdom` + `@testing-library/react`/`@testing-library/dom`
as devDependencies and extends `apps/admin/vitest.config.ts`'s `include` to `*.test.tsx` (mirroring
`apps/merchant/vitest.config.ts`'s existing per-file `// @vitest-environment jsdom` opt-in pattern).
The new `apps/admin/app/components/ConfirmModal.test.tsx`:
- Renders `ConfirmModal` with a mocked `onConfirm` that returns a manually-controlled (never
  auto-resolving) promise, opens the dialog, fills the required amount field, and clicks Confirm.
- Asserts `onConfirm` was called exactly once, then fires Escape, a backdrop click, and a Cancel
  click — each while the mocked promise is still unresolved — and asserts the dialog (`role="dialog"`)
  is still present and `onConfirm` is still only called once after all three.
- Resolves the mocked promise and asserts the dialog closes on its own success path.
- A second case asserts Escape *does* close the dialog when nothing is in flight, so the fix doesn't
  regress ordinary dismissal.
- Verified this test fails against the pre-fix code (Escape closes the dialog unconditionally — the
  first assertion after the Escape `fireEvent` throws `Unable to find an accessible element with the
  role "dialog"`) and against an intermediate version that guards on `useTransition`'s `pending`
  instead of the new `submitting` state (same failure, empirically confirmed via a scratch debug
  test showing `pending` already `false` synchronously after the Confirm click), and passes after
  the full fix.

**Verification:** full-workspace `pnpm install --frozen-lockfile` (clean, matching CI's install
step) + `apps/api`'s `prisma generate`, then `pnpm typecheck` (6/6 packages), `pnpm lint` (5/5,
one pre-existing unrelated warning in `apps/api/src/admin/admin-orders.service.spec.ts`), and
`pnpm test` (6/6 packages — `@lynia/admin` 53/53 including the 2 new `ConfirmModal.test.tsx`
cases) all green.

**Sensitive-lane doctrine (ROUTINES.md, admin money action):**
1. **Idempotency** — `formKey`, minted once per genuine dialog-open (`crypto.randomUUID()` in the
   trigger's `onClick`) and forwarded to `onConfirm` as `idempotencyKey`; `WalletCreditButton`
   forwards it to `creditRiderWallet`, which is the caller's dedup key for the wallet-credit
   endpoint. This PR doesn't change the key's shape, only closes the path by which a submit-in-flight
   dismissal could produce two *different* keys for what the operator intended as one action.
2. **State transition** — no order-lifecycle transition involved; this is a rider commission-account
   credit, not an order-state change.
3. **Money arithmetic** — none in this diff; the modal only collects and forwards the amount string,
   the caller's server endpoint owns the arithmetic (`@lynia/shared` money seam, out of this diff's
   scope).
4. **Regression test** — `ConfirmModal.test.tsx`, described above; fails without the fix, passes with
   it.

## Fixed — D-D0d / LC-D04 (MEDIUM): offline discipline was structurally dead on Menu/Shop/Hours/Statement

**Defect.** `ReachabilityStore` (`apps/merchant/app/lib/reachability.ts`) is the single source of
truth the CONNECTION LOST bar (`ReconnectBanner`) and `actionsDisabled` (`KitchenConnectionProvider`)
read from. Before this fix, only `use-queue-poll.ts` — the kitchen queue's polling hook — ever called
`reportReachable()`/`reportUnreachable()` on it, driven by its own `listQueue()` round trips. Every
other authenticated screen (Menu, Shop, Hours, Statement) calls through `authedFetch`
(`apps/merchant/app/lib/api-client.ts`) via `menu-api.ts`/`orders-api.ts`, but `authedFetch` itself
never touched the reachability store. A connection drop while the merchant was on any of those four
screens went completely undetected by the CONNECTION LOST bar until either (a) the merchant navigated
back to the queue screen and its poll happened to fail, or (b) LC-C04's independent 20s active-probe
timer (`ACTIVE_PROBE_INTERVAL_MS`) happened to catch it — both a real user-visible lag between "the
connection is actually down" and "the app admits it." (LC-C04, landed earlier in the program, already
gave the store its own healthz-producer timer — the half of this finding's prescribed fix that's
already done; the remaining gap was purely that the other screens never fed the store on their own
request outcomes.)

The finding also named two specific swallowing mutations on those screens:
`HoursPage.onToggleBusy` and `MenuPage.onClearOos` ("Back in stock") were both a bare
`try { … } finally { … }` with **no `catch`** — a failed request left the button re-enabled with
zero indication anything went wrong, unlike every sibling mutation on the same two pages (`onSave`,
`withSheet`, `onSaveDish`, etc.), all of which already surface `err.message` into a rendered error
state.

**Fix.**
- `authedFetch` now calls `getReachabilityStore(API_BASE_URL)` once per invocation and reports:
  `reportUnreachable()` in each network-level `catch` (the initial attempt and the post-refresh
  retry), `reportReachable()` after any completed response — including a non-2xx one, since an HTTP
  error status is still proof the server was reached (mirrors the exact convention `use-queue-poll.ts`
  already used for its own calls: "status 0 is api-client's own marker for a network-level failure;
  any real HTTP response is still proof the server is reachable"). The `/auth/refresh` sub-call's own
  "transient" outcome (which conflates a network error and a live 5xx response) is deliberately left
  unreported to avoid a false-positive CONNECTION LOST flip on what might be a genuine 5xx. Since every
  authenticated mutation across the whole app — not just Menu/Shop/Hours/Statement — routes through
  this one function, wiring it here closes the class by construction instead of patching each of the
  four screens' call sites individually. `use-queue-poll.ts`'s own explicit calls are left in place
  (now redundant but harmless — `ReachabilityStore`'s `reportReachable`/`reportUnreachable` are
  no-ops when already in that state) to avoid touching its existing, separately-tested behavior.
- `HoursPage.onToggleBusy` gained a `catch` writing into a new `busyError` state, rendered directly
  under the Busy mode button (its own error slot, distinct from the existing hours-save `error`
  state, since the two actions are in visually separate cards).
- `MenuPage.onClearOos` gained a `catch` writing into a new `listError` state, rendered as a banner
  at the top of the ready-state menu list (mirrors the existing sheet-scoped `sheetError` pattern,
  just for an action with no open sheet to attach the error to).

**Regression test.**
- `api-client.test.ts`: a new describe block mocks `./reachability` (`getReachabilityStore` returns
  jest-mock `reportReachable`/`reportUnreachable`) and asserts `authedFetch` reports reachable on a
  200, reachable on a 409 domain rejection (proof a real response is reachability, not just success),
  unreachable on a `TypeError` thrown by `fetch`, and unreachable when the post-refresh retry itself
  hits a network-level failure.
- New `apps/merchant/app/(app)/hours/page.test.tsx` and `apps/merchant/app/(app)/menu/page.test.tsx`
  (jsdom + Testing Library, first component-rendering tests for either page — reused the `jsdom`/
  Testing Library setup D-D0a wired for `QueueBoard.test.tsx`) render each page with `menu-api`
  mocked, force `setBusyMode`/`clearDishOutOfStock` to reject once, and assert the inline error
  renders and the request is retryable; a second case per page asserts a successful retry clears the
  prior error. Caught and fixed a real bug in the tests themselves while writing them: mocking
  `useKitchenConnection` with an inline `() => ({ …, signOut: vi.fn() })` mints a fresh `signOut`
  function reference every render, and both pages' data-loading `useEffect` depends on `[signOut]` —
  an infinite render loop (burned CPU for minutes with zero test output before being traced and
  killed). Fixed by hoisting `signOut` to a stable `vi.fn()` outside the mock factory.

**Verification:** `pnpm --filter @lynia/merchant typecheck` clean; `pnpm --filter @lynia/merchant
lint` 0 warnings/errors; `pnpm --filter @lynia/merchant test` 119/119 (102 pre-existing + 17 new)
green. Full workspace `pnpm typecheck` (6/6 packages, after a clean `pnpm install` +
`prisma generate` matching CI's install step), `pnpm lint` (5/5, the same one pre-existing unrelated
`apps/api/src/admin/admin-orders.service.spec.ts` warning noted in every prior report this run), and
`pnpm test` (6/6 packages — 1500 API + 668 mobile + merchant/admin/design/shared) all green.

## Not done this run (Lane D's remaining Day-0 defects + audit territories)

D-D0e (`menu/page.tsx` `onCreateStarterCategory`'s deliberately-silent catch — narrowed from its
original scope now that D-D0d fixed the busy-mode/back-in-stock siblings it also named), D-D0f
(admin ledger silent truncation), and the D-T1..T5 audit territories + D-O1/D-O2 optimization
checklist all remain on the Lane D checklist
(`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D) for the next firing.
