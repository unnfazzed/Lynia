import type { OfferRow } from "../../api/offers";
import { orderOffers } from "../order-offers";

function offer(id: string, fare: string, eta: number, ratingAvg: string, ratingCount = 10): OfferRow {
  return {
    id,
    type: "counter",
    offeredFare: fare,
    etaMinutes: eta,
    rider: {
      profileId: `r-${id}`,
      ratingAvg,
      ratingCount,
      tripsCount: 20,
      profile: { firstName: "R", lastName: id, photoUrl: null },
    },
  };
}

const OFFERS = [
  offer("a", "6.00", 12, "4.9"),
  offer("b", "4.00", 20, "4.2"),
  offer("c", "5.00", 8, "4.7"),
];

describe("orderOffers (extracted from the order screen, roadmap 3.5)", () => {
  it("returns [] for no offers", () => {
    expect(orderOffers([], "best")).toEqual([]);
  });

  it("cheapest sorts by ascending fare, no recommendation", () => {
    const r = orderOffers(OFFERS, "cheapest");
    expect(r.map((x) => x.offer.id)).toEqual(["b", "c", "a"]);
    expect(r.every((x) => x.recommended === false)).toBe(true);
  });

  it("fastest sorts by ascending ETA", () => {
    expect(orderOffers(OFFERS, "fastest").map((x) => x.offer.id)).toEqual(["c", "a", "b"]);
  });

  it("the rating fallback sorts by descending ratingAvg", () => {
    // Any non-best/cheapest/fastest mode falls through to rating-desc.
    expect(orderOffers(OFFERS, "rated" as never).map((x) => x.offer.id)).toEqual(["a", "c", "b"]);
  });

  it("best blends price/rating/eta and pins the exact rankOffers order + the one recommended offer", () => {
    // Hand-computed from rankOffers' DEFAULT_OFFER_WEIGHTS (price .45/rating .35/eta .2) against OFFERS:
    // score(a)=.483, score(b)=.45, score(c)=.675 → best-first c, a, b; only the top scorer is recommended.
    const r = orderOffers(OFFERS, "best");
    expect(r.map((x) => ({ id: x.offer.id, recommended: x.recommended }))).toEqual([
      { id: "c", recommended: true },
      { id: "a", recommended: false },
      { id: "b", recommended: false },
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [...OFFERS];
    orderOffers(input, "cheapest");
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
