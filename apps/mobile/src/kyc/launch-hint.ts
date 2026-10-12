import { useEffect, useState } from "react";
import { currentProfileId } from "../api/client";
import { clearKycLaunchMark, loadKycLaunchMark, saveKycLaunchMark, type StoredKycLaunchMark } from "../auth/device-state";
import type { KycLaunchMark, KycSdkResult } from "../logic/gates";

/**
 * The hand-off between Become a rider (`app/rider/become.tsx`) and the rider board (R-4 / R-10, startup
 * review 2026-10-06) — and, for a COMPLETED launch, the device-stored mark behind it.
 *
 * Become opens the ID check and then hands over to the board, which decides the wall. It used to drop
 * the launch's outcome on the floor, so the board knew only what the server said: a rider who had JUST
 * finished the check was told "You started the ID check but didn't finish" (the vendor still reads "In
 * Progress" for a while), and a launch that never opened landed on "Finish verifying" instead of the
 * "We couldn't open the ID check" wall with its support action.
 *
 * Two layers:
 *  - the HAND-OFF (`recordKycLaunch` → `takeKycLaunch`) is module memory, taken once, so the board picks up
 *    whatever Become just ran whether it was mounted below Become or is mounted fresh;
 *  - the STORED MARK (`{profileId, outcome, at}` in the keystore) outlives the process, so a restart — or a
 *    board mounting fresh minutes later — still holds a rider who finished the check on F8 / R2 instead of
 *    dropping them onto F3 "Finish your ID check" while the vendor catches up (gates.ts
 *    kycLaunchForGate's KYC_COMPLETED_HOLD_MS ceiling still applies). Only a `completed` launch is
 *    restored after a restart: a `failed` one says the camera/sheet broke on THIS run, which a restart no
 *    longer knows, and a `cancelled` one is what the server already says. Cleared once `me` moves past
 *    pending (`clearStoredKycLaunch`).
 */
let pending: KycLaunchMark | null = null;

/** The stored mark as this process last read or wrote it — `undefined` until the first read lands. */
let stored: StoredKycLaunchMark | null | undefined;
let loading: Promise<StoredKycLaunchMark | null> | null = null;

/** Become (and the board's own retry): record how a launch ended — handed over AND stored. */
export function recordKycLaunch(outcome: KycSdkResult, at: number = Date.now(), profileId: string | null = currentProfileId()): void {
  if (!outcome) return;
  pending = { outcome, at };
  rememberKycLaunch({ outcome, at }, profileId);
}

/** Store a launch's outcome for the signed-in account (no hand-off). A non-completed launch supersedes a
 *  stored completion, so it clears it. */
export function rememberKycLaunch(mark: KycLaunchMark, profileId: string | null = currentProfileId()): void {
  if (!profileId || !mark.outcome) return;
  if (mark.outcome === "completed") {
    stored = { profileId, outcome: "completed", at: mark.at };
    void saveKycLaunchMark(stored);
  } else if (stored !== null) {
    stored = null;
    void clearKycLaunchMark();
  }
}

/** The board: take the recorded launch, if any (once — a second read returns null). */
export function takeKycLaunch(): KycLaunchMark | null {
  const mark = pending;
  pending = null;
  return mark;
}

function forProfile(mark: StoredKycLaunchMark | null | undefined, profileId: string | null): KycLaunchMark | null {
  if (!mark || !profileId || mark.profileId !== profileId || mark.outcome !== "completed") return null;
  return { outcome: mark.outcome, at: mark.at };
}

/** Synchronous: the stored completed launch for `profileId`, if this process has read it already. */
export function peekStoredKycLaunch(profileId: string | null): KycLaunchMark | null {
  return forProfile(stored, profileId);
}

/** Whether the stored mark has been read yet this process (so a screen can wait instead of guessing). */
export function storedKycLaunchLoaded(): boolean {
  return stored !== undefined;
}

/** Read the stored mark (once per process; later calls share the read) — for `profileId`. */
export async function loadStoredKycLaunch(profileId: string | null): Promise<KycLaunchMark | null> {
  if (stored === undefined) {
    loading ??= loadKycLaunchMark().then((m) => {
      if (stored === undefined) stored = m;
      return stored ?? null;
    });
    await loading;
  }
  return forProfile(stored, profileId);
}

/** The stored completed launch for `profileId` — synchronous when already read, then from the keystore. */
export function useStoredKycLaunch(profileId: string | null): KycLaunchMark | null {
  const [mark, setMark] = useState<KycLaunchMark | null>(() => peekStoredKycLaunch(profileId));
  useEffect(() => {
    let alive = true;
    setMark(peekStoredKycLaunch(profileId));
    void loadStoredKycLaunch(profileId).then((m) => {
      if (alive) setMark(m);
    });
    return () => {
      alive = false;
    };
  }, [profileId]);
  return mark;
}

/** `me` moved past pending (verified, declined, expired) — the mark has served its purpose. */
export function clearStoredKycLaunch(): void {
  if (stored === null) return;
  stored = null;
  void clearKycLaunchMark();
}

/** Test seam: forget the hand-off and what this process read. */
export function __resetKycLaunchHint(): void {
  pending = null;
  stored = undefined;
  loading = null;
}
