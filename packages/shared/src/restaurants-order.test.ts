import { describe, it, expect } from "vitest";
import {
  RESTAURANTS_PRICING,
  deliveryFeeForDistance,
  smallOrderFeeForSubtotal,
  RESTAURANTS_TIMING,
  PREP_CHIPS_MIN,
  BUSY_MODE_EXTRA_MIN,
  MERCHANT_REJECTION_REASONS,
  rejectionCopy,
} from "./restaurants-order";

describe("RESTAURANTS_PRICING constants", () => {
  it("pins the N-01/N-15 numbers", () => {
    expect(RESTAURANTS_PRICING.deliveryFeePerKm).toBe(0.8);
    expect(RESTAURANTS_PRICING.deliveryFeeRoundingUnit).toBe(0.5);
    expect(RESTAURANTS_PRICING.deliveryFeeMin).toBe(1.5);
    expect(RESTAURANTS_PRICING.minOrderSubtotal).toBe(4.0);
    expect(RESTAURANTS_PRICING.smallOrderFee).toBe(1.0);
  });
});

describe("deliveryFeeForDistance — golden cases", () => {
  it("pins the design doc's own example (3.1km -> $2.50)", () => {
    // N-01: "Keeps a 3.1 km Avenues→Belgravia run at $2.50" — 0.8*3.1=2.48 rounds to the nearest 0.50.
    expect(deliveryFeeForDistance(3.1)).toBe(2.5);
  });

  const cases: [number, number][] = [
    [0, 1.5], // floored at the minimum
    [0.5, 1.5], // 0.4 rounds to 0.5, still below the floor
    [1, 1.5], // 0.8 rounds to 1.0, still below the floor
    [2, 1.5], // 1.6 rounds to 1.5
    [2.5, 2.0], // 2.0 rounds to 2.0
    [3.1, 2.5],
    [5, 4.0], // 4.0 rounds to 4.0
    [10, 8.0], // 8.0 rounds to 8.0
  ];
  it.each(cases)("deliveryFeeForDistance(%f) === %f", (km, expected) => {
    expect(deliveryFeeForDistance(km)).toBe(expected);
  });

  it("is fail-safe for non-finite or negative distance", () => {
    expect(deliveryFeeForDistance(Number.NaN)).toBe(RESTAURANTS_PRICING.deliveryFeeMin);
    expect(deliveryFeeForDistance(-5)).toBe(RESTAURANTS_PRICING.deliveryFeeMin);
    expect(deliveryFeeForDistance(Number.POSITIVE_INFINITY)).toBeGreaterThan(0);
  });

  it("never returns below the configured minimum", () => {
    for (let km = 0; km <= 3; km += 0.1) {
      expect(deliveryFeeForDistance(km)).toBeGreaterThanOrEqual(RESTAURANTS_PRICING.deliveryFeeMin);
    }
  });

  it("is monotonic non-decreasing in distance", () => {
    let prev = -Infinity;
    for (let km = 0; km <= 50; km += 0.5) {
      const fee = deliveryFeeForDistance(km);
      expect(fee).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = fee;
    }
  });
});

describe("smallOrderFeeForSubtotal — N-15", () => {
  it("charges the fee strictly below the minimum", () => {
    expect(smallOrderFeeForSubtotal(0)).toBe(1.0);
    expect(smallOrderFeeForSubtotal(2.5)).toBe(1.0);
    expect(smallOrderFeeForSubtotal(3.99)).toBe(1.0);
  });

  it("charges nothing at or above the minimum", () => {
    expect(smallOrderFeeForSubtotal(4.0)).toBe(0);
    expect(smallOrderFeeForSubtotal(4.01)).toBe(0);
    expect(smallOrderFeeForSubtotal(50)).toBe(0);
  });
});

describe("timing + prep chip config", () => {
  it("pins N-03 (3:00 accept window) and D-23/N-18 (60s item-approval window)", () => {
    expect(RESTAURANTS_TIMING.acceptWindowMs).toBe(3 * 60 * 1000);
    expect(RESTAURANTS_TIMING.itemApprovalWindowMs).toBe(60 * 1000);
  });

  it("pins N-04's five prep chips and N-17's busy-mode bump", () => {
    expect(PREP_CHIPS_MIN).toEqual([10, 15, 20, 30, 45]);
    expect(BUSY_MODE_EXTRA_MIN).toBe(10);
  });
});

describe("rejectionCopy — D-11", () => {
  it("returns the customer copy for every known reason", () => {
    for (const reason of Object.keys(MERCHANT_REJECTION_REASONS)) {
      expect(rejectionCopy(reason)).toBe(MERCHANT_REJECTION_REASONS[reason as keyof typeof MERCHANT_REJECTION_REASONS]);
    }
  });

  it("falls back to the generic copy for an unknown reason", () => {
    expect(rejectionCopy("not_a_real_reason")).toBe(MERCHANT_REJECTION_REASONS.other);
  });
});
