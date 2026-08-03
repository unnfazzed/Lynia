# LC-A report — 2026-08-03 (size & data diet)

Audit territory `A-T4` (wire-bytes profile: trace every request+response of the customer order
journey and one rider steady-state hour, byte-estimate from the serialized shapes, set the §2
session-data budgets from evidence) swept this run; `docs/plans/2026-08-01-low-connectivity-
program.md` §5 Lane A ticked, §2's session-data budget row moved from "provisional" to
evidence-baselined targets. Zero functional defects found — every finding is a byte-diet
optimization on already-correct functionality, matching the A-T2/A-T3 precedent. Four new findings
ledgered `LC-A06`…`LC-A09`, appended to the Lane A optimization checklist as `A-O14`…`A-O17`; the
checklist was also re-ranked by measured [data] impact (A-O9 and A-O6 promoted to #4/#5). One
existing item, `A-O1`, was found already implemented in current code and ticked with citation. No
code changed in this PR; docs only.

## Method

This is a **static field-by-field trace**, not a live packet capture — every byte figure below is
derived from reading the actual request/response builders (client `apps/mobile/src/api/*` and
`apps/mobile/src/query|net|realtime/*`, server `apps/api/src/**`, wire contracts in
`packages/shared/src/contracts.ts`) and computing compact-JSON size field-by-field (a UUID string
≈42B wrapped, an ISO timestamp ≈30B wrapped, a Decimal-as-string fare ≈12B wrapped, etc. — shown
inline per finding, not asserted). Two infra facts materially shape every number:

- **gzip/brotli compression is on** for HTTP responses (`apps/api/src/main.ts:92-99`,
  `threshold: 1024`) — bodies ≥1KB compress (the code's own comment claims ~4-8×; this audit used a
  conservative 4× to keep figures on the high side), bodies <1KB ship uncompressed. **Socket.IO
  traffic is explicitly exempted** (`main.ts:90-91` — engine.io attaches to the raw HTTP server, not
  the Express middleware chain), so every WS event/GPS emit is full-size on the wire.
- **ETag conditional-GET is on** for GETs (`apps/mobile/src/api/client.ts:91-118,146-148,203-
  205,215-219`) — an unchanged body answers 304 (headers only, ~0.2KB) instead of a full
  re-download. This only helps when the body is byte-identical between polls, which turns out to
  matter a lot: several polled endpoints embed live rider GPS in the same response body being
  polled, so their weak ETag changes almost every tick and the 304 path rarely fires.

Two representative scenarios were traced, each with stated duration assumptions (see the two
sub-reports for full field-by-field arithmetic — condensed here):

## A. Customer order journey (~26-minute session: 90s auction/dispatch + 22min delivery + browse/checkout/completion)

**Parcel (WebSocket-primary tracking) ≈ 181 KB total** (172 KB response + 9.3 KB request):

| Phase | ~Bytes | Notes |
|---|---|---|
| Cold boot (bootstrap/version-gate/feature-flags/push-token) | ~1.5 KB | A-O10's already-ledgered redundant feature-flags refetch contributes here |
| Browse/create order (excl. Google Places) | ~900 B | `CREATE_RESPONSE_SELECT` (`orders.service.ts:66-75`) is a trim 7-field response — a good pattern, not a finding |
| Google Places address entry (2 waypoints, debounced) | ~9.4 KB | outside Lynia's API — **new finding LC-A09/A-O16** |
| Auction phase (90s, REST poll, 2× 15s queries) | ~8 KB | includes WS handshake |
| Active delivery (22min, WS-primary — REST fallback only self-heals a dropped socket) | ~14 KB | 132 `position` events × ~100B; dramatically cheaper than the REST-poll equivalent since there's no repeated HTTP/JWT overhead per tick |
| Completion (rating, history refetch) | ~1.2 KB | |
| RUM telemetry (A-O6, background, whole session) | ~140 KB | dominates the total; already ledgered, re-quantified here |

**Food (poll-only, no socket exists for food orders — confirmed via `food/order/[orderId].tsx:93-
94`'s own comment) ≈ 360-405 KB total for the same envelope — 7-8× the parcel cost.** The gap is
entirely the already-known `A-O9` dual-poll (`jobQ`-equivalent `useFoodOrder` at 4s/15s cadence +
`trackQ` at fixed 10s, both running concurrently once a rider is assigned) compounded by
**new finding LC-A06/A-O14**: `MerchantOrderResponse`'s 39 fields ship unconditionally on every
poll (unlike the parcel `OrderSnapshot`'s phase-gated `getSnapshot()`), and the embedded live rider
GPS busts the weak ETag on nearly every poll so the 304 path essentially never fires here.
Pre-dispatch polling (4s cadence while awaiting kitchen accept) adds a further ~45-90KB not
counted in the 22-minute active-tracking figure above.

**JWT/header overhead**: every authenticated call re-sends a ~230-300B bearer token + device-id
header. Over the parcel journey's ~35-40 round trips that's ~7-9KB of pure header tax; over the
food journey's ~200+ round trips (dominated by the dual poll) it balloons to ~40-60KB — a direct
multiplier of A-O9's poll-frequency cost that the optimization checklist entry now calls out.

## B. Rider steady-state hour (40 idle minutes + one 20-minute job leg, run separately for parcel vs food)

| Source | Idle 40min | Parcel job 20min | Food job 20min |
|---|---:|---:|---:|
| Going-online one-time + board (event-driven pushes) | ~9 KB | – | – |
| Heartbeat (20s unconditional, 180×/hr) | ~63.4 KB | – | – |
| Job-detail polling/socket | – | ~34.4 KB | **~270.9 KB** |
| RUM telemetry | ~68-324 KB (range: realistic-idle vs literal ledger figure) | (included above) | (included above) |
| Auth refresh (4×/hr, single-flight) | ~4.1 KB | – | – |
| **Hour total** | | **≈173-422 KB** | **≈422-653 KB** |

A single 20-minute food job leg (`jobQ` 8s + `foodQ` 5s, both unconditional, no socket —
`food-job.tsx:60,75`, matching `A-O9`'s already-ledgered framing) alone approaches or exceeds the
old 300 KB/h provisional target on its own, before counting anything else in the hour.

**A-O7 re-verified still live**: `use-rider-location.ts:88-91` (foreground `watchPositionAsync`)
and `background-location-task.ts:85-103` (background `startLocationUpdatesAsync`) both run at
matching 10s/25m intervals and both emit the same `rider:location` event independently — the code's
own comment confirms this is intentional-but-unmitigated ("the two run in parallel while the app is
foregrounded; matching intervals keeps that overlap free"). Measured ≈13.2 KB of pure duplicate GPS
bytes per 20-minute active-job window.

**A-O1 confirmed already implemented, not a live gap**: both `openOrders` (15s,
`apps/mobile/app/rider/(tabs)/index.tsx:467`) and `activeJob` (8s, `:247`) already set
`refetchInterval: false` whenever `board.connected` is true, falling back to the timed poll only
when the board socket is down — the intended self-heal safety-net behavior. Ticked in §5 with this
citation rather than re-implemented.

**New finding LC-A08/A-O15**: `home.tsx`'s own 30s active-order poll (customer side, not rider)
duplicates the bootstrap seed — see journey A above; ledgered once, applies whenever the customer
lingers on Home.

**New finding LC-A07/A-O17**: three independent Socket.IO connections (board/job/location) run
concurrently during an active rider job rather than multiplexed onto one connection — each pays its
own handshake and ~25s keepalive, tripling background chatter and reconnect self-heal traffic.

## §2 budget update

The old provisional targets (customer journey ≤150 KB, rider steady-state ≤300 KB/h) are now
**retired as unrealistic without A-O6/A-O9 landing first** — current evidence shows both journeys
already exceed them (parcel journey ≈181 KB vs the 150KB target; a single food job leg alone can
exceed the 300KB/h target). New evidence-based near-term targets, achievable once A-O6 (RUM
sampling, ≈68-324 KB/h alone) and A-O9 (food dual-poll, ≈94-271 KB/session) land:

- Customer parcel journey ≤120 KB
- Customer food journey ≤150 KB
- Rider steady-state hour ≤200 KB/h

§2's table in `docs/plans/2026-08-01-low-connectivity-program.md` reflects these directly.

## Checklist changes

- `A-T4` ticked with the summary above.
- `A-O9` and `A-O6` promoted to #4/#5 (were #10/#9) — quantified as the two largest [data] levers
  by a wide margin. `A-O11`/`A-O12` remain ahead since they gate the Hermes CI budget, a harder
  constraint.
- `A-O14` (LC-A06), `A-O15` (LC-A08), `A-O16` (LC-A09), `A-O17` (LC-A07) appended — new findings
  from this trace.
- `A-O1` ticked as confirmed-already-implemented, not counted as this run's optimize-mode
  increment (this firing's increment is `A-T4` itself, an audit item).
- `A-O4`/`A-O5`/`A-O7` re-confirmed still live with fresh citations/byte figures, positions
  otherwise unchanged.

## What's left

`A-T5` (native binary levers inventory) is the sole remaining unchecked audit territory — the next
Lane A firing takes it, then Lane A moves into OPTIMIZE mode starting at `A-O9` (now #4, promoted
by this run's evidence).
