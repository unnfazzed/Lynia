import { formatPhoneLocal } from "@lynia/shared";
import { useCallback } from "react";
import { Linking } from "react-native";
import { useToast } from "./Toast";

/**
 * Dial a number, and say so when this device can't. `Linking.openURL("tel:…")` rejects where there is
 * no phone app: an iPad or iPod with no paired iPhone, which is where App Review runs an iPhone app in
 * compatibility mode. A bare `void Linking.openURL(…)` turned that into a Call button that did nothing.
 * The toast names the number so it can be dialled from a phone.
 */
export function useDial(): (phone: string | null | undefined) => void {
  const { show } = useToast();
  return useCallback(
    (phone: string | null | undefined) => {
      if (!phone) return;
      Linking.openURL(`tel:${phone}`).catch(() => {
        show(`This device can't make calls. Dial ${formatPhoneLocal(phone)} from a phone.`, "info");
      });
    },
    [show],
  );
}
