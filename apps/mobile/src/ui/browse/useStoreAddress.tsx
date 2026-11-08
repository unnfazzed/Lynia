import React, { useState } from "react";
import type { HomeLocationApi } from "../../logic/home-location";
import { useLocationAskSheet } from "../home/LocationAsk";
import { LocationSheet } from "../home/LocationSheet";

/**
 * SH-A2 (handoff shop-share-v1 README §4, D-129): a store opened with no delivery address shows "Set where to
 * deliver" in its info strip. The cell opens the same ask the browse list's no-address row does: the First Run v2
 * location ask (PC1–PC7), whose search step is the Calm Mint H5 address sheet. `onSetAddress` is undefined once an
 * address is set, so the strip fills in normally.
 */
export function useStoreAddress(location: HomeLocationApi): { onSetAddress: (() => void) | undefined; sheets: React.ReactElement } {
  const [open, setOpen] = useState(false);
  const ask = useLocationAskSheet(location, () => setOpen(true));
  const sheets = (
    <>
      <LocationSheet
        visible={open}
        denied={location.denied}
        currentLabel={location.label}
        focusSearch
        onClose={() => setOpen(false)}
        onUseCurrentLocation={ask.start}
        onPick={location.setManualPlace}
      />
      {ask.sheet}
    </>
  );
  return { onSetAddress: location.point ? undefined : ask.start, sheets };
}
