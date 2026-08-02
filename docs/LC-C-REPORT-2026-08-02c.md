# LC-C report — 2026-08-02c (offline & 2G resilience)

Fourth LC-C increment. Phase 0: no in-flight `claude/lc-c*` PR to babysit, and all five Day-0
defects (C-D0a…e) were already fixed by prior firings — so this run moves into **AUDIT MODE**
and takes the first unchecked audit territory, **C-T1: customer order journey (create → auction
→ accept → tracking → delivery code)**.

## Method

Traced the full journey across `apps/mobile` (customer + rider screens/hooks) and the
`apps/api` server seam, under the three adversarial conditions the lane charter specifies:
(a) every request takes 2–5s, (b) the connection dies at each step boundary, (c) the app is
killed and relaunched at each step boundary. Read every relevant file end to end rather than
sampling — this is the first pass over this journey, so nothing was assumed "probably fine."

## Result: this journey is largely reference-quality already

Unlike the merchant queue-poll surface LC-C02/C04/C05 fixed (which had zero request timeouts and
a plain "skip if busy" latch), the customer order journey's networking already matches or
exceeds that bar, just expressed through React Query's primitives instead of hand-rolled
latch/generation classes:

- **Create**: a durable idempotency nonce (persisted with the draft) derives a stable dedup key;
  the server checks it pre-write AND falls back to a partial unique index + `P2002` catch on a
  genuine race — a timeout+retry, a double-tap, or an app kill-and-relaunch retry all dedupe to
  the same order instead of opening a second auction. A 15s bounded request timeout
  (`REQUEST_TIMEOUT_MS`) means a stalled 2G link fails clean instead of hanging.
- **Auction (~90s window)**: driven entirely server-side (a BullMQ job + a 2-minute DB
  reconciler sweep), so the auction resolves correctly regardless of whether the customer's app
  is even open. The client redundantly covers the window with a live socket, an unconditional
  15s poll fallback, and a foreground-refetch — plus a durable `hadOffers` counter so a cold
  start into an already-expired auction shows an honest "riders did offer, the window closed"
  instead of a false "no riders took this price."
- **Accept an offer**: a transactional CAS (`updateMany` gated on `status = open_for_offers`)
  makes a double-accept or a retry-after-success structurally impossible; a lost response is
  covered by an unconditional post-mutation cache invalidate (so the true state always wins) and
  a dedicated "your hand-off code isn't showing — tap to re-issue" fallback for the one-time
  delivery code.
- **Live tracking**: an explicit staleness threshold (`PRESENCE_ESCALATION_MS` = 120s) visibly
  dims the rider pin and suppresses the ETA rather than ever painting a stale position as live,
  plus a dedicated out-of-order-write guard (`lastPositionRef`) so a REST snapshot that resolves
  after a fresher WS position push can't roll the map pin backward.
  Dual reconnect paths (socket `connect` handler + `AppState`-driven foreground refetch) both
  force a full catch-up snapshot after a drop/background stretch.
- **Delivery code confirmation**: `SELECT … FOR UPDATE` + a CAS guard on `status` makes the
  transition itself idempotent — a duplicate POST (lost-response retry) can never re-fire
  `delivered` or double-apply any side effect. The rider client explicitly reconciles a 409 by
  re-checking the order's true state before treating it as a real failure, rather than assuming
  the worst.

## Fixed this run — LC-C06 (MEDIUM): draft-flush race could open a duplicate auction

**Defect.** `apps/mobile/app/send.tsx`'s compose screen persists a PII-free draft debounced
500ms after the last field edit — the draft's `idempotencyNonce`, combined with the *live*
field values, is exactly what a killed-and-relaunched app recomputes its create-order dedup key
from on a manual resubmit. `submit()` fired `createOrder()` straight off in-memory state without
first flushing that debounced write. If a field was edited within the trailing 500ms window and
the customer immediately tapped "Send to riders," the request went out correctly (built from
fresh in-memory state) — but the *on-disk* draft still reflected the pre-edit content. An app
kill in that narrow window, followed by a manual resubmit after relaunch, would recompute a
DIFFERENT idempotencyKey than the one actually sent (same nonce, different content hash) —
missing the server's dedup entirely and opening a SECOND live auction for a parcel the customer
intended to send only once.

