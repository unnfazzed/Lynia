import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect } from "react";

/** The board's keep-awake tag, so releasing it never clears a keep-awake held elsewhere. */
export const BOARD_KEEP_AWAKE_TAG = "rider-board";

/**
 * Keep the screen from auto-locking while `active` (owner 2026-10-12): an online rider waiting on the
 * Jobs board keeps the app in the foreground, so the heartbeat keeps beating and job pings land on a
 * live board. The rider can still lock the phone by hand. Uses the native module already in the app
 * (expo-keep-awake ships with expo), so it needs no new store build. Best-effort: a failure leaves the
 * phone's normal auto-lock, never breaks the board.
 */
export function useKeepScreenOn(active: boolean, tag: string = BOARD_KEEP_AWAKE_TAG): void {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [active, tag]);
}
