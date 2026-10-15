import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { AppState, Linking, Platform } from "react-native";

/**
 * Location permission + the phone's location switch, as First Run v2 reads them (handoff `first-run-v2`
 * README §3–§4, ledger D-82). Split from the notification half so a location-only module (Home's
 * deliver-to) doesn't load expo-notifications. Every read is best-effort and never throws.
 */

export type LocState = "undetermined" | "granted" | "coarse" | "denied" | "blocked";

export type PermLike = { status?: string; granted?: boolean; canAskAgain?: boolean; android?: { accuracy?: string } | object | null } | null | undefined;

/** A location permission answer → the five states the screens branch on. Pure. */
export function classifyLocation(p: PermLike): LocState {
  if (!p) return "denied";
  if (p.granted || p.status === "granted") return (p.android as { accuracy?: string } | null | undefined)?.accuracy === "coarse" ? "coarse" : "granted";
  if (p.status === "undetermined") return "undetermined";
  return p.canAskAgain === false ? "blocked" : "denied";
}

export async function readGps(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch {
    return true;
  }
}

export async function readLocation(): Promise<{ loc: LocState; gps: boolean }> {
  let loc: LocState;
  try {
    loc = classifyLocation(await Location.getForegroundPermissionsAsync());
  } catch {
    loc = "denied";
  }
  // GPS only matters once the app may use it; reading it before then would surface PC6 ahead of PC1.
  const gps = loc === "granted" || loc === "coarse" ? await readGps() : true;
  return { loc, gps };
}

/** The Android location dialog (PC2/P2). Answers the new state; on Android a second ask after "Approximate"
 *  shows the upgrade-to-precise dialog (PC3/P4). */
export async function requestLocation(): Promise<LocState> {
  try {
    return classifyLocation(await Location.requestForegroundPermissionsAsync());
  } catch {
    return (await readLocation()).loc;
  }
}

/** PC6/P7: Google's "turn on location" dialog, then whether the switch is now on. */
export async function turnOnGps(): Promise<boolean> {
  try {
    await Location.enableNetworkProviderAsync();
  } catch {
    /* the rider/customer declined, or the dialog isn't available — the re-read below answers */
  }
  return readGps();
}

export function openPhoneSettings(): void {
  void Promise.resolve(Linking.openSettings()).catch(() => undefined);
}

/** The phone's Location screen — the one with the on/off switch — not the app's info page, which has no
 *  location switch. Falls back to the app's settings where the intent isn't available. */
export function openLocationSettings(): void {
  if (Platform.OS !== "android") return openPhoneSettings();
  void Promise.resolve(Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS")).catch(openPhoneSettings);
}

/**
 * "Turn on" for the phone's location switch with as few taps as the phone allows. Phones with Google Play
 * services (nearly every Android sold here) show Google's one-tap "Turn on device location" dialog in the
 * app. Where that dialog doesn't exist (Huawei without Google, iOS), the rider is taken straight to the
 * Location screen. Resolves to whether the switch is on now.
 */
export async function switchOnLocation(): Promise<boolean> {
  if (await readGps()) return true;
  if (await turnOnGps()) return true;
  openLocationSettings();
  return false;
}

/** How often a screen waiting on location re-reads it. Both reads are local and cheap (no GPS fix). */
export const LOCATION_WATCH_MS = 3_000;

/**
 * While `active`, re-read the permission and the location switch every few seconds, and call `onReady`
 * the moment they turn usable (granted, or approximate, with the switch on). This catches what an
 * AppState listener can't: the switch flipped from the quick-settings shade, which never takes the app
 * out of the foreground. It fires on the change only, never repeatedly while location stays ready.
 */
export function useLocationReadyWatch(active: boolean, onReady: () => void, ms: number = LOCATION_WATCH_MS): void {
  const ref = useRef(onReady);
  ref.current = onReady;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let wasReady: boolean | null = null;
    const tick = (): void => {
      void readLocation().then(({ loc, gps }) => {
        if (!alive) return;
        const ready = (loc === "granted" || loc === "coarse") && gps;
        if (ready && wasReady === false) ref.current();
        wasReady = ready;
      });
    };
    tick();
    const timer = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, ms]);
}

/** Runs `onActive` each time the app comes back to the foreground (the "re-read on return" rule). */
export function useOnAppActive(onActive: () => void): void {
  const ref = useRef(onActive);
  ref.current = onActive;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") ref.current();
    });
    return () => sub.remove();
  }, []);
}

