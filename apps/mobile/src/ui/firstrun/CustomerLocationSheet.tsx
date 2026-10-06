import React, { useEffect, useState } from "react";
import { View } from "react-native";
import type { HomePlace } from "../../logic/home-location";
import type { LocationSheetStep } from "../../logic/location-ask";
import { AddressSearch } from "../AddressSearch";
import { PC } from "./copy";
import { Body, HeroDisc, HeroPanel, SplitTitle } from "./hero";
import { PinnedFooter } from "./actions";
import { FrSheet } from "./sheet";
import { SystemSettingsSteps } from "./steps";

/**
 * First Run v2 PC1–PC6 — the customer location sheet over Home (handoff `first-run-v2` README §2A, ledger
 * D-82). One sheet, the same from H6 "Use my location" and H5 "Use my current location" (BRIEF 3); Home
 * stays visible behind it. Presentational: the state machine is `useLocationAsk` (logic/location-ask.ts).
 *
 *   explain  PC1  mint hero 150 · navigation · "Deliver to your door" · Use my location / Type an address
 *   approx   PC3  mint hero 130 · map-pin · "Turn on precise location" · Use precise location / Type an address instead
 *   denied   PC4  no hero · "No problem. Type your address" · the address search, focused
 *   blocked  PC5  no hero · "Location is blocked" (danger) · the 3 phone-settings steps · Open phone settings / Type an address
 *   gps      PC6  neutral hero 130 · map-pin · "Your phone's location is off" · Turn on location / Type an address
 *
 * Not in the `src/ui` barrel: it reaches AddressSearch, which imports the barrel back (the same reason
 * Home imports LocationSheet directly).
 */
export function CustomerLocationSheet({
  step,
  busy,
  onPrimary,
  onAlt,
  onClose,
  onPick,
}: {
  step: LocationSheetStep | null;
  busy: boolean;
  onPrimary: () => void;
  onAlt: () => void;
  onClose: () => void;
  onPick: (place: HomePlace) => void;
}): React.ReactElement {
  // Keep drawing the last step while the sheet slides out, so it never flashes empty.
  const [shown, setShown] = useState<LocationSheetStep>(step ?? "explain");
  useEffect(() => {
    if (step) setShown(step);
  }, [step]);
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    if (step === "denied") setFocus((n) => n + 1);
  }, [step]);

  return (
    <FrSheet visible={step != null} onClose={onClose} testID={`pc-sheet-${shown}`}>
      {shown === "explain" ? (
        <>
          <HeroPanel height={150}>
            <HeroDisc icon="navigation" />
          </HeroPanel>
          <SplitTitle a={PC.locA} b={PC.locB} />
          <Body>{PC.locBody}</Body>
          <PinnedFooter inline primary={{ label: PC.locCta, icon: "navigation", onPress: onPrimary, loading: busy, testID: "pc1-cta" }} link={{ label: PC.locAlt, onPress: onAlt, testID: "pc-alt" }} />
        </>
      ) : shown === "approx" ? (
        <>
          <HeroPanel height={130}>
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={PC.approxA} b={PC.approxB} />
          <Body>{PC.approxBody}</Body>
          <PinnedFooter inline primary={{ label: PC.approxCta, icon: "navigation", onPress: onPrimary, loading: busy, testID: "pc3-cta" }} link={{ label: PC.approxAlt, onPress: onAlt, testID: "pc-alt" }} />
        </>
      ) : shown === "denied" ? (
        <>
          <SplitTitle a={PC.deniedA} b={PC.deniedB} style={{ marginTop: 0 }} />
          <Body>{PC.deniedBody}</Body>
          <View style={{ marginTop: 16 }}>
            <AddressSearch
              label={PC.deniedB}
              placeholder={PC.searchPh}
              focusSignal={focus}
              variant="sheet"
              onResolved={(place) => {
                onPick({ label: place.landmark, lat: place.lat, lng: place.lng });
                onClose();
              }}
            />
          </View>
        </>
      ) : shown === "blocked" ? (
        <>
          <SplitTitle a={PC.foreverA} b={PC.foreverB} tone="danger" style={{ marginTop: 0 }} />
          <Body>{PC.foreverBody}</Body>
          <SystemSettingsSteps steps={[PC.step1, PC.step2, PC.step3]} />
          <PinnedFooter inline primary={{ label: PC.openSettings, onPress: onPrimary, testID: "pc5-cta" }} link={{ label: PC.locAlt, onPress: onAlt, testID: "pc-alt" }} />
        </>
      ) : (
        <>
          <HeroPanel tone="neutral" height={130}>
            <HeroDisc icon="map-pin" />
          </HeroPanel>
          <SplitTitle a={PC.gpsA} b={PC.gpsB} tone="neutral" />
          <Body>{PC.gpsBody}</Body>
          <PinnedFooter inline primary={{ label: PC.gpsCta, onPress: onPrimary, loading: busy, testID: "pc6-cta" }} link={{ label: PC.locAlt, onPress: onAlt, testID: "pc-alt" }} />
        </>
      )}
    </FrSheet>
  );
}

/** PC7's toast: the handoff's line with its sample address swapped for the resolved one. */
const SAMPLE_ADDRESS = "12 Samora Machel Ave";
export function grantedToast(label: string): string {
  return PC.grantedToast.replace(SAMPLE_ADDRESS, label);
}
