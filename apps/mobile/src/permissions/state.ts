import { useCallback, useEffect, useRef, useState } from "react";
import { readLocation, type LocState, useOnAppActive } from "./location";
import { mutedJobChannel, type NotifState, readNotif } from "./notifications";

export * from "./location";
export * from "./notifications";

/**
 * The phone's permission state, as First Run v2 reads it (handoff `first-run-v2` README §3–§4, ledger D-82).
 *
 *   loc    undetermined · granted (precise) · coarse (approximate, PC3/P4) · denied (can ask again, PC4/P5)
 *          · blocked (the OS won't show the dialog again, PC5/P6)
 *   gps    the phone's location services switch (PC6/P7)
 *   notif  undetermined · granted · denied (can ask again) · blocked (P11 / PC11)
 *   channelMuted  a rider's job-alert channel is silenced (P12)
 *
 * Every read is best-effort: a failing native call answers the most conservative value (not granted,
 * GPS on — so nothing claims "your GPS is off" on a guess) and never throws. Re-read on AppState
 * `active` for every "Open phone settings" state — the app never shows a Retry button (BRIEF 7).
 */

export interface PermissionsSnapshot {
  loc: LocState;
  gps: boolean;
  notif: NotifState;
  channelMuted: boolean;
}

/** Location granted precisely is the only state a rider can work in without a nudge. */
export function allGranted(s: PermissionsSnapshot): boolean {
  return s.loc === "granted" && s.gps && s.notif === "granted" && !s.channelMuted;
}

/** The whole snapshot. `rider` reads the job-alert channel too (it never matters to a customer). */
export async function readPermissions(rider = false): Promise<PermissionsSnapshot> {
  const [{ loc, gps }, notif] = await Promise.all([readLocation(), readNotif()]);
  const channelMuted = rider && notif === "granted" ? (await mutedJobChannel()) != null : false;
  return { loc, gps, notif, channelMuted };
}

/**
 * The live snapshot: read on mount and on every return to the app. `null` until the first read lands, so
 * a screen never draws a toggle in the wrong position for a frame.
 */
export function usePermissions({ rider = false }: { rider?: boolean } = {}): { perms: PermissionsSnapshot | null; refresh: () => void } {
  const [perms, setPerms] = useState<PermissionsSnapshot | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(() => {
    void readPermissions(rider).then((p) => {
      if (alive.current) setPerms(p);
    });
  }, [rider]);
  useEffect(() => {
    alive.current = true;
    refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);
  useOnAppActive(refresh);
  return { perms, refresh };
}
