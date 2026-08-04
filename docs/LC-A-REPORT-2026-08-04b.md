# LC-A report — 2026-08-04b (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O17** — three independent Socket.IO connections during an active rider job
(`LC-A07`), ranked #7 by the 2026-08-03 A-T4 wire-bytes evidence.

## What shipped

During an active rider job, three hooks each want a live socket for the SAME rider token
concurrently: the board socket (`use-rider-board.ts`, stays mounted since the `(tabs)` screen isn't
unmounted when `/rider/job` is pushed on top), the job socket (`use-rider-job-socket.ts`), and the
location-stream socket (`use-rider-location.ts`). `socket.ts`'s `createSocket()` opened a fresh
`io(...)` per call — socket.io-client v4 does **not** cache/reuse managers across calls the way v2
did — so each of the three paid its own transport handshake and ran its own independent ~25s
engine.io ping/pong keepalive, tripling both.

`socket.ts` now exports a ref-counted multiplexer instead of a bare factory:

- `acquireSocket(token)` — returns the shared `Socket` for `token`, opening a fresh `io(...)`
  connection only if none is live for that exact token yet. Every call increments a ref count.
- `releaseSocket(token, socket)` — decrements the ref count; the connection only actually
  `disconnect()`s once every acquirer has released it. Keyed by token (not one global slot) so a
  token rotation never tears down a connection a caller hasn't re-run its effect for yet — the stale
  entry just drains to 0 refs on its own.

All four realtime hooks (`use-rider-board.ts`, `use-rider-job-socket.ts`, `use-rider-location.ts`,
and `use-order-socket.ts` — the customer-side hook, routed through the same primitive for
consistency even though it's normally the sole consumer for its token) now `acquireSocket`/
`releaseSocket` instead of `createSocket`/`disconnect()`. The mechanical part of the change: every
`socket.on(event, handler)` call across the four hooks now binds a **named** handler (previously
several were inline arrows) so cleanup can call `socket.off(event, handler)` precisely — a blind
`disconnect()` in one hook's cleanup would tear the shared connection down out from under whichever
sibling hook is still using it, and a blind `socket.off(event)` (no handler arg) would remove
another hook's listener for the same event name (`"connect"`/`"disconnect"` are registered by all
three rider-side hooks).

## What was deliberately left alone

- **No server-side change.** `subscribeOrder`'s room-join is the only "join" half of the job
  socket's lifecycle; there's no matching `unsubscribe:order` event to leave it explicitly. Before
  this change, the job hook's cleanup fully disconnected its own dedicated socket, which implicitly
  left every room it had joined (Socket.IO auto-removes a disconnected socket from all rooms). After
  this change, if the board hook is still holding the shared connection when the job hook unmounts
  (the common case — a rider stays online on the board after a delivery), the order room the job
  socket joined stays joined until the shared connection eventually fully disconnects (rider goes
  offline). **Accepted, documented tradeoff, not a defect:** a terminal order (delivered/cancelled)
  emits no further `order:status`/`presence:*`/`job:cancelled` traffic to its room, so a stray
  membership costs nothing observable — no wrong UI state, no extra bytes on the wire, just an inert
  entry in the server's per-socket `rooms` Set that clears on the next full disconnect. Adding a
  real `unsubscribe:order` server event to close this precisely would be a new WS contract change,
  out of scope for a client-side connection-count optimization; noted here for a future lane pass if
  it's ever worth closing.
- **No change to which/how many rooms a socket joins**, board-geo-scoping cadence, or GPS
  coalescing — this is purely a transport-layer sharing change underneath the existing event
  contracts, not a change to what's subscribed or emitted.

## Evidence

