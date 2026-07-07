import { onlineManager } from "@tanstack/react-query";
import { API_URL } from "../config";

/**
 * App-wide reachability — "can we actually reach the Lynia API right now?" — derived from REAL request
 * outcomes rather than the OS wifi/cell icon. On a constrained link (the target market) the radio can
 * read "connected" while nothing round-trips, and a captive portal looks online to a NetInfo-style
 * check; the only honest signal is whether bytes come back from the server. So every REST call reports
 * its outcome here (see apiFetch): any HTTP response — even a 500 — means reachable; only a
 * network-level throw (DNS / connection refused / timeout) means unreachable.
 *
 * The point is to fail SOFT, the way inDrive/Uber/Grab do on a flaky link: a blip must not look like a
 * broken app. While unreachable we quietly poll `/health` on a capped backoff and flip back on the
 * first OK, so recovery is automatic within seconds of the network returning — the user never has to
 * kill and reopen the app. The state also drives React Query's `onlineManager`: offline PAUSES queries
 * and mutations (no hammering a dead link, no cascade of "failed" states), and reconnect auto-resumes
 * and refetches them.
 *
 * Everything here is framework-free and the timing helper is pure, so the logic is unit-testable
 * on-CI without a device (the app's jest just drives the store with an injected probe + fake timers).
 */

type Listener = (reachable: boolean) => void;

let reachable = true; // optimistic at cold start — the first failed request flips it within seconds
const listeners = new Set<Listener>();
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeAttempt = 0;
let probing = false; // true while a probe fetch is in flight (probeTimer is null during that window)

/**
 * Backoff for the `/health` recovery probe: 2s, 4s, 8s, 16s, then capped at 30s. Capped so a long
 * outage settles into a steady 30s heartbeat instead of drifting to multi-minute gaps that would make
 * reconnection feel sluggish. Pure — unit-tested.
 */
export function nextProbeDelayMs(attempt: number): number {
  return Math.min(2_000 * 2 ** attempt, 30_000);
}

export function isReachable(): boolean {
  return reachable;
}

/** Subscribe to reachability transitions. Returns an unsubscribe fn. Shaped for `useSyncExternalStore`. */
export function subscribeReachability(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(): void {
  // Keep React Query's global online state in lock-step so its networkMode gating (pause offline,
  // auto-resume on reconnect) just works for every query and mutation, with no per-call wiring.
  onlineManager.setOnline(reachable);
  for (const fn of listeners) fn(reachable);
}

/** Any completed round-trip to the API — even a 4xx/5xx HTTP response — proves we're reachable. */
export function reportReachable(): void {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  probeAttempt = 0;
  if (!reachable) {
    reachable = true;
    emit();
  }
}

/** A network-level failure (no HTTP response at all): DNS, connection refused, or a timed-out request. */
export function reportUnreachable(): void {
  if (reachable) {
    reachable = false;
    emit();
  }
  scheduleProbe();
}

/**
 * The recovery probe transport. A bare `fetch` (NOT apiFetch) to `/health` — unauthenticated, and kept
 * off the RUM/reachability path so probing can't itself feed the signal it's measuring. Swappable for
 * tests via `__setProbeFetch`.
 */
let probeFetch: (url: string) => Promise<boolean> = defaultProbeFetch;

async function defaultProbeFetch(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function scheduleProbe(): void {
  // Never probe when we're already online (a `reportReachable` during an in-flight probe would otherwise
  // let the resolve path reschedule a pointless loop), and keep exactly one loop: one timer pending OR
  // one fetch in flight. `probing` closes the window where `probeTimer` is briefly null mid-fetch, which
  // previously let a concurrent `reportUnreachable` spawn a second parallel loop.
  if (reachable || probeTimer || probing) return;
  const delay = nextProbeDelayMs(probeAttempt);
  probeAttempt += 1;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    probing = true;
    void probeFetch(`${API_URL}/health`).then((ok) => {
      probing = false;
      if (ok) reportReachable();
      else scheduleProbe();
    });
  }, delay);
}

/** Test seam: swap the probe transport so recovery is driven deterministically, no real network. */
export function __setProbeFetch(fn: (url: string) => Promise<boolean>): void {
  probeFetch = fn;
}

/** Test seam: reset module state between cases (fresh optimistic-online, no pending probe). */
export function __resetReachability(): void {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  probeAttempt = 0;
  probing = false;
  reachable = true;
  onlineManager.setOnline(true);
}
