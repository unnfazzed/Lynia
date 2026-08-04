/**
 * B-O5: a minimum-interval gate around a socket "self-heal" REST refetch. Socket.IO's own
 * reconnection loop fires `connect`/`connect_error` repeatedly, seconds apart, while a connection
 * flaps — exactly the dead-zone profile this lane targets — and every one of `use-order-socket`/
 * `use-rider-board`/`use-rider-job-socket`'s connect handlers paid a full REST refetch per event
 * with nothing bounding the cadence. A rider or customer passing through a marginal-signal patch
 * could burn a refetch cascade every reconnection attempt instead of once for the whole episode.
 *
 * The first call always fires immediately — a fresh mount's initial self-heal shouldn't wait on
 * anything. A call within `minIntervalMs` of the last one is dropped: the refetch it would have
 * triggered is either still in flight or was just satisfied by the one that fired.
 */
export function createSelfHealGate(heal: () => void, minIntervalMs = 5000): () => void {
  let last = -Infinity;
  return () => {
    const now = Date.now();
    if (now - last < minIntervalMs) return;
    last = now;
    heal();
  };
}
