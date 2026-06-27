import { NEW_RIDER_RATING_SCORE, type OfferRankInput, rankOffers } from "@lynia/shared";
import { describe, expect, it } from "vitest";

/** Helper: an offer with sensible defaults, override what the test cares about. */
const o = (over: Partial<OfferRankInput> = {}): OfferRankInput => ({
  offeredFare: 3,
  ratingAvg: 4.5,
  ratingCount: 20,
  etaMinutes: 10,
  ...over,
});

describe("rankOffers", () => {
  it("returns [] for no offers and no marker for a lone offer", () => {
    expect(rankOffers([])).toEqual([]);
    const one = rankOffers([o()]);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ index: 0, recommended: false });
  });

  it("ranks the all-round best offer first and marks it recommended", () => {
    // index 1 is cheapest, best-rated, and fastest — it should win outright.
    const offers = [
      o({ offeredFare: 4.0, ratingAvg: 4.2, ratingCount: 30, etaMinutes: 12 }),
      o({ offeredFare: 2.5, ratingAvg: 4.9, ratingCount: 80, etaMinutes: 6 }),
      o({ offeredFare: 3.2, ratingAvg: 4.5, ratingCount: 10, etaMinutes: 9 }),
    ];
    const ranked = rankOffers(offers);
    expect(ranked[0]).toMatchObject({ index: 1, recommended: true });
    expect(ranked.map((r) => r.index)).toEqual([1, 2, 0]);
    // only the top entry is recommended
    expect(ranked.slice(1).every((r) => !r.recommended)).toBe(true);
  });

  it("does not always pick the cheapest — rating + ETA can outweigh a small price gap", () => {
    // A is marginally cheaper but poorly rated and slow; B is barely pricier, top-rated and fast.
    const offers = [
      o({ offeredFare: 2.9, ratingAvg: 3.2, ratingCount: 40, etaMinutes: 18 }), // cheapest
      o({ offeredFare: 3.0, ratingAvg: 4.9, ratingCount: 120, etaMinutes: 5 }),
    ];
    const ranked = rankOffers(offers);
    expect(ranked[0]!.index).toBe(1); // best-match, not the cheapest
  });

  it("does not let an unrated rider out-rank a lone proven 5★ rider (regression: P2)", () => {
    // Only one rated rider in the batch → its rating min===max collapses to neutral 0.5; the new-rider
    // baseline must not exceed that, so with identical fare/ETA the proven rider wins the tie-break.
    const offers = [
      o({ ratingAvg: 5.0, ratingCount: 90, offeredFare: 3, etaMinutes: 8 }), // lone proven rider
      o({ ratingAvg: 0, ratingCount: 0, offeredFare: 3, etaMinutes: 8 }), // brand new, same fare/ETA
    ];
    const ranked = rankOffers(offers);
    expect(ranked[0]!.index).toBe(0); // the 5★ rider is not buried by the unrated one
    expect(NEW_RIDER_RATING_SCORE).toBeLessThanOrEqual(0.5);
  });

  it("scores a new rider (no ratings) at the neutral baseline, not bottom", () => {
    // The new rider is cheapest + fastest; the neutral rating baseline must not bury it.
    const offers = [
      o({ offeredFare: 4.0, ratingAvg: 5.0, ratingCount: 200, etaMinutes: 14 }),
      o({ offeredFare: 2.5, ratingAvg: 0, ratingCount: 0, etaMinutes: 5 }), // brand new
    ];
    const ranked = rankOffers(offers);
    expect(ranked[0]!.index).toBe(1);
  });

  it("uses the neutral baseline constant for an unrated rider's rating dimension", () => {
    // Two identical offers except ratings: one rated 5.0, one unrated. With only these two, the rated
    // rider's normalized rating is 1.0 (it's the only rated point → max===min → 0.5)... so make it 3 offers.
    const offers = [
      o({ ratingAvg: 5.0, ratingCount: 50 }),
      o({ ratingAvg: 3.0, ratingCount: 50 }),
      o({ ratingAvg: 0, ratingCount: 0 }), // unrated → NEW_RIDER_RATING_SCORE (0.6), between the two
    ];
    const ranked = rankOffers(offers);
    // identical fare/eta → pure rating order: 5.0 (1.0) > new (0.6) > 3.0 (0.0)
    expect(ranked.map((r) => r.index)).toEqual([0, 2, 1]);
    expect(NEW_RIDER_RATING_SCORE).toBeGreaterThan(0);
    expect(NEW_RIDER_RATING_SCORE).toBeLessThan(1);
  });

  it("is stable when every offer is identical (preserves original order, none recommended past the first)", () => {
    const offers = [o(), o(), o()];
    const ranked = rankOffers(offers);
    expect(ranked.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(ranked[0]!.recommended).toBe(true);
    expect(ranked.slice(1).every((r) => !r.recommended)).toBe(true);
  });

  it("respects custom weights (pure-price weighting picks the cheapest)", () => {
    const offers = [
      o({ offeredFare: 3.0, ratingAvg: 5.0, ratingCount: 100, etaMinutes: 4 }),
      o({ offeredFare: 2.0, ratingAvg: 3.0, ratingCount: 100, etaMinutes: 20 }), // cheapest only
    ];
    const ranked = rankOffers(offers, { price: 1, rating: 0, eta: 0 });
    expect(ranked[0]!.index).toBe(1);
  });
});
