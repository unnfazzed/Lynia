import { describe, it, expect } from "vitest";
import {
  rankOffers,
  DEFAULT_OFFER_WEIGHTS,
  MERCHANT_OFFER_WEIGHTS,
  NEW_RIDER_RATING_SCORE,
  PREFERRED_OFFER_BONUS,
  type OfferRankInput,
} from "./offer-ranking";

/**
 * Regression anchors for best-match ranking. Order + `recommended` are what the customer actually sees,
 * so the pinned index order and scores below lock in the CURRENT blended-score behaviour: a change to
 * the weights, the normalization, or the tie-break trips a test instead of silently reordering offers.
 */

describe("ranking constants", () => {
  it("pins the default blend (price below rating+eta combined)", () => {
    expect(DEFAULT_OFFER_WEIGHTS).toEqual({ price: 0.45, rating: 0.35, eta: 0.2 });
    expect(DEFAULT_OFFER_WEIGHTS.rating + DEFAULT_OFFER_WEIGHTS.eta).toBeGreaterThan(DEFAULT_OFFER_WEIGHTS.price);
    expect(NEW_RIDER_RATING_SCORE).toBe(0.5);
  });
});

describe("rankOffers — golden ordering", () => {
  // A fixed spread: a solid all-rounder, the cheapest-but-worst, a premium best-rated/fastest,
  // and an unrated new rider. Index in the array = original offer index.
  const offers: OfferRankInput[] = [
    { offeredFare: 5.0, ratingAvg: 4.8, ratingCount: 40, etaMinutes: 8 }, // 0
    { offeredFare: 4.0, ratingAvg: 3.5, ratingCount: 10, etaMinutes: 15 }, // 1 (cheapest)
    { offeredFare: 6.0, ratingAvg: 5.0, ratingCount: 100, etaMinutes: 4 }, // 2 (best rated / fastest)
    { offeredFare: 4.5, ratingAvg: 0, ratingCount: 0, etaMinutes: 12 }, // 3 (unrated new rider)
  ];

  it("pins the best-first index order", () => {
    const ranked = rankOffers(offers);
    expect(ranked.map((r) => r.index)).toEqual([0, 3, 2, 1]);
  });

  it("pins the exact blended scores", () => {
    const ranked = rankOffers(offers);
    expect(ranked[0]).toEqual({ index: 0, score: 0.6556060606060606, recommended: true });
    expect(ranked[1]).toEqual({ index: 3, score: 0.5670454545454545, recommended: false });
    expect(ranked[2]).toEqual({ index: 2, score: 0.55, recommended: false });
    expect(ranked[3]).toEqual({ index: 1, score: 0.45, recommended: false });
  });

  it("recommends exactly the top offer (and only it)", () => {
    const ranked = rankOffers(offers);
    expect(ranked.filter((r) => r.recommended).map((r) => r.index)).toEqual([0]);
  });

  it("the cheapest offer does NOT automatically win", () => {
    const ranked = rankOffers(offers);
    const cheapest = ranked.find((r) => r.index === 1)!;
    expect(cheapest.recommended).toBe(false);
    expect(ranked[0]!.index).not.toBe(1);
  });
});

describe("rankOffers — edge cases", () => {
  it("returns [] for no offers", () => {
    expect(rankOffers([])).toEqual([]);
  });

  it("does NOT flag a lone offer as recommended (neutral 0.5 score)", () => {
    const ranked = rankOffers([{ offeredFare: 5, ratingAvg: 4.5, ratingCount: 20, etaMinutes: 7 }]);
    expect(ranked).toEqual([{ index: 0, score: 0.5, recommended: false }]);
  });

  it("recommends the winner once there are >= 2 offers", () => {
    const ranked = rankOffers([
      { offeredFare: 6, ratingAvg: 4, ratingCount: 10, etaMinutes: 10 },
      { offeredFare: 4, ratingAvg: 4, ratingCount: 10, etaMinutes: 10 },
    ]);
    expect(ranked.map((r) => r.index)).toEqual([1, 0]); // cheaper wins when only price differs
    expect(ranked[0]!.recommended).toBe(true);
    expect(ranked[1]!.recommended).toBe(false);
  });

  it("does not crash or produce NaN scores on non-finite inputs", () => {
    const ranked = rankOffers([
      { offeredFare: Number.NaN, ratingAvg: 4, ratingCount: 5, etaMinutes: 10 },
      { offeredFare: 5, ratingAvg: Number.POSITIVE_INFINITY, ratingCount: 5, etaMinutes: Number.NaN },
      { offeredFare: 4, ratingAvg: 4.5, ratingCount: 5, etaMinutes: 6 },
    ]);
    for (const r of ranked) {
      expect(Number.isFinite(r.score)).toBe(true);
    }
    expect(ranked).toHaveLength(3);
  });
});

