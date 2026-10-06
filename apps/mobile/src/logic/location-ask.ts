import { useCallback, useRef, useState } from "react";
import { type LocState, openPhoneSettings, readLocation, requestLocation, turnOnGps, useOnAppActive } from "../permissions/location";
import type { HomePlace } from "./home-location";

// ---------------------------------------------------------------------------
// Asking for location (First Run v2 PC1–PC7, ledger D-82)
// ---------------------------------------------------------------------------

/**
 * The sheet over Home a location ask is showing (handoff `first-run-v2` README §2A):
 *   explain  PC1 "Deliver to your door" — the only place the Android dialog (PC2) opens from
 *   approx   PC3 approximate granted → "Use precise location"
 *   denied   PC4 denied once → type the address (the search, focused)
 *   blocked  PC5 denied for good → the phone-settings steps
 *   gps      PC6 granted, but the phone's location switch is off
 */
export type LocationSheetStep = "explain" | "approx" | "denied" | "blocked" | "gps";

/** A permission state → the sheet to show, or "detect" (PC7: fix, fill the header, toast). Pure. */
export function locationStep(loc: LocState, gps: boolean): LocationSheetStep | "detect" {
  switch (loc) {
    case "undetermined":
      return "explain";
    case "denied":
      return "denied";
    case "blocked":
      return "blocked";
    case "coarse":
    case "granted":
      if (!gps) return "gps";
      return loc === "coarse" ? "approx" : "detect";
  }
}

export interface LocationAsk {
  /** The sheet on screen, or null. */
  sheet: LocationSheetStep | null;
  /** The OS dialog / Google's location dialog is up (the primary shows a spinner). */
  busy: boolean;
  /** H6 "Use my location" / H5 "Use my current location". */
  start: () => void;
  /** The sheet's primary button. */
  primary: () => void;
  /** The sheet's text link ("Type an address"): close, open the H5 search. */
  alt: () => void;
  close: () => void;
}

/**
 * The customer's location ask — one state machine behind H6's "Use my location" and H5's "Use my current
 * location" (PC1 is the same sheet from both; BRIEF 3). `detect` resolves the place (the hook's
 * `useCurrentLocation`), `onDetected` is PC7 (the screen toasts it), `onSearch` opens the H5 search.
 * PC5 and PC6 re-read the permission when the customer comes back from the phone's settings — no Retry
 * button anywhere (BRIEF 7).
 */
export function useLocationAsk({
  detect,
  onDetected,
  onSearch,
}: {
  detect: () => Promise<HomePlace | null>;
  onDetected: (place: HomePlace) => void;
  onSearch: () => void;
}): LocationAsk {
  const [sheet, setSheet] = useState<LocationSheetStep | null>(null);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const busyRef = useRef(false);
  const cb = useRef({ detect, onDetected, onSearch });
  cb.current = { detect, onDetected, onSearch };

  const runDetect = useCallback(async (): Promise<void> => {
    setSheet(null);
    const place = await cb.current.detect();
    if (place) cb.current.onDetected(place);
    // Granted but no fix (indoors, a cold GPS): the customer types it rather than waiting on nothing.
    else cb.current.onSearch();
  }, []);

  const go = useCallback(
    (loc: LocState, gps: boolean, acceptApprox = false): void => {
      const step = locationStep(loc, gps);
      if (step === "detect" || (acceptApprox && step === "approx")) void runDetect();
      else setSheet(step);
    },
    [runDetect],
  );

  const start = useCallback((): void => {
    void readLocation().then(({ loc, gps }) => go(loc, gps));
  }, [go]);

  const primary = useCallback((): void => {
    const now = sheetRef.current;
    if (now === "blocked") return openPhoneSettings();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void (async () => {
      try {
        if (now === "gps") {
          if (await turnOnGps()) {
            const { loc, gps } = await readLocation();
            go(loc, gps);
          }
          return;
        }
        // PC1 → the Android dialog (PC2). PC3 → asked again, Android shows the upgrade-to-precise dialog;
        // keeping "Approximate" there is an answer too, so the approximate fix is used rather than looping.
        const loc = await requestLocation();
        const gps = loc === "granted" || loc === "coarse" ? (await readLocation()).gps : true;
        go(loc, gps, now === "approx");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, [go]);

  const alt = useCallback((): void => {
    setSheet(null);
    cb.current.onSearch();
  }, []);

  const close = useCallback((): void => setSheet(null), []);

  // PC5 / PC6: back from the phone's settings (or Google's dialog) — re-read, and carry on if it's on now.
  useOnAppActive(() => {
    const now = sheetRef.current;
    if (now !== "blocked" && now !== "gps") return;
    void readLocation().then(({ loc, gps }) => {
      if (locationStep(loc, gps) !== now) go(loc, gps);
    });
  });

  return { sheet, busy, start, primary, alt, close };
}
