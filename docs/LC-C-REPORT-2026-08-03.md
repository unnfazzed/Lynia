# LC-C report — 2026-08-03 (offline & 2G resilience)

Fifth LC-C increment. Phase 0: no in-flight `claude/lc-c*` PR to babysit, and all five Day-0
defects (C-D0a…e) plus the first audit territory (C-T1) were already closed by prior firings —
so this run stays in **AUDIT MODE** and takes the next unchecked audit territory, **C-T2: rider
shift journey (go online → board → bid → job → proof/OTP → earnings)**.

## Method

Mapped every file on this journey (mobile screens/hooks + the API seam) with a read-only
Explore pass, then traced the full path end to end under the three adversarial conditions the
lane charter specifies: (a) every request takes 2–5s, (b) the connection dies at each step
boundary, (c) the app is killed and relaunched at each step boundary. Read every relevant file
in full rather than sampling, cross-checking claims against `docs/ARCHITECTURE.md §13`'s
concurrency-safety/idempotency inventory and `docs/KNOWN_BUGS.md` so nothing already-ledgered
got re-reported.

## Result: also reference-quality — no defect met the DEFECT bar this run

Like the customer order journey C-T1 audited on 2026-08-02, the rider shift journey's
networking already matches or exceeds the lane's audit bar (DoorDash lesson 4 — every step
retryable or explicitly unwound, no limbo states):

- **Go online / heartbeat**: `setOnline`/`sendHeartbeat` (`apps/api/src/riders/rider.service.ts`)
  are each a single guarded-CAS `UPDATE` (`WHERE account_status='active' AND on_hold=false`,
  etc.) — a 0-rows-claimed result re-derives the precise refusal reason (KYC/suspended/on_hold/
  cooldown) rather than a generic error. The 20s liveness beat treats a network failure/timeout
  as "reconnecting" (a state, not an error) — only an explicit 403 (the server having already
  cooled the rider down) flips the online switch, so a transient blip can never falsely knock a
  rider offline. A cold-GPS-fix timeout (`LOCATE_TIMEOUT_MS`) falls back to the last cached
  position rather than blocking go-online indefinitely.
- **Board**: `useRiderBoard` self-heals on every socket `connect`/`connect_error` by invalidating
  both `["openOrders"]` and `["activeJob"]` — a broadcast/expiry/taken push missed while dark
  (blip with no AppState transition) is recovered immediately rather than waiting on the next
  15s poll. `boardSubscribe`/`boardLeave` are serialized per-socket (BH-25b) against a
  loc-change racing the connect handler. `orderTaken`'s handler explicitly re-checks whether the
  taken order became the receiving rider's OWN active job before marking it "not chosen" — the
  winning rider is never told they lost.
- **Bidding**: a compose-card draft (`RIDER_BID_DRAFT_KEY`) survives an app kill and is dropped
  on restore if its 90s auction window already closed (no phantom "Accept $X" for a dead
  auction). The server's `(order_id, rider_id)` unique constraint is the idempotency backbone —
  a lost-response retry (or a restored draft's manual resubmit) hits a `P2002`/409 that the
  client reconciles by the exact error-message match into the same "your offer is in" state as a
  live success, never a stuck/ambiguous error.
- **Job lifecycle**: `advance`/`confirmDelivery`/`markUndelivered` are all guarded-CAS
  transactions server-side (`order-lifecycle.service.ts`); every one of the client's mutations
  (`advanceM`, `deliverM`, `undeliverM`, `senderRateM`) reconciles its own 409 by re-fetching the
  order and checking whether the requested transition already landed, rather than surfacing a
  scary conflict for what was actually a successful lost-response retry. `confirmAndCollect`
  persists a durable `pendingConfirm` marker to SecureStore BEFORE firing the pickup-item
  confirmation POST, self-healing a full app-kill via a reconciliation effect keyed off the live
  snapshot. The delivery-OTP attempt counter (`otpTries`) converges to the server's authoritative
  `deliveryOtpAttempts` in BOTH directions (KB-OTP-COUNT-SYNC) so a lost 401 response can never
  leave the rider shown more attempts than they actually have left. Every advance/confirm button
  is `disabled` while its mutation is pending, closing off double-tap double-fires under the 2–5s
  latency condition.
- **Earnings/wallet**: the Money tab already distinguishes "no cached balance, hard error" (full
  empty-state) from "have a cached balance, refresh failed" (an explicit "Couldn't refresh just
  now — showing your last known balance" banner) — never silently painting stale data as fresh.
  `invalidateRiderJobQueries` is the single funnel every completion path (mutation success, WS
  self-heal, foreground resume) calls to keep Trip History/Earnings/Wallet in sync (WD-022).

No defect found this run rose to the lane's DEFECT bar (lost work, dead ends, double-applies,
stale-as-fresh) — every mid-flight-kill and lost-response scenario traced either self-heals
automatically or, at worst, requires one extra tap that the server's idempotency guarantee makes
safe to repeat.

## One narrow new gap — appended to the optimization checklist, not force-fixed

**LC-C09 / C-O7**: `PickupChecklist`'s optional proof-of-pickup photo (§5c) keeps its
capture/upload state (`photoUri`, `photoBusy`, `failedPhoto`) purely in local component state —
nothing persists it. An app kill between the camera capture and the `attachPickupPhoto` POST
landing (or between a failed upload and the rider tapping "Try the photo again") silently drops
the photo, with no indication on relaunch that anything was ever attempted; the rider just sees
the fresh "Add a photo (optional)" affordance again. This is distinct from — and lower severity
than — the already-open LC-C07/C-O5 (which loses an entire acknowledgement/rating screen): here
the checklist itself, the order status, and every dollar amount are entirely unaffected, and the
photo is explicitly optional evidence that never gates "Confirm collected." Per the same bar the
lane applied to LC-C07/C-O5 and LC-C08/C-O6 (no lost work in the business sense, no dead end, no
double-apply → optimization, not a forced fix), this was appended to the Lane C checklist as
**C-O7** rather than fixed under this run's single-increment scope. `apps/mobile/src/ui/rider/
PickupChecklist.tsx:44`.

## Verification

Read-only audit — no product code changed this run (the one finding is UX-only and deliberately
deferred per lane policy). Docs-only PR: this report, the program doc's C-T2 checkbox + C-O7
checklist entry, and the `docs/KNOWN_BUGS.md` LC-C09 ledger row.

`pnpm typecheck && pnpm lint && pnpm test` run to confirm the docs-only change leaves the
monorepo green (no source files touched).
