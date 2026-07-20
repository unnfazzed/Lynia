/**
 * A tiny read-through TTL cache with single-flight loading — the smallest useful slice of the
 * "transparent proxy cache" pattern DoorDash runs in front of its services (request-coalescing +
 * short TTLs + bounded size), sized for this API's needs: shaving repeated hot reads (e.g. the
 * PostGIS nearby-rider count every open-auction snapshot poll recomputes) without requiring a
 * Redis hop or a new dependency.
 *
 * Wave 2 grows it toward DoorDash's *standardized* caching layer while keeping the class
 * dependency-free (no Nest, no Redis import — callers inject behavior):
 *  - **Observability hook**: `onEvent` receives one bounded outcome per lookup
 *    (hit | l2_hit | miss | coalesced | error) — the caller maps it onto a metrics counter, so
 *    hit rates and staleness are measurable instead of guessed (their #1 caching lesson).
 *  - **Optional L2**: a caller-provided adapter (in practice Redis, resolved lazily) consulted
 *    between L1 and the loader, so 2-3 Cloud Run instances share warm values. Strictly an
 *    accelerant: every L2 command is best-effort — any error falls through to the loader.
 *  - **TTL jitter**: opt-in ±ratio randomization of the stored TTL, so many entries populated
 *    together don't all expire on the same tick (the stampede pattern their cache posts warn
 *    about). Default 0 — existing exact-TTL behavior (and specs) are unchanged.
 *
 * Semantics, chosen deliberately:
 *  - **Single-flight**: concurrent callers for the same key share ONE in-flight loader promise, so a
 *    poll herd can't stampede the database with identical queries (the classic cache-stampede guard).
 *    The L2 lookup happens inside the guarded flight, so it is coalesced too.
 *  - **Errors are never cached**: a rejected loader clears the in-flight slot and propagates, so a
 *    transient DB blip is retried by the next caller instead of pinning a failure for a whole TTL.
 *  - **Bounded**: at `maxEntries` the oldest entry is evicted (Map preserves insertion order — FIFO,
 *    not LRU, which is plenty for small key spaces and keeps eviction O(1)).
 *  - **In-memory L1, per instance**: values are visible to one process only (plus the shared L2 when
 *    configured). Use it ONLY where a few seconds of staleness is explicitly acceptable
 *    (informational counts, static config), never for reads that gate money, assignment, or auth.
 */

/** One bounded outcome per lookup — the fixed vocabulary the metrics counter labels with. */
export type MicroCacheOutcome = "hit" | "l2_hit" | "miss" | "coalesced" | "error";

/** Caller-provided shared second layer (in practice Redis). Values are opaque strings; expiry is
 *  enforced by BOTH the envelope's own `exp` stamp and the store's TTL (PX), so a store that
 *  ignores TTLs still can't serve beyond the envelope's lifetime. */
export interface MicroCacheL2 {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

export interface MicroCacheOptions {
  /** Observability tap: called once per lookup with the outcome. Exceptions are swallowed — a
   *  metrics bug must never fail the request path. */
  onEvent?: (outcome: MicroCacheOutcome) => void;
  /** ±ratio TTL randomization (0.1 = ±10%). Default 0: exact TTLs, byte-compatible with wave 1. */
  ttlJitterRatio?: number;
  /** Lazy L2 provider — returns the shared layer or null (not configured / not connected yet).
   *  Resolved per flight so the adapter can appear after boot without re-wiring the cache. */
  l2?: () => MicroCacheL2 | null;
  /** Namespace prefix for L2 keys (e.g. "mc:nearby:"), so caches never collide in a shared store. */
  l2KeyPrefix?: string;
}

/** The JSON envelope stored in L2 — `exp` (epoch ms) travels with the value so a reader on another
 *  instance seeds its L1 with the REMAINING lifetime, not a fresh full TTL (no zombie extension). */
interface L2Envelope<T> {
  v: T;
  exp: number;
}

export class MicroCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly maxEntries = 500,
    private readonly opts: MicroCacheOptions = {},
  ) {}

  /**
   * Return the cached value for `key` when it's still fresh; otherwise consult L2 (when configured),
   * then run `loader` (coalescing concurrent callers onto one execution) and cache the result for
   * `ttlMs` (jittered when enabled) in both layers.
   */
  async getOrLoad(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.values.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      this.emit("hit");
      return hit.value;
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.emit("coalesced");
      return pending;
    }

    const load = this.loadThrough(key, ttlMs, loader).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, load);
    return load;
  }

  /** The single guarded flight: L2 → loader → write-back. Runs at most once per key concurrently. */
  private async loadThrough(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const l2 = this.opts.l2?.() ?? null;
    const l2Key = `${this.opts.l2KeyPrefix ?? ""}${key}`;

    if (l2) {
      try {
        const raw = await l2.get(l2Key);
        if (raw != null) {
          const envelope = JSON.parse(raw) as L2Envelope<T>;
          const remaining = envelope.exp - Date.now();
          if (remaining > 0) {
            // Seed L1 with the REMAINING lifetime (capped at the caller's ttl) so this instance
            // expires in step with the writer, instead of granting the value a second full life.
            this.set(key, envelope.v, Math.min(remaining, ttlMs));
            this.emit("l2_hit");
            return envelope.v;
          }
        }
      } catch {
        // L2 is an accelerant, never a dependency: any Redis/parse blip falls through to the loader.
      }
    }

    let value: T;
    try {
      value = await loader();
    } catch (err) {
      this.emit("error");
      throw err; // never cached — the next caller retries
    }

    const effectiveTtl = this.jittered(ttlMs);
    this.set(key, value, effectiveTtl);
    if (l2) {
      // Fire-and-forget write-back: a slow/failed L2 SET must not delay the response.
      void Promise.resolve(
        l2.set(l2Key, JSON.stringify({ v: value, exp: Date.now() + effectiveTtl } satisfies L2Envelope<T>), effectiveTtl),
      ).catch(() => {});
    }
    this.emit("miss");
    return value;
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

  /** ±ttlJitterRatio randomization; 0/absent returns the exact TTL (wave-1 behavior). */
  private jittered(ttlMs: number): number {
    const r = this.opts.ttlJitterRatio ?? 0;
    if (r <= 0) return ttlMs;
    return Math.round(ttlMs * (1 - r + 2 * r * Math.random()));
  }

  /** Observability tap — exceptions swallowed so a metrics bug can't fail the request path. */
  private emit(outcome: MicroCacheOutcome): void {
    try {
      this.opts.onEvent?.(outcome);
    } catch {
      /* never let telemetry break the caller */
    }
  }
}
