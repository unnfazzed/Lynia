# RF-05 — WebSocket gateway shared mutable state: design pass

**Status:** design decision (roadmap 3.6), **revised 2026-08-02** after RF-05a landed and the
2026-07-26 run found this doc's original step 1 undersold the entanglement of the remaining four
structures. This revision replaces the "Sequenced PRs" section below with a code-verified
classification and closes the open questions rather than deferring them again — see "What changed
in this revision."

Scopes the RF-05 refactor-ledger item — "extract the per-process maps in `tracking.gateway.ts`;
too large for one PR, needs a design pass first" — into executable, ledger-sized work items.

## The state

`tracking.gateway.ts` (870 lines) holds five in-memory, per-process structures this design pass
classifies for Redis-vs-process placement, plus a sixth (`boardOpChain`) added later by BH-25 that
is out of RF-05's scope (a same-process synchronization primitive, not routing/presence data):

| Structure | Shape | Purpose |
|---|---|---|
| `positionEmit` | `Map<room, CoalesceState>` | rate-limit rider position emits to ≤1/s per order |
| `staleNotified` | `Set<orderId>` | "already told the rider this ride's tracking went stale" (dedup) |
| `customerStaleNotified` | `Set<orderId>` | customer-side twin of the above |
| `customerPresence` | `Map<orderId, {live, darkSince}>` | is the customer watching? drives the "customer went dark" signal |
| `customerSocketOrders` | `Map<socketId, Set<orderId>>` | which orders a socket subscribed to (cleanup on disconnect) |

The gateway runs behind the `@socket.io/redis-adapter`, which fans **events** across API instances —
but these **maps live in one process's heap**. The question RF-05 asks: for each, does correctness
depend on all instances agreeing, or is per-process state fine?

## Classification

**Per-process is CORRECT — leave as-is, documented in code:**

