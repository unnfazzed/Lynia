export interface PositionPayload {
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}

/** Server-side coalesce window: at most one `position` emit per order room per this interval (E3). */
export const POSITION_COALESCE_MS = 1_000;

/** A per-order coalesce entry with no fix for this long is stale (the ride ended or the rider went
 *  offline) — pruned so the map can't grow unbounded over an instance's lifetime. A later fix simply
 *  re-creates the entry as a fresh leading edge. */
export const POSITION_ROOM_TTL_MS = 60_000;

interface CoalesceState {
  lastEmit: number;
  timer?: ReturnType<typeof setTimeout>;
  pending?: PositionPayload;
}

/**
 * Server-side coalesce of position emits to ≤1 per room per POSITION_COALESCE_MS (E3). Leading edge
 * fires immediately (preserving emit-before-persist / low first-fix latency); further fixes inside the
 * window overwrite a single buffered payload that a trailing timer flushes at window end, so the
 * customer always converges on the rider's latest position without a flood.
 *
 * Extracted out of `TrackingGateway` (RF-05a): this subsystem's state (`positionEmit`) and its three
 * methods had zero interaction with the gateway's presence/customer-tracking state — only the `flush`
 * callback crosses back into gateway territory (the actual socket emit + metrics). Behavior-preserving
 * move; timing, buffering, and pruning logic are unchanged from the original `coalescePositionEmit` /
 * `flushPositionEmit` / `prunePositionRooms` gateway methods.
 */
export class PositionCoalescer {
  private readonly rooms = new Map<string, CoalesceState>();

  constructor(private readonly flush: (room: string, payload: PositionPayload) => void) {}

  /** Record a fresh fix for `room`; emits immediately on the leading edge, otherwise buffers it for
   *  the trailing flush. Never throws — a timer hiccup must not affect the caller's persist. */
  record(room: string, payload: PositionPayload): void {
    const now = Date.now();
    const state = this.rooms.get(room) ?? { lastEmit: 0 };
    if (now - state.lastEmit >= POSITION_COALESCE_MS) {
      state.lastEmit = now;
      state.pending = undefined;
      this.rooms.set(room, state);
      this.flush(room, payload);
      return;
    }
    // Inside the window: buffer the latest fix and ensure a single trailing flush is scheduled.
    state.pending = payload;
    this.rooms.set(room, state);
    if (!state.timer) {
      state.timer = setTimeout(() => {
        const s = this.rooms.get(room);
        if (!s) return;
        s.timer = undefined;
        const next = s.pending;
        s.pending = undefined;
        if (next) {
          s.lastEmit = Date.now();
          this.flush(room, next);
        } else {
          this.rooms.delete(room); // window drained with nothing buffered — release the entry
        }
      }, POSITION_COALESCE_MS - (now - state.lastEmit));
      state.timer.unref?.();
    }
  }

  /** Drop entries that have gone quiet (no fix for POSITION_ROOM_TTL_MS and no pending trailing
   *  flush) so the map is bounded by CURRENTLY-active rides, not by every ride the instance has ever
   *  served. Public for unit testing without driving real timers. */
  prune(now: number = Date.now()): void {
    for (const [room, state] of this.rooms) {
      if (!state.timer && now - state.lastEmit > POSITION_ROOM_TTL_MS) {
        this.rooms.delete(room);
      }
    }
  }

  /** Test-only peek at a room's coalesce state (mirrors the class's already-public `prune`). */
  peek(room: string): { lastEmit: number } | undefined {
    const state = this.rooms.get(room);
    return state ? { lastEmit: state.lastEmit } : undefined;
  }
}
