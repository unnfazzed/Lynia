import type { KycLaunchMark, KycSdkResult } from "../logic/gates";

/**
 * The hand-off between Become a rider (`app/rider/become.tsx`) and the rider board (R-4 / R-10, startup
 * review 2026-10-06).
 *
 * Become opens the ID check and then hands over to the board, which decides the wall. It used to drop
 * the launch's outcome on the floor, so the board knew only what the server said: a rider who had JUST
 * finished the check was told "You started the ID check but didn't finish" (the vendor still reads "In
 * Progress" for a while), and a launch that never opened landed on "Finish verifying" instead of the
 * "We couldn't open the ID check" wall with its support action.
 *
 * Module memory, deliberately: it lives exactly as long as the JS runtime (an app restart forgets it, as
 * it should — we no longer know the camera is broken), it needs no navigation params, and the board picks
 * it up on focus whether it was already mounted below Become or is mounted fresh. Taken once.
 */
let pending: KycLaunchMark | null = null;

/** Become: record how the launch it opened ended. */
export function recordKycLaunch(outcome: KycSdkResult, at: number = Date.now()): void {
  if (!outcome) return;
  pending = { outcome, at };
}

/** The board: take the recorded launch, if any (once — a second read returns null). */
export function takeKycLaunch(): KycLaunchMark | null {
  const mark = pending;
  pending = null;
  return mark;
}
