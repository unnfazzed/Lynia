/**
 * Merchant reconnect discipline (RESTAURANTS-DECISIONS.md §3, "Merchant reconnect"): "Socket drop →
 * red CONNECTION LOST bar within 3s, all mutating actions disabled, exponential backoff with the
 * attempt count shown."
 *
 * E1 has no live kitchen-queue socket yet (that lands with C5/E2) — this module derives the same
 * "can we actually reach the API right now" signal apps/mobile/src/net/reachability.ts uses, via a
 * capped-backoff `/healthz` probe, so the shell's CONNECTION LOST bar, the alarm, and (once E2 wires
 * the real queue) every mutating button all read from one place. Framework-free and pure enough to
 * unit test without a browser: `nextProbeDelayMs` is a pure function, and the store is driven here
 * by an injectable probe transport exactly like the mobile module's `__setProbeFetch` seam.
 */

export type ReachabilityListener = (state: ReachabilityState) => void;

export interface ReachabilityState {
  reachable: boolean;
  /** Consecutive failed probes since the last reachable moment (0 while reachable). Shown verbatim
   *  as the "(attempt N)" counter on the CONNECTION LOST bar. */
  attempt: number;
  /** Epoch ms the connection was last known reachable (null before the first probe result), used for
   *  the bar's "Since 12:48" and the reconnect banner's "offline for 4 minutes" copy. */
  unreachableSinceMs: number | null;
}

/** 2s, 4s, 8s, 16s, capped at 30s — identical formula to apps/mobile/src/net/reachability.ts so the
 *  two clients feel the same during an outage. Pure — unit-tested. */
export function nextProbeDelayMs(attempt: number): number {
  return Math.min(2_000 * 2 ** attempt, 30_000);
}

const HEALTHZ_TIMEOUT_MS = 5_000;

/** LC-C04: independent liveness check while believed-reachable. The backoff probe below only ever
 *  runs once something ELSE has already called `reportUnreachable()` — before this existed, an outage
 *  where no in-flight app request happened to fail (a stuck poll latch, a screen with no live poller,
 *  a backgrounded tab whose `setInterval` got throttled) went undetected: the CONNECTION LOST bar never
 *  showed, the pill stayed green. This timer fires on its own clock, independent of app traffic, and
 *  treats a failed check exactly like a failed app request. */
export const ACTIVE_PROBE_INTERVAL_MS = 20_000;

export class ReachabilityStore {
  private state: ReachabilityState = { reachable: true, attempt: 0, unreachableSinceMs: null };
  private listeners = new Set<ReachabilityListener>();
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeProbeTimer: ReturnType<typeof setTimeout> | null = null;
  private probing = false;
  private stopped = true;

  constructor(
    private readonly probeFetch: (url: string) => Promise<boolean>,
    private readonly baseUrl: string,
    private readonly now: () => number = Date.now,
  ) {}

  getState(): ReachabilityState {
    return this.state;
  }

  subscribe(fn: ReachabilityListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  /** A completed round trip to the API (any HTTP status) — used by the app's own authed fetches so a
   *  successful queue/menu call also counts as proof of life, not just the dedicated probe. */
  reportReachable(): void {
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    if (!this.state.reachable || this.state.attempt !== 0) {
      this.state = { reachable: true, attempt: 0, unreachableSinceMs: null };
      this.emit();
    }
    this.scheduleActiveProbe();
  }

  /** A network-level failure: DNS, connection refused, or a timed-out request. */
  reportUnreachable(): void {
    this.clearActiveProbe();
    if (this.state.reachable) {
      this.state = { reachable: false, attempt: 0, unreachableSinceMs: this.now() };
      this.emit();
    }
    this.scheduleProbe();
  }

  start(): void {
    this.stopped = false;
    if (!this.state.reachable) this.scheduleProbe();
    else this.scheduleActiveProbe();
  }

  stop(): void {
    this.stopped = true;
    if (this.probeTimer) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
    this.clearActiveProbe();
  }

  private scheduleProbe(): void {
    if (this.stopped || this.state.reachable || this.probeTimer || this.probing) return;
    const attempt = this.state.attempt;
    const delay = nextProbeDelayMs(attempt);
    this.state = { ...this.state, attempt: attempt + 1 };
    this.emit();
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      this.probing = true;
      void this.probeFetch(`${this.baseUrl}/healthz`).then((ok) => {
        this.probing = false;
        if (ok) this.reportReachable();
        else this.scheduleProbe();
      });
    }, delay);
  }

  private clearActiveProbe(): void {
    if (this.activeProbeTimer) {
      clearTimeout(this.activeProbeTimer);
      this.activeProbeTimer = null;
    }
  }

  /** Runs only while `start()`-ed and believed-reachable. Failure hands off to the same recovery path
   *  a failed app request would trigger; success just reschedules itself. */
  private scheduleActiveProbe(): void {
    if (this.stopped || !this.state.reachable || this.activeProbeTimer || this.probing) return;
    this.activeProbeTimer = setTimeout(() => {
      this.activeProbeTimer = null;
      this.probing = true;
      void this.probeFetch(`${this.baseUrl}/healthz`).then((ok) => {
        this.probing = false;
        // LC-D##: must go through the full reportReachable() path, not a bare scheduleActiveProbe().
        // A concurrent reportUnreachable() (a failed app request) can flip state.reachable to false
        // while this probe is still in flight; scheduleActiveProbe()'s own !this.state.reachable guard
        // would then reject the bare rescheduling call, and scheduleProbe() (called by that
        // reportUnreachable()) had already bailed out on this.probing still being true — leaving
        // no timer of any kind armed, permanently. reportReachable() always reschedules from
        // whatever the current state actually is, which closes that gap; a probe that just
        // succeeded is proof of life right now regardless of what raced it.
        if (ok) this.reportReachable();
        else this.reportUnreachable();
      });
    }, ACTIVE_PROBE_INTERVAL_MS);
  }
}

async function defaultProbeFetch(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTHZ_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let singleton: ReachabilityStore | null = null;

/** The one reachability store the app shell/hooks use. Lazily created so importing this module in a
 *  test (with its own injected ReachabilityStore instance) never spins up a real probe loop. */
export function getReachabilityStore(baseUrl: string): ReachabilityStore {
  if (!singleton) singleton = new ReachabilityStore(defaultProbeFetch, baseUrl);
  return singleton;
}
