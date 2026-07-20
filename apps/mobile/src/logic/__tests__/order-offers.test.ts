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

  it("best returns one entry per input, each original offer once, carrying a recommended flag", () => {
    const r = orderOffers(OFFERS, "best");
    expect(r).toHaveLength(OFFERS.length);
    expect(new Set(r.map((x) => x.offer.id))).toEqual(new Set(["a", "b", "c"]));
    expect(r.some((x) => x.recommended)).toBe(true);
    expect(r.every((x) => typeof x.recommended === "boolean")).toBe(true);
  });

  it("does not mutate the input array", () => {
    const input = [...OFFERS];
    orderOffers(input, "cheapest");
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
