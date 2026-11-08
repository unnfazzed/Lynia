import type { ShopShareCardResponse } from "@lynia/shared";
import { useEffect, useState } from "react";
import { getShopCard } from "../api/share";
import { loadPendingShop } from "./pending-shop";

/** What the chip needs: the pending code, and the shop's public card once it answers (null = no name to show). */
export interface PendingShopView {
  code: string;
  card: ShopShareCardResponse | null;
}

/**
 * The shop a share link is taking this signed-out person to, for the sign-in screens. `undefined` while reading,
 * `null` with no link pending. A card that can't be read (offline, a shop that went quiet) leaves `card` null and
 * the chip says "the shop" (SH-S5).
 */
export function usePendingShop(): PendingShopView | null | undefined {
  const [view, setView] = useState<PendingShopView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void loadPendingShop().then((p) => {
      if (!live) return;
      if (!p) return setView(null);
      setView({ code: p.code, card: null });
      getShopCard(p.code).then(
        (card) => live && setView({ code: p.code, card }),
        () => undefined,
      );
    });
    return () => {
      live = false;
    };
  }, []);
  return view;
}

