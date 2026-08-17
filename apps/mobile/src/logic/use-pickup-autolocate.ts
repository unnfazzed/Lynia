import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import type { PickedPoint } from "../ui/MapPicker";
import { landmarkFromAddress } from "./geocode";

/**
 * Prefill the compose screen's PICKUP pin from the device's own position, once, when the screen opens.
 *
 * Why this exists (owner instruction, 2026-08-17): the send composer opened with two empty address
 * slots and a "Tap the map to drop your pickup pin" hint, so the overwhelmingly common case — a
 * customer standing exactly where the parcel is — cost a map tap (or a trip to the "Use my location"
 * pill) before anything else could be filled in. The pickup is now placed for them the moment the tab
 * opens; it stays fully editable (tap the map, drag the marker, search an address, or hit the locate
 * pill), and this hook never writes again once the customer has taken it over.
 *
 * Three deliberate properties, each of which the explicit "Use my location" button does NOT have:
 *
 * 1. **Silent on failure.** Nobody asked for this fix, so a refused permission / dead GPS / offline
 *    geocoder must leave the screen exactly as it was — the tap-the-map hint is already the right
 *    instruction in that state, and a red "Couldn't get your location" toast over a composer the
 *    customer just opened would be an error for something they never requested.
 * 2. **Cached fix first, real fix second.** "Prefilled when you open the tab" means *visible
 *    immediately*, and a cold GPS lock on a Go-class handset is seconds. `getLastKnownPositionAsync`
 *    is instant when the platform has anything cached, so the pin lands right away and is refined in
 *    place when the real fix arrives. `onPoint` may therefore fire twice; the caller treats the second
 *    as a correction of the first.
 * 3. **One shot per mount.** Guarded by a ref rather than effect deps, so nothing about a re-render
 *    (or a caller re-creating its callbacks) can re-drive the pin after the customer has moved it.
 *
 * Permission is CHECKED before it is requested, and requested only when the OS will actually show the
 * dialog. First-run priming (`app/permissions.tsx`) usually means it is already granted; asking here
 * covers the customer who skipped that step with "Enter address manually", and asking in front of the
 * composer is the in-context ask that screen was explaining in advance.
 */

/** GPS fix bound — same 9s ceiling `ComposeMap`/`MapPicker` put on the explicit locate button. */
const FIX_TIMEOUT_MS = 9_000;

/**
 * How stale a cached fix may be and still be worth dropping a provisional pin on. Two minutes is
 * comfortably inside "the customer hasn't moved since the app last looked", and anything older is
 * still corrected seconds later by the live fix below — the cost of being wrong here is a pin that
 * slides a block, not a wrong address, because the landmark is only ever geocoded from the FINAL
 * point.
 */
const LAST_KNOWN_MAX_AGE_MS = 120_000;

export interface PickupAutolocateOptions {
  /**
   * Whether to locate at all. False when something else already owns the pickup pin — today that is a
   * re-broadcast / "send again", where THAT order's pickup is the whole point and the customer's
   * current position is not.
   */
  enabled: boolean;
  /** A point for the pickup slot. May fire twice (cached fix, then the refined live one). */
  onPoint: (p: PickedPoint) => void;
  /** The reverse-geocoded landmark for the final point. Fires at most once, and only on success. */
  onLandmark: (landmark: string) => void;
}

/** Reject if `p` doesn't settle in time, clearing the timer on the winning path (mirrors ComposeMap). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("location-timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Granted, or granted after asking. Never throws, and never asks when the OS would silently refuse to
 * show the dialog (`canAskAgain === false`) — a customer who has hard-denied location gets no prompt
 * and no delay, just the unchanged tap-the-map composer.
 */
async function ensureForegroundPermission(): Promise<boolean> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.granted) return true;
    if (!existing.canAskAgain) return false;
    const asked = await Location.requestForegroundPermissionsAsync();
    return asked.status === "granted";
  } catch {
    return false;
  }
}

/** The platform's cached fix, if it has one recent enough to be worth showing. Null on any failure. */
async function cachedPoint(): Promise<PickedPoint | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** A live fix, bounded by `FIX_TIMEOUT_MS`. Null on timeout / no GPS / any failure. */
async function livePoint(): Promise<PickedPoint | null> {
  try {
    const loc = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      FIX_TIMEOUT_MS,
    );
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}

/** Best-effort landmark for a point. Empty string (never a throw) when the geocoder can't help. */
async function landmarkFor(p: PickedPoint): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    const first = results[0];
    return first ? landmarkFromAddress(first) : "";
  } catch {
    return "";
  }
}

export function usePickupAutolocate({ enabled, onPoint, onLandmark }: PickupAutolocateOptions): void {
  // The callbacks are read through a ref at call time so the effect below can depend on `enabled`
  // alone: a caller that re-creates its handlers each render must not re-drive the pin.
  const handlers = useRef({ onPoint, onLandmark });
  useEffect(() => {
    handlers.current = { onPoint, onLandmark };
  });

  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let cancelled = false;
    void (async () => {
      if (!(await ensureForegroundPermission()) || cancelled) return;

      // The cached fix paints the pin now; the live one replaces it a beat later. Both are emitted
      // because the cached one is what makes the pin feel prefilled rather than eventually-filled.
      const cached = await cachedPoint();
      if (cancelled) return;
      if (cached) handlers.current.onPoint(cached);

      const live = await livePoint();
      if (cancelled) return;
      if (live) handlers.current.onPoint(live);

      // Landmark comes from the FINAL point only — geocoding the cached one too would spend a second
      // lookup to write a name that the live fix is about to make wrong. It is contract-required
      // (`Waypoint.landmark`), so filling it here is what makes the prefilled pin actually submittable
      // rather than a pin the customer still has to name.
      const point = live ?? cached;
      if (!point) return;
      const landmark = await landmarkFor(point);
      if (cancelled || !landmark) return;
      handlers.current.onLandmark(landmark);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