describe("rankOffers — property tests", () => {
  const offers: OfferRankInput[] = [
    { offeredFare: 5.0, ratingAvg: 4.8, ratingCount: 40, etaMinutes: 8 },
    { offeredFare: 4.0, ratingAvg: 3.5, ratingCount: 10, etaMinutes: 15 },
    { offeredFare: 6.0, ratingAvg: 5.0, ratingCount: 100, etaMinutes: 4 },
    { offeredFare: 4.5, ratingAvg: 0, ratingCount: 0, etaMinutes: 12 },
  ];

  it("is deterministic — identical input yields byte-identical output", () => {
    expect(rankOffers(offers)).toEqual(rankOffers(offers));
    expect(rankOffers(offers)).toEqual(rankOffers(structuredClone(offers)));
  });

  it("returns exactly one entry per input, each original index once (a permutation)", () => {
    const ranked = rankOffers(offers);
    expect(ranked).toHaveLength(offers.length);
    expect(ranked.map((r) => r.index).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("is sorted by descending score", () => {
    const ranked = rankOffers(offers);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
    }
  });

  it("is stable for fully-equal offers — preserves original index order", () => {
    const equal: OfferRankInput[] = [
      { offeredFare: 5, ratingAvg: 4, ratingCount: 10, etaMinutes: 8 },
      { offeredFare: 5, ratingAvg: 4, ratingCount: 10, etaMinutes: 8 },
      { offeredFare: 5, ratingAvg: 4, ratingCount: 10, etaMinutes: 8 },
    ];
    const ranked = rankOffers(equal);
    expect(ranked.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(ranked.map((r) => r.score)).toEqual([0.5, 0.5, 0.5]);
    expect(ranked.map((r) => r.recommended)).toEqual([true, false, false]);
  });
});

describe("rankOffers — a business's own riders (merchant web upgrade L3)", () => {
  const base = { ratingAvg: 4.5, ratingCount: 20 };

  it("changes nothing without the merchant weights, even when an offer is flagged", () => {
    const offers: OfferRankInput[] = [
      { offeredFare: 5, etaMinutes: 8, ...base, preferred: true },
      { offeredFare: 4, etaMinutes: 8, ...base },
    ];
    expect(rankOffers(offers).map((r) => r.index)).toEqual([1, 0]);
    expect(rankOffers(offers.map(({ preferred: _p, ...o }) => o)).map((r) => r.score)).toEqual(rankOffers(offers).map((r) => r.score));
  });

  it("lists the business's rider first when another offer is only cheaper", () => {
    const offers: OfferRankInput[] = [
      { offeredFare: 4, etaMinutes: 8, ...base },
      { offeredFare: 5, etaMinutes: 8, ...base, preferred: true },
    ];
    expect(rankOffers(offers, MERCHANT_OFFER_WEIGHTS).map((r) => r.index)).toEqual([1, 0]);
  });

  it("lists the business's rider first when another offer is only sooner, or only better rated", () => {
    const sooner: OfferRankInput[] = [
      { offeredFare: 5, etaMinutes: 3, ...base },
      { offeredFare: 5, etaMinutes: 12, ...base, preferred: true },
    ];
    expect(rankOffers(sooner, MERCHANT_OFFER_WEIGHTS)[0]!.index).toBe(1);
    const rated: OfferRankInput[] = [
      { offeredFare: 5, etaMinutes: 8, ratingAvg: 5, ratingCount: 90 },
      { offeredFare: 5, etaMinutes: 8, ratingAvg: 3.9, ratingCount: 9, preferred: true },
    ];
    expect(rankOffers(rated, MERCHANT_OFFER_WEIGHTS)[0]!.index).toBe(1);
  });

  it("puts another offer first when it's clearly better on fare and ETA together", () => {
    const offers: OfferRankInput[] = [
      { offeredFare: 6, etaMinutes: 15, ...base, preferred: true },
      { offeredFare: 3.5, etaMinutes: 4, ...base },
    ];
    expect(rankOffers(offers, MERCHANT_OFFER_WEIGHTS).map((r) => r.index)).toEqual([1, 0]);
    expect(PREFERRED_OFFER_BONUS).toBeGreaterThan(Math.max(DEFAULT_OFFER_WEIGHTS.price, DEFAULT_OFFER_WEIGHTS.rating, DEFAULT_OFFER_WEIGHTS.eta));
    expect(PREFERRED_OFFER_BONUS).toBeLessThan(DEFAULT_OFFER_WEIGHTS.price + DEFAULT_OFFER_WEIGHTS.eta);
  });

  it("ranks several of the business's riders among themselves on the usual blend", () => {
    const offers: OfferRankInput[] = [
      { offeredFare: 5, etaMinutes: 6, ...base, preferred: true },
      { offeredFare: 4.5, etaMinutes: 5, ...base, preferred: true },
      { offeredFare: 4, etaMinutes: 6, ...base },
    ];
    expect(rankOffers(offers, MERCHANT_OFFER_WEIGHTS).map((r) => r.index)).toEqual([1, 0, 2]);
  });

  it("lets a clearly better offer sit above a weaker one of the business's riders", () => {
    const offers: OfferRankInput[] = [
      { offeredFare: 5, etaMinutes: 10, ...base, preferred: true },
      { offeredFare: 4, etaMinutes: 5, ...base, preferred: true },
      { offeredFare: 3, etaMinutes: 4, ...base },
    ];
    expect(rankOffers(offers, MERCHANT_OFFER_WEIGHTS).map((r) => r.index)).toEqual([1, 2, 0]);
  });
});
