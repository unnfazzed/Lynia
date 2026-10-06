import * as SecureStore from "expo-secure-store";
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
 *
 * EVERY READ IS TIME-BOUNDED (S-3). Guarding against a throw is not guarding against a HANG: a keystore
 * or notification read that never settles held the boot decision (app/index.tsx) forever, and the
 * splash then gave up onto a blank green screen with no way forward. Each read therefore settles by
 * {@link BOOT_READ_TIMEOUT_MS} at the latest, to the value that routes somewhere safe:
 *  - session → null: the user signs in again (a fresh OTP) rather than staring at a dead screen;
 *  - onboardingSeen → TRUE on a timeout (not false, as on an error): a hung keystore is far likelier on
 *    a phone that has been through onboarding, and true routes a session-less boot to /phone, the
 *    screen that recovers either way, instead of replaying the first-run carousel;
 *  - rolePref → null (the customer Home), coldStartData → null (no deep link).
 * The bound is generous next to a healthy read (tens to hundreds of ms, three keychain retries included)
 * so it only ever fires on a genuinely stuck read.
 */

/** The longest any boot read may hold the boot decision. */
export const BOOT_READ_TIMEOUT_MS = 5000;

/** `p`, or `fallback` if `p` hasn't settled within `ms`. Never rejects (callers pre-catch); the timer is
 *  cleared the moment `p` settles so a healthy boot leaves nothing scheduled. */
function bounded<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

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
  // One-shot legacy cleanup (RCA 2026-08-17 §5.2): installs upgraded from ≤0.40.x carry the deleted
  // restaurant-list store's ~30 KB SecureStore blob, which nothing reads any more and sign-out alone
  // would leave in place for the app's whole signed-in life. Fire-and-forget — never awaited, never
  // on the boot decision's critical path, and a keystore failure is silently irrelevant. The literal
  // key mirrors LEGACY_RESTAURANT_LIST_SNAPSHOT_KEY (auth/device-state.ts) — kept as a literal so the
  // boot path doesn't grow a device-state import for a temporary janitor line.
  void SecureStore.deleteItemAsync("lynia.restaurants.list-snapshot.v1").catch(() => undefined);
  reads = {
    session: bounded(
      loadSession().catch(() => null),
      BOOT_READ_TIMEOUT_MS,
      null,
    ),
    onboardingSeen: bounded(
      loadOnboardingSeen().catch(() => false),
      BOOT_READ_TIMEOUT_MS,
      true,
    ),
    rolePref: bounded(
      loadRolePreference().catch(() => null),
      BOOT_READ_TIMEOUT_MS,
      null,
    ),
    coldStartData: bounded(
      consumeColdStartResponse()
        .then((response) => (response ? response.notification.request.content.data : null))
        .catch(() => null),
      BOOT_READ_TIMEOUT_MS,
      null,
    ),
  };
  return reads;
}

/** Test seam: forget the started reads so the next `prewarmBootReads()` re-fires against fresh mocks.
 *  Mirrors `__resetReachability` in `src/net/reachability.ts`. Never called by app code. */
export function __resetBootReads(): void {
  reads = null;
}
