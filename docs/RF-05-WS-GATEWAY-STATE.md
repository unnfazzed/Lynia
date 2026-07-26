# RF-05 — WebSocket gateway shared mutable state: design pass

**Status:** design decision (roadmap 3.6). Scopes the RF-05 refactor-ledger item — "extract the
per-process maps in `tracking.gateway.ts`; too large for one PR, needs a design pass first" — into
executable, ledger-sized PRs. No code changes here; this is the classification the extraction follows.

## The state

`tracking.gateway.ts` (828 lines) holds five in-memory, per-process structures this design pass
classifies for Redis-vs-process placement:

| Structure | Shape | Purpose |
|---|---|---|
| `positionEmit` | `Map<room, CoalesceState>` | rate-limit rider position emits to ≤1/s per order |
| `staleNotified` | `Set<orderId>` | "already told the rider this ride's tracking went stale" (dedup) |
| `customerStaleNotified` | `Set<orderId>` | customer-side twin of the above |
| `customerPresence` | `Map<orderId, {live, darkSince}>` | is the customer watching? drives the "customer went dark" signal |
| `customerSocketOrders` | `Map<socketId, Set<orderId>>` | which orders a socket subscribed to (cleanup on disconnect) |

A sixth structure, `boardOpChain` (`Map<socketId, Promise<unknown>>`, added by BH-25 to serialize a
socket's concurrent `board:subscribe`/`board:leave` calls so their `client.rooms` mutations can't
interleave), landed after this design pass. It's outside this classification's scope — it's a
same-process synchronization primitive, not routing/presence data, so the Redis-vs-process question
this doc asks doesn't apply to it.

The gateway runs behind the `@socket.io/redis-adapter`, which fans **events** across API instances —
but these **maps live in one process's heap**. The question RF-05 asks: for each, does correctness
depend on all instances agreeing, or is per-process state fine?

## Classification

**Per-process is CORRECT — leave as-is, document the reasoning (no Redis):**

- **`positionEmit`** — coalescing is a decision made *where the rider's location update arrives*. A
  rider's socket is pinned to one instance (sticky sessions), so every update for a given order lands
  on the same process; that process's coalesce window is the whole truth. Sharing it via Redis would
  add a network round-trip to the hottest path (per-fix) to solve a problem that can't occur.
- **`customerSocketOrders`** — pure per-socket bookkeeping for disconnect cleanup. A socket only ever
  exists on one instance; the map is meaningless anywhere else.

**Per-process is ACCEPTABLE but has a bounded edge — document the edge, no Redis:**

- **`staleNotified` / `customerStaleNotified`** — dedup for a low-frequency, best-effort "tracking
  went stale" nudge. If a socket reconnects to a *different* instance mid-ride, the new process's set
  is empty, so the nudge could fire a second time. One duplicate best-effort notification on the rare
  instance-migration path is acceptable; making it exactly-once is not worth a Redis round-trip.
  Action: a one-line comment recording that the at-most-once guarantee is per-process by design.

**Needs verification — the one real multi-instance question:**

- **`customerPresence`** — drives a rider-facing signal ("the customer stopped watching"). If this map
  were the *authority* on presence, a customer connected to instance A would be invisible to a rider's
  gateway on instance B, producing false "customer went dark" signals under multi-instance load. The
  code already reaches for the cluster-wide socket registry (`fetchSockets`, the same Redis adapter)
  elsewhere in the presence path — so the map appears to be a **local cache/optimization**, not the
  authority. **The extraction must confirm this**: if presence is ultimately derived from
  `fetchSockets` (cluster-wide), the map stays as a per-process cache and is safe. If any decision
  reads `customerPresence` *without* a `fetchSockets` cross-check, that read is the bug — route it
  through the cluster-wide registry (or a short-TTL Redis presence key), which is the only genuinely
  multi-instance-relevant change RF-05 contains.

## Sequenced PRs (for the refactoring routine)

1. **Extract, behaviour-preserving** — move the five structures + their helpers into a
   `tracking-presence.ts` module with a narrow typed interface (`recordEmit`, `shouldEmit`,
   `markStale`, `presenceFor`, …), gateway calls unchanged. Characterization tests on the coalesce
   window + stale-dedup first (the gateway's existing integration tests are the net). No behaviour
   change; shrinks the 828-line gateway.
2. **Verify `customerPresence` authority** — trace every read; assert (with a test) that the
   "customer went dark" decision is backed by `fetchSockets`, not the bare map. Fix only if a bare
   read drives a signal.
3. **Document the per-process guarantees** — the comments above (`positionEmit` sticky-correct;
   `staleNotified` at-most-once-per-process-by-design), so a future reader doesn't "fix" a non-bug.

Only step 2 can change behaviour, and only if the verification finds a bare-map read. Steps 1 and 3
are pure hygiene. This keeps RF-05 within the sensitive-lane rules (the gateway carries a live
heartbeat) — one small, tested PR at a time.

## Ledger update

RF-05 moves from **OPEN (needs design pass)** to **SCOPED — ready for the refactoring routine**, with
the three PRs above as its work items.
