import { useSyncExternalStore } from "react";

/**
 * "How far has the cold start got?" — the three real boot tasks the splash waits on
 * (`packages/design/handoff/splash-v1`, ledger D-64; they have no UI of their own since the steps card
 * was removed, CHANGE-2026-10-06). The splash is ON SCREEN for exactly as long as these take (and never
 * shorter than its 1300ms intro), so each one has to be the real thing, not a timer:
 *
 * - `session`  — the boot decision is made (app/index.tsx): session read, onboarding flag, saved role
 *                and cold-start push all settled. Carries the `destination` the boot redirects to.
 * - `profile`  — Home's `["me"]` read has settled (seeded by the boot aggregate, or fetched).
 * - `home`     — Home has its first content to show (the rails have data, or have decided they're empty).
 *
 * Each is stamped with the time it became true. A module store rather than React state because the
 * three are reported from three different subtrees (the boot route, Home, and the splash overlay that
 * reads them sit in different branches of the root layout) and the cold start is a process-lifetime
 * fact, so the stamps must survive a remount and never go back to "not ready".
 */
export type BootSignal = "session" | "profile" | "home";

export interface BootReadiness {
  /** Where the boot redirect went, once `session` is ready; `null` until then. */
  destination: string | null;
  /** `Date.now()` when the splash began its exit into Home (Home's entrance keys off it), else null. */
  exitAt: number | null;
  /**
   * `Date.now()` when the cold start ENDED (the splash handed off, or something that replaces the
   * navigator ended it), else null. Process-lifetime: a remount of the root layout (the ErrorBoundary's
   * "Reload") reads it so the cold-start splash is never replayed in a process that already booted.
   */
  endedAt: number | null;
  /** `Date.now()` when each signal became ready, or `null` while still pending. */
  readyAt: Record<BootSignal, number | null>;
}

const EMPTY: BootReadiness = {
  destination: null,
  exitAt: null,
  endedAt: null,
  readyAt: { session: null, profile: null, home: null },
};

let state: BootReadiness = EMPTY;
const listeners = new Set<() => void>();

function set(next: BootReadiness): void {
  state = next;
  for (const fn of listeners) fn();
}

/** The boot route made its decision: the session check is done and the destination is known. Idempotent. */
export function reportBootDestination(destination: string, now: number = Date.now()): void {
  if (state.readyAt.session != null) return;
  set({ ...state, destination, readyAt: { ...state.readyAt, session: now } });
}

/**
 * The router's pathname while the boot is still going (app/_layout.tsx `BootRouteWatch`). A boot bound
 * for Home can be sent elsewhere before Home is ready — a session the server rejects signs out and the
 * SessionGate replaces Home with /phone; a route gate redirects. Home then never reports its tasks, so
 * without this the splash would wait on them until its give-up. When the app has landed somewhere that
 * is neither the boot route ("/") nor Home, that place becomes the destination and the splash hands off
 * straight away (a non-Home destination waits only for the session check, long done).
 * Ignored once the exit into Home has started or the boot has ended. Idempotent.
 */
export function reportBootRoute(pathname: string): void {
  if (state.destination !== "/home" || state.exitAt != null || state.endedAt != null) return;
  if (pathname === "/" || pathname === state.destination) return;
  set({ ...state, destination: pathname });
}

/** A later signal became true. Idempotent — the first stamp wins. */
export function reportBootReady(signal: Exclude<BootSignal, "session">, now: number = Date.now()): void {
  if (state.readyAt[signal] != null) return;
  set({ ...state, readyAt: { ...state.readyAt, [signal]: now } });
}

/** The splash started its exit into Home. Idempotent. */
export function reportSplashExit(now: number = Date.now()): void {
  if (state.exitAt != null) return;
  set({ ...state, exitAt: now });
}

/** The cold start ended (see {@link BootReadiness.endedAt}). Idempotent — the first stamp wins. */
export function reportBootEnded(now: number = Date.now()): void {
  if (state.endedAt != null) return;
  set({ ...state, endedAt: now });
}

export function getBootReadiness(): BootReadiness {
  return state;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useBootReadiness(): BootReadiness {
  return useSyncExternalStore(subscribe, getBootReadiness, getBootReadiness);
}

/** Test seam: a fresh cold start. */
export function resetBootReadinessForTest(): void {
  state = EMPTY;
  listeners.clear();
}
