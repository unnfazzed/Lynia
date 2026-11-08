import { useCallback, useRef } from "react";
import { Share } from "react-native";
import { getShareLinkFor } from "../api/share";
import { EVENTS, track } from "../telemetry/events";
import { fill, SH } from "../ui/share/copy";

/**
 * SH-C (handoff shop-share-v1 README §2 "Customer app", D-129): the store's Share disc. Asks the API for the
 * business's link, then opens the phone's share menu with `SH.customer.shareText` (the full https link) and
 * `shareSubject`. Nothing else changes on the page. A business that isn't live, or a failed read, shares nothing.
 */
export function useShareStore(merchantId: string | undefined, shop: string, service: "restaurants" | "shops" | "pharmacy"): () => void {
  const busy = useRef(false);
  return useCallback(() => {
    if (!merchantId || busy.current) return;
    busy.current = true;
    void getShareLinkFor(merchantId)
      .then(async (res) => {
        if (!res.live || !res.link) return;
        const result = await Share.share({ message: fill(SH.customer.shareText, { shop, link: res.link }), title: fill(SH.customer.shareSubject, { shop }) });
        if (result.action === Share.sharedAction) track(EVENTS.shopLinkShared, { service, channel: "system" });
      })
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [merchantId, shop, service]);
}