**Fix** (`apps/mobile/app/send.tsx`, `submit()`): right before firing `createOrder()`, cancel any
pending debounce timer and synchronously `await saveDraft(...)` with the exact field values about
to be submitted. This doesn't just narrow the window — it closes it: the on-disk draft is
guaranteed to match the submitted content in every case, not only after the debounce settles.

**Verification.** New `apps/mobile/app/__tests__/send.test.tsx`: renders the real compose screen
(mocking only the native map widget, address search, and the API/storage edges — the same
pattern `food/order/__tests__/order-screen.test.tsx` and `(tabs)/__tests__/home.test.tsx` use),
drops pins, fills the required fields, edits the price, and immediately taps "Send to riders"
with `createOrder` held pending (never resolving — standing in for "the app could be killed at
any moment now, before any response is processed"). Asserts the mocked SecureStore has already
been written with the submitted price by the time `createOrder` is called. Confirmed failing
against the pre-fix code (`git stash` the fix, re-run: `expected mockSetItemAsync to have been
called >= 1 times, received 0`) before confirming it passes with the fix applied.

## Two narrower gaps found — appended to the optimization checklist, not force-fixed

Per the lane's audit-bar (DoorDash lesson 4 — no limbo states) and universal policy 2 (fix every
defect this run), both of these were evaluated against the defect bar (lost work, dead ends,
double-applies, stale-as-fresh) and judged to fall short of it — neither loses data, double-
charges, or gets the user stuck — so both are UX/consistency gaps appended to the Lane C
checklist rather than force-fixed under this run's single-increment scope:

- **LC-C07 / C-O5**: the rider's durable "delivered" terminal marker
  (`saveRiderJobTerminal`, `apps/mobile/app/rider/job.tsx:305`) is written only after
  `confirmDelivery`'s response (success or 409-reconciled) is processed. An app kill strictly
  between sending the request and receiving any response drops the delivered-acknowledgement /
  rate-the-sender screen on relaunch — the order is correctly `delivered` server-side (CAS-
  guarded, visible in Trip History) and nothing is silently lost, but the rider sees "No active
  job" instead of a confirmation. Fixing this properly means writing a *provisional* local marker
  before the request fires (promoted to final on success, rolled back only on a definitive
  non-409 rejection) — a small but real change to `reconcileRiderJobTerminal()`'s contract that
  deserves its own focused run rather than being rushed in alongside LC-C06.
- **LC-C08 / C-O6**: `order/[id].tsx`'s `selectM` (accept-an-offer) mutation's `onError` shows
  the identical muted "that rider was just taken" notice for both a genuine race-loss 409 and a
  lost-response case where the customer's own pick actually landed. It self-heals within one
  render via `onSettled`'s unconditional invalidate — never a stuck or incorrect end state — but
  a slower reconnect could make the misleading flash user-perceptible. The fix (reconcile the 409
  by re-fetching and checking whether the requested rider actually got assigned, mirroring the
  rider-side `deliverM`/`advanceM` pattern) is straightforward but is sequenced as its own
  checklist item rather than bundled into this run's single-defect scope.

Both are ledgered OPEN in `docs/KNOWN_BUGS.md` (LC-C07, LC-C08) and appended to the program doc's
Lane C optimization checklist as C-O5/C-O6.

## Verification (whole repo)

- `pnpm --filter api exec prisma generate` (ungenerated Prisma client, same recurring
  environment gap the prior two LC-C reports noted — unrelated to this change).
- `pnpm typecheck` — clean across all workspaces.
- `pnpm lint` — clean.
- `pnpm test` — full suite green, including the new `send.test.tsx` (1 new test, confirmed
  failing pre-fix / passing post-fix per above).

## Not done this run (LC-C's scheduled work)

C-T1 is ticked. C-T2 (rider shift journey), C-T3 (onboarding/KYC), C-T4 (merchant intake), and
C-T5 (reconnect semantics across all realtime hooks) remain unchecked — the next firing starts
AUDIT MODE at C-T2. C-O1…C-O6 remain on the optimization checklist for after the audit territory
is exhausted.
