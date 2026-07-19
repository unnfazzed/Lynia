/**
 * A tiny read-through TTL cache with single-flight loading — the smallest useful slice of the
 * "transparent proxy cache" pattern DoorDash runs in front of its services (request-coalescing +
 * short TTLs + bounded size), sized for this API's needs: shaving repeated hot reads (e.g. the
 * PostGIS nearby-rider count every open-auction snapshot poll recomputes) without a Redis hop or a
 * new dependency.
 *
 * Semantics, chosen deliberately:
 *  - **Single-flight**: concurrent callers for the same key share ONE in-flight loader promise, so a
 *    poll herd can't stampede the database with identical queries (the classic cache-stampede guard).
 *  - **Errors are never cached**: a rejected loader clears the in-flight slot and propagates, so a
 *    transient DB blip is retried by the next caller instead of pinning a failure for a whole TTL.
 *  - **Bounded**: at `maxEntries` the oldest entry is evicted (Map preserves insertion order — FIFO,
 *    not LRU, which is plenty for small key spaces and keeps eviction O(1)).
 *  - **In-memory, per instance**: values are visible to one process only. Use it ONLY where a few
 *    seconds of per-instance staleness is explicitly acceptable (informational counts, static
 *    config), never for reads that gate money, assignment, or auth.
 */
export class MicroCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 500) {}

  /**
   * Return the cached value for `key` when it's still fresh; otherwise run `loader` (coalescing
   * concurrent callers onto one execution) and cache its result for `ttlMs`.
   */
  async getOrLoad(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const load = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, load);
    return load;
  }

  /** Store a value directly (also the write path getOrLoad uses). Evicts oldest-first at capacity. */
  set(key: string, value: T, ttlMs: number): void {
    if (!this.values.has(key) && this.values.size >= this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
    // Delete-then-set keeps insertion order meaningful for the FIFO eviction above.
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Drop one key (targeted invalidation after a write) — or everything when called with no key. */
  invalidate(key?: string): void {
    if (key === undefined) this.values.clear();
    else this.values.delete(key);
  }
}
