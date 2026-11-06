import { describe, expect, it } from "vitest";
import {
  deliveryPriceRange,
  ceilingBounds,
  ceilingMoney,
  topUpChoices,
  customerDeliveryPart,
  DELIVERY_CEILING,
  isValidCeiling,
  offerForRound,
  recommendedDeliveryUsd,
  startingOffer,
} from "./delivery-ceiling";

// Plan §4 tables (docs/plans/2026-11-05-delivery-price-ceiling.md) — every row, to the cent.
const ROWS: Array<[km: number, rec: number, min: number, max: number, start: number]> = [
  [1, 2.0, 1.5, 4.0, 1.5],
  [2, 2.5, 2.0, 5.0, 2.0],
  [2.5, 3.0, 2.5, 6.0, 2.5],
  [5, 4.5, 3.5, 9.0, 3.5],
  [7.5, 6.0, 5.0, 12.0, 5.0],
  [10, 7.5, 6.0, 15.0, 6.0],
];

describe("delivery ceiling — plan §4 goldens", () => {
  it.each(ROWS)("%s km → rec %s, min %s, max %s, start %s", (km, rec, min, max, start) => {
    expect(recommendedDeliveryUsd(km)).toBe(rec);
    expect(ceilingBounds(rec)).toEqual({ recommended: rec, min, max });
    expect(startingOffer(rec, rec)).toBe(start);
  });

  it("the starting offer never exceeds a lowered ceiling", () => {
    expect(startingOffer(3, 2.5)).toBe(2.5);
    expect(startingOffer(4.5, 3.5)).toBe(3.5);
  });

  it("validates the ceiling on the 50c grid inside the bounds", () => {
    expect(isValidCeiling(3, 3)).toBe(true);
    expect(isValidCeiling(2.5, 3)).toBe(true);
    expect(isValidCeiling(6, 3)).toBe(true);
    expect(isValidCeiling(2, 3)).toBe(false);
    expect(isValidCeiling(6.5, 3)).toBe(false);
    expect(isValidCeiling(3.25, 3)).toBe(false);
    expect(isValidCeiling(Number.NaN, 3)).toBe(false);
  });
});

describe("offerForRound — the ladder", () => {
  it("climbs 50c a round to the ceiling, then holds (2.5 km example)", () => {
    const o = (round: number) => offerForRound({ round, start: 2.5, ceiling: 3 });
    expect([1, 2, 3, 6, 9].map(o)).toEqual([2.5, 3, 3, 3, 3]);
  });

  it("adds the shop top-up on top of the ladder", () => {
    expect(offerForRound({ round: 7, start: 2.5, ceiling: 3, topUp: 1 })).toBe(4);
  });

  it("a re-dispatch never offers below the last accepted price", () => {
    expect(offerForRound({ round: 1, start: 2, ceiling: 3, floor: 2.5 })).toBe(2.5);
  });

  it("property: never above ceiling + top-up, never below min(start, ceiling)", () => {
    for (let km = 0; km <= 20; km += 0.7) {
      const rec = recommendedDeliveryUsd(km);
      const b = ceilingBounds(rec);
      for (let c = b.min; c <= b.max; c += DELIVERY_CEILING.stepUsd) {
        const start = startingOffer(rec, c);
        for (const topUp of [0, ...DELIVERY_CEILING.topUpsUsd]) {
          for (let round = 1; round <= 12; round++) {
            const offer = offerForRound({ round, start, ceiling: c, topUp });
            expect(Math.round(offer * 100)).toBeLessThanOrEqual(Math.round((c + topUp) * 100));
            expect(Math.round(offer * 100)).toBeGreaterThanOrEqual(Math.round((Math.min(start, c) + topUp) * 100));
            expect(Math.round(offer * 100) % 50).toBe(0);
            expect(Math.round(customerDeliveryPart(offer, topUp) * 100)).toBeLessThanOrEqual(Math.round(c * 100));
          }
        }
      }
    }
  });
});

describe("ceilingMoney / topUpChoices", () => {
  it("no top-up: the customer pays goods + rung", () => {
    expect(ceilingMoney({ goods: 67, ladder: 2.5 })).toEqual({ deliveryFee: 2.5, merchantDeliveryShare: null, customerTotal: 69.5 });
  });
  it("a top-up rides in the share: rider gets rung + top-up, customer pays goods + rung (handoff M6a-t)", () => {
    expect(ceilingMoney({ goods: 67, ladder: 3, topUp: 1 })).toEqual({ deliveryFee: 4, merchantDeliveryShare: 1, customerTotal: 70 });
  });
  it("free-delivery venue funds the whole fee", () => {
    expect(ceilingMoney({ goods: 67, ladder: 2.5, venueFunded: true })).toEqual({ deliveryFee: 2.5, merchantDeliveryShare: 2.5, customerTotal: 67 });
  });
  it("the share never exceeds the goods total", () => {
    expect(ceilingMoney({ goods: 0.5, ladder: 3, topUp: 2 }).merchantDeliveryShare).toBe(0.5);
  });
  it("top-up choices are capped by the goods total", () => {
    expect(topUpChoices(67, 0)).toEqual([0.5, 1, 2]);
    expect(topUpChoices(1.5, 0)).toEqual([0.5, 1]);
    expect(topUpChoices(3, 2)).toEqual([0.5, 1]);
  });
});

describe("deliveryPriceRange (D-128)", () => {
  it("runs from the starting offer, at least $1 wide", () => {
    expect(deliveryPriceRange(1.9)).toEqual({ low: 2, high: 3 });
    expect(deliveryPriceRange(0)).toEqual({ low: 1.5, high: 2.5 });
  });

  it("always holds Recommended and stays on the 50c grid", () => {
    for (let km = 0; km <= 30; km += 0.25) {
      const { low, high } = deliveryPriceRange(km);
      const rec = recommendedDeliveryUsd(km);
      expect(high - low).toBeGreaterThanOrEqual(1);
      expect(rec).toBeGreaterThanOrEqual(low);
      expect(rec).toBeLessThanOrEqual(high);
      expect((high * 100) % 50).toBe(0);
    }
  });
});