Real byte-level wire-payload measurement (A-T4's `Buffer.byteLength(JSON.stringify(...))` style)
doesn't apply here — this isn't a JSON response-shape change, it's a transport/connection-count
change. The exactly-measured metric is **connection count**, proven by 6 new unit tests in the new
`apps/mobile/src/realtime/__tests__/socket.test.tsx` (mocking `socket.io-client`'s `io()` directly,
counting calls):

| Scenario | Result |
|---|---|
| 3 concurrent `acquireSocket("tok")` calls (board+job+location during a job) | 1 `io()` call, all 3 callers get the SAME socket instance |
| 2 of 3 acquirers release | connection stays open (not disconnected) |
| last acquirer releases | `disconnect()` fires exactly once |
| release then re-acquire the same token | a genuinely fresh `io()` connection opens (2nd call) |
| two different tokens acquired concurrently | never share a socket (2 `io()` calls) |
| a stray/mismatched release, or releasing more times than acquired | both are safe no-ops, never a double-disconnect |

Net effect during an active rider job: **3 `io()` handshakes + 3 independent ~25s engine.io
keepalive streams collapse to 1 of each** — exactly the reduction A-O17's own framing targeted
("would collapse this to one handshake + one keepalive stream"). No fabricated byte estimate is
given for the handshake/keepalive savings themselves (unlike a JSON payload, engine.io control-frame
+ handshake overhead isn't something this repo's existing tooling measures) — the connection-count
reduction is the load-bearing, exactly-verified claim.

No JS bundle-size impact: this is logic-only (no new dependencies, no new assets, same import
graph shape) — `size-budget.json` is untouched.

## Verification

- **New test file** — `apps/mobile/src/realtime/__tests__/socket.test.tsx`, 6 cases (table above).
- **Updated existing tests** — the 4 socket-consuming hook test files (`use-rider-board.test.tsx`,
  `use-rider-job-socket.test.tsx`, `use-rider-location.test.tsx`, `use-order-socket.test.tsx`) had
  their `FakeSocket` mock given an `off()` method and their `../socket` mock switched from
  `createSocket` to `acquireSocket`/`releaseSocket` — no assertions on the hooks' own behavior
  needed to change, since every existing test already only exercises one hook at a time (the shared-
  connection behavior itself is exclusively covered by the new dedicated test file).
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: all green.
  - `@lynia/api` typecheck clean (after `prisma generate` — a fresh checkout's generated client
    wasn't present yet, unrelated to this change, same note as the prior report); `@lynia/api` test:
    **97 files / 1,540 tests** pass, unaffected by this mobile-only change.
  - `@lynia/mobile` typecheck clean; `@lynia/mobile` test: **111 suites / 775 tests** pass (108 + the
    new `socket.test.tsx`'s 6 cases + 2 more tests added incidentally across the updated hook
    suites' existing assertions). One suite (`app/rider/(tabs)/__tests__/index.test.tsx`) flaked with
    a `5000ms` render timeout on the FIRST full-suite run under heavy concurrent sandbox load
    (typecheck + lint + `prisma generate` all running around the same time) — confirmed NOT a
    regression: that test mocks `use-rider-board` directly (never reaches `socket.ts`), and two
    subsequent clean re-runs of the full mobile suite (once with this diff, once with it stashed
    out) both passed it consistently.
  - `@lynia/admin`/`@lynia/merchant`/`@lynia/shared` typecheck/lint/test: unaffected, all green.
  - `oxlint` (root config): clean (one pre-existing unrelated `no-shadow` warning in
    `admin-orders.service.spec.ts`, not touched by this PR).

## Budgets and doctrine

No JS/bundle-size change — `size-budget.json` untouched. Fully OTA-able (JS-only client change, no
native/config change, no server change).

**Sensitive-lane doctrine:** the diff touches only `apps/mobile/src/realtime/*` — none of it is in
`apps/api/src/{wallet,settlements,offers,orders,matching,kyc,riders}/` or
`packages/shared/src/{policy,pricing,money}.ts`, so the four doctrine questions don't apply. Noting
anyway since the affected hooks sit adjacent to bid-acceptance/order-assignment signals (board's
`order:taken`/`bid:expired`, job's `job:cancelled`): this change touches **only the transport layer**
— which underlying `Socket` instance carries the events — never the event handlers, payload parsing,
cache-write, or business logic themselves (verified: every existing hook test, unchanged in its
assertions, still passes against the new acquire/release plumbing).

`A-O17` is marked resolved in this same PR (program doc §5, this report, `docs/KNOWN_BUGS.md`
LC-A07).
