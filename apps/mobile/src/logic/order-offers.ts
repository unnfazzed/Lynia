import { rankOffers } from "@lynia/shared";
import type { OfferRow } from "../api/offers";
import type { SortMode } from "./order-labels";

export interface OrderedOffer {
  offer: OfferRow;
  recommended: boolean;
}

/**
 * Order the customer's incoming offers for display (roadmap 3.5 — pure logic extracted from the
 * 1172-line `app/order/[id].tsx` so it can be unit-tested and the god screen shrinks toward its view).
 *
 * `"best"` defers to the shared `rankOffers` blend (fare × rating × ETA) and carries its `recommended`
 * flag; the other modes are a single-key sort with no recommendation. Behaviour is byte-identical to the
 * former in-screen `useMemo` — the screen now just calls this. Pure + deterministic.
 */
export function orderOffers(offers: readonly OfferRow[], sortMode: SortMode): OrderedOffer[] {
  if (offers.length === 0) return [];
  if (sortMode === "best") {
    const ranked = rankOffers(
      offers.map((o) => ({
        offeredFare: Number(o.offeredFare),
        ratingAvg: Number(o.rider.ratingAvg),
        ratingCount: o.rider.ratingCount,
        etaMinutes: o.etaMinutes,
      })),
    );
    return ranked.map((r) => ({ offer: offers[r.index]!, recommended: r.recommended }));
  }
  const sorted = [...offers];
  if (sortMode === "cheapest") sorted.sort((a, b) => Number(a.offeredFare) - Number(b.offeredFare));
  else if (sortMode === "fastest") sorted.sort((a, b) => a.etaMinutes - b.etaMinutes);
  else sorted.sort((a, b) => Number(b.rider.ratingAvg) - Number(a.rider.ratingAvg));
  return sorted.map((offer) => ({ offer, recommended: false }));
}