- **`positionEmit`** — coalescing is a decision made *where the rider's location update arrives*. A
  rider's socket is pinned to one instance (sticky sessions), so every update for a given order lands
  on the same process; that process's coalesce window is the whole truth. Sharing it via Redis would
  add a network round-trip to the hottest path (per-fix) to solve a problem that can't occur.
  **RF-05a (2026-07-26) extracted this to `position-coalescer.ts`** — it was the one genuinely
  isolated structure (see "What changed" below for why the other four weren't).
- **`customerSocketOrders`** — pure per-socket bookkeeping for disconnect cleanup. A socket only ever
  exists on one instance; the map is meaningless anywhere else.

**Per-process is ACCEPTABLE but has a bounded edge — documented in code (RF-05c, this revision):**

- **`staleNotified` / `customerStaleNotified`** — dedup for a low-frequency, best-effort "tracking
  went stale" nudge. If a socket reconnects to a *different* instance mid-ride, the new process's set
  is empty, so the nudge could fire a second time. One duplicate best-effort notification on the rare
  instance-migration path is acceptable; making it exactly-once is not worth a Redis round-trip. The
  gateway's doc-comments on both fields now say this explicitly (2026-08-02), closing the "Action: a
  one-line comment" item this doc's original revision left open.

**Resolved — `customerPresence` is a cache, not an authority (2026-08-02):**

The original doc flagged this as "needs verification": if `customerPresence` were the sole basis for
a "customer went dark" decision, a customer connected to instance A would be invisible to a rider's
gateway on instance B, producing false escalations under multi-instance load. Traced every read site
in the current code:

- `scanCustomerPresence` builds its escalation `candidates` from `customerPresence`'s local
  `darkSince`, but **before actually escalating** it calls `customerLiveInRoom(orderId)` — a
  cluster-wide `server.in(room).fetchSockets()` check via the Redis adapter — and only proceeds to
  `emitPresenceStale` if that check also comes back dark (`tracking.gateway.ts:807-813`). A customer
  connected to a *different* instance is caught here: the local map says dark, the cluster-wide check
  says live, and the local state is corrected (`p.darkSince = null`, the stale-notified entry is
  cleared, the escalation claim released) instead of a false `presence:stale` going out.
- `syncCustomerPresenceToRider` (`tracking.gateway.ts:228-242`) reads `customerStaleNotified` /
  `customerPresence.darkSince` to sync a *reconnecting rider's own socket* — that socket, by
  definition, just called `subscribeOrder` on **this** instance, so there's no cross-instance read
  to get wrong here.

So `customerPresence` only ever narrows *which orders get the expensive cluster-wide check*, never
which orders get escalated — the map is a per-process candidate filter, exactly the same shape as
`staleNotified`'s "don't spam every scan" role, and the multi-instance case it exists to guard
against is provably handled by the `fetchSockets` cross-check that already sits between it and every
`emitPresenceStale` call. **No code change needed; this closes the design doc's last open question.**

## What changed in this revision (RF-05b re-scoped, not merely re-attempted)

The 2026-07-26 run found the four remaining structures materially more entangled than this doc's
original step 1 ("move the five structures + their helpers into a `tracking-presence.ts` module,
gateway calls unchanged") assumed, and left RF-05b open pending "a narrower interface, or accept the
gateway keeps this half." This revision does that follow-up design pass and picks the latter,
verified against the current code:

**Cross-boundary calls the four structures' six owning methods make**, traced line-by-line
(`handleDisconnect`, `subscribeOrder`'s presence hook + `markCustomerPresent`,
`syncCustomerPresenceToRider`, `scanPresence`, `scanCustomerPresence`, `customerLiveInRoom`,
`riderLiveInRoom`):

- **Two Socket.IO server queries** made *directly* against `this.server` (not through
  `TrackingService`): `customerLiveInRoom`/`riderLiveInRoom` both call
  `this.server.in(orderRoom(...)).fetchSockets()`. This is a live, cluster-aware transport dependency,
  not a data structure.
- **Two gateway emit methods**: `emitPresenceStale`/`emitPresenceRecovered`, called from three
  different sites (`markCustomerPresent`, `scanPresence`, `scanCustomerPresence`) at points chosen by
  the surrounding logic, not at a single well-defined "flush" boundary the way `positionCoalescer`
  had exactly one (`flushPositionEmit`).
- **Six distinct `TrackingService` calls**: `findStaleRiderPresence`, `releasePresenceEscalation`,
  `claimPresenceEscalation`, `touchRiderHeartbeat`, `filterActiveOrders`, `assignedRiderId` — each
  interleaved *inside* the same loop bodies that read/write the maps (e.g. `scanPresence`'s per-order
  loop: check `riderLiveInRoom` → maybe `touchRiderHeartbeat` + `continue` → else check
  `staleNotified` → add → `claimPresenceEscalation` → `emitPresenceStale`).

This is the actual reason a mechanical move isn't safe: RF-05a's `positionCoalescer` only ever
crossed back into gateway territory at one point (the flush callback), so extraction was "move the
map + helpers, wire one callback." Here there are ~10 distinct cross-boundary calls interleaved with
map reads/writes inside conditional branches, across two different subsystems (the Socket.IO
transport and `TrackingService`'s escalation-claim state machine) whose call *order* relative to the
map mutations is the actual logic — not incidental plumbing around it.

**Decision: the gateway keeps this half.** A narrow-interface extraction (a port with ~10 methods —
2 socket queries, 2 emits, 6 service calls) would produce an extracted "presence" module whose
constructor dependency surface is nearly as wide as the gateway's own, on the single most
bug-history-dense file in the repo (most `BH-`/`DS-` `KNOWN_BUGS.md` entries trace back to this
gateway). That's relocation-behind-an-interface, not a complexity reduction, and it carries genuine
behavior-preservation risk (subtly reordering when an escalation claim is released relative to an
emit, for instance) for a file whose correctness is presence/liveness-signal-sensitive. It fails the
routine's own bar: refactor hotspots because the change *reduces* complexity or duplication, not
because a debt-register row says "extraction" and the code has since made that expensive.

**RF-05b is downgraded from "IN-PROGRESS, needs extraction" to WONT-DO (extraction).** The four
structures + their six methods are correctly classified as gateway-resident presence-watchdog logic,
not misplaced logic waiting to move. If a future run wants to revisit this, the trigger should be a
structural one — e.g. `TrackingService` growing a proper "presence" sub-service that owns the
Redis-backed escalation-claim state machine, at which point the gateway's role narrows to
"socket-registry + emit" and the extraction boundary falls out naturally — not calendar time.

## Ledger update

RF-05 is **DONE** as of this revision: RF-05a (position-coalescing extraction, 2026-07-26), RF-05b
(re-scoped and resolved WONT-DO for extraction, 2026-08-02 — reasoned above, not a deferral), RF-05c
(per-process guarantee comments, 2026-08-02) all have a terminal disposition. No further RF-05 work
items remain open.
