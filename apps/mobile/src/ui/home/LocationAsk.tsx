import React from "react";
import type { HomeLocationApi } from "../../logic/home-location";
import { useLocationAsk } from "../../logic/location-ask";
import { CustomerLocationSheet, grantedToast } from "../firstrun/CustomerLocationSheet";
import { useToast } from "../Toast";

/**
 * The customer location ask wired for a screen that shows the deliver-to address (First Run v2 PC1–PC7,
 * ledger D-80): Home (H6 "Use my location", H5 "Use my current location") and the browse lists that open
 * the same H5 sheet. `start` runs the ask; `sheet` is the PC1–PC6 sheet to mount once; PC7 is the bottom
 * toast with the resolved address. `openSearch` opens H5 with its search focused ("Type an address").
 */
export function useLocationAskSheet(location: Pick<HomeLocationApi, "useCurrentLocation" | "setManualPlace">, openSearch: () => void): { start: () => void; sheet: React.ReactElement } {
  const toast = useToast();
  const ask = useLocationAsk({
    detect: location.useCurrentLocation,
    onDetected: (place) => toast.show(grantedToast(place.label), "success"),
    onSearch: openSearch,
  });
  const sheet = <CustomerLocationSheet step={ask.sheet} busy={ask.busy} onPrimary={ask.primary} onAlt={ask.alt} onClose={ask.close} onPick={location.setManualPlace} />;
  return { start: ask.start, sheet };
}
