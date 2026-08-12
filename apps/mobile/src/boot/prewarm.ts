import { loadOnboardingSeen, loadRolePreference, loadSession, type Session, type StartRole } from "../auth/session";
import { consumeColdStartResponse } from "../push/push";

/**
 * Cold-boot prewarm — the fix for a launch that was strictly serial when almost none of it had to be.
 *
 * THE SHAPE OF THE BUG. `app/_layout.tsx` used to `return null` until the fonts registered. Returning
 * null doesn't merely hide UI: `SafeAreaProvider`, the query-cache provider, `AuthProvider` and the
 * navigator were never MOUNTED, so none of their effects had run. The keychain session read, the
 * persisted-cache restore and the `/app/bootstrap` round trip therefore could not begin until the font
 * load had finished — and `app/index.tsx` then started three MORE device reads only once IT mounted,
 * holding its redirect until the slowest of four resolved. So the launch ran as one file:
 *
 *     module evaluation → fonts → keychain reads → boot fetch → first real screen
 *
 * ...even though the fonts, the keychain and the network know nothing about each other.
 *
 * WHAT THIS DOES. Every device-local read the boot decision needs is started HERE, at module
 * evaluation time, from `app/_layout.tsx`'s import — so the native side works on them while the JS
 * thread is still evaluating the rest of the startup graph and while expo-font resolves the TTFs. By
 * the time a consumer awaits one, it is usually already settled. The reads are unchanged; only the
 * moment they start moved.
 *
 * WHY MEMOIZED PROMISES RATHER THAN A HOOK. These are process-lifetime facts (which session is on this
 * device, has onboarding been seen, which notification launched us), read once per launch. A promise
 * created at module scope is the honest representation: every consumer awaits the SAME in-flight read
 * instead of racing its own. `consumeColdStartResponse` already worked this way for a stricter reason —
 * the native response is consumed-and-cleared, so a second independent call could read a value about to
 * vanish (see its own comment).
 *
 * EVERY READ IS BEST-EFFORT. Each promise resolves to the same "nothing stored" value its caller
 * already treated a failure as, so an unhandled rejection can never escape into the boot path — this
 * runs before any error boundary exists, so a throw here would be an unrecoverable white screen.
 */

export interface BootReads {
  /** The persisted session, or null when absent/unreadable (keychain corruption ⇒ re-authenticate). */
  session: Promise<Session | null>;
  /** Whether the first-install carousel has already been shown on this device. */
  onboardingSeen: Promise<boolean>;
  /** The saved customer|rider fork, or null when never chosen. */
  rolePref: Promise<StartRole | null>;
  /** The data payload of the notification whose tap launched this process, or null if none. */
  coldStartData: Promise<unknown>;
}

let reads: BootReads | null = null;

/**
 * Start (or return the already-started) boot reads. Idempotent: the first call fires the native work,
 * every later call gets the same promises. Called at module scope by `app/_layout.tsx` so it happens as
 * early in the bundle as the root layout is reached, and by `AuthProvider` / `app/index.tsx` from their
 * mount effects, which by then are just picking up work already in flight.
 */
export function prewarmBootReads(): BootReads {
  if (reads) return reads;
  reads = {
    session: loadSession().catch(() => null),
    onboardingSeen: loadOnboardingSeen().catch(() => false),
    rolePref: loadRolePreference().catch(() => null),
    coldStartData: consumeColdStartResponse()
      .then((response) => (response ? response.notification.request.content.data : null))
      .catch(() => null),
  };
  return reads;
}

/** Test seam: forget the started reads so the next `prewarmBootReads()` re-fires against fresh mocks.
 *  Mirrors `__resetReachability` in `src/net/reachability.ts`. Never called by app code. */
export function __resetBootReads(): void {
  reads = null;
}
