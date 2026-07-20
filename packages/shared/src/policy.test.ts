import { describe, it, expect } from "vitest";
import {
  COMMISSION,
  perRideCommission,
  commissionBasis,
  resolveCommissionRatePct,
  isCommissionActive,
  customerRatingCarriesWeight,
  broadcastRadiusAtMs,
  BROADCAST,
} from "./policy";

/**
 * Regression anchors for the commission money-math. `perRideCommission` / `commissionBasis` /
 * `resolveCommissionRatePct` decide what a rider is actually charged once the take-rate flips on, so
 * the exact rounding is load-bearing. Numbers pinned here are the CURRENT shipped output.
 */

describe("COMMISSION constants", () => {
  it("pins the launch-period defaults", () => {
    expect(COMMISSION.ratePct).toBe(0); // 0% during the pilot — nothing deducted
    expect(COMMISSION.basisFloorPct).toBe(0.5);
    expect(COMMISSION.model).toBe("prepaid_per_ride");
  });
});

describe("perRideCommission — golden cases across rates", () => {
  // [amountPaid, ratePct, expectedCommission]
  const cases: [number, number, number][] = [
    [10, 0, 0],
    [100, 0, 0],
    [10, 20, 2],
    [100, 20, 20],
    [5.55, 20, 1.11],
    [12.34, 15, 1.85], // 12.34*0.15 = 1.851 -> round2 -> 1.85
    [10, 10, 1],
    [7.77, 33.33, 2.59],
    [10, 100, 10],
  ];
  it.each(cases)("perRideCommission(%f, %f%) === %f", (amount, rate, expected) => {
    expect(perRideCommission(amount, rate)).toBe(expected);
  });

  it("defaults to the launch rate (0%) when no rate is passed", () => {
    expect(perRideCommission(10)).toBe(0);
    expect(perRideCommission(999.99)).toBe(0);
  });

  it("rounds half a cent UP (Math.round, away from zero) — not banker's rounding", () => {
    // These expose the .xx5 boundary: raw = amount*rate/100 lands on an exact half-cent.
    expect(perRideCommission(0.5, 1)).toBe(0.01); // raw 0.005 -> 0.01
    expect(perRideCommission(0.3, 5)).toBe(0.02); // raw 0.015 -> 0.02
    expect(perRideCommission(2.5, 1)).toBe(0.03); // raw 0.025 -> 0.03
    expect(perRideCommission(0.01, 50)).toBe(0.01); // raw 0.005 -> 0.01
    expect(perRideCommission(0.03, 20)).toBe(0.01); // raw 0.006 -> 0.01
  });
});

describe("perRideCommission — property tests", () => {
  it("commission at 0% is always exactly 0", () => {
    for (let amount = 0; amount <= 1000; amount += 3.17) {
      expect(perRideCommission(amount, 0)).toBe(0);
    }
  });

  it("commission is monotonic non-decreasing in fare (fixed rate)", () => {
    for (const rate of [1, 5, 10, 20, 33.33, 100]) {
      let prev = -Infinity;
      for (let amount = 0; amount <= 500; amount += 0.37) {
        const c = perRideCommission(amount, rate);
        expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = c;
      }
    }
  });

  it("commission never exceeds the amount paid (rate <= 100%)", () => {
    for (const rate of [0, 10, 50, 100]) {
      for (let amount = 0; amount <= 200; amount += 1.23) {
        expect(perRideCommission(amount, rate)).toBeLessThanOrEqual(amount + 1e-9);
      }
    }
  });

  it("result is always rounded to at most 2 decimal places", () => {
    for (const rate of [7, 12.5, 33.33]) {
      for (let amount = 0; amount <= 100; amount += 0.19) {
        const c = perRideCommission(amount, rate);
        // Value equals its own 2dp rounding (float-tolerant: c*100 is not exactly integral in IEEE754).
        expect(Math.abs(c - Math.round(c * 100) / 100)).toBeLessThan(1e-9);
      }
    }
  });
});

describe("commissionBasis — anti-collusion floor", () => {
  // [agreedFare, suggestedFare, expectedBasis]
  const cases: [number, number | null | undefined, number][] = [
    [5, 10, 5], // agreed >= floor(5) -> agreed kept
    [8, 10, 8],
    [2, 10, 5], // agreed below floor(5) -> floored up to 5
    [10, 6, 10], // floor(3) < agreed -> agreed kept
    [3, 6, 3], // agreed == floor(3) -> agreed kept
  ];
  it.each(cases)("commissionBasis(%s, %s) === %s", (agreed, suggested, expected) => {
    expect(commissionBasis(agreed, suggested)).toBe(expected);
  });

  it("falls back to raw agreedFare (unfloored) when suggestedFare is missing/invalid", () => {
    expect(commissionBasis(5, null)).toBe(5);
    expect(commissionBasis(5, undefined)).toBe(5);
    expect(commissionBasis(5, 0)).toBe(5);
    expect(commissionBasis(5, -3)).toBe(5);
    expect(commissionBasis(5, Number.NaN)).toBe(5);
    expect(commissionBasis(5, Number.POSITIVE_INFINITY)).toBe(5);
  });

  it("floor equals basisFloorPct * suggestedFare, rounded to 2dp", () => {
    // suggested 7 -> floor round2(3.5) = 3.5; agreed 1 below floor -> basis 3.5
    expect(commissionBasis(1, 7)).toBe(3.5);
  });
});

describe("resolveCommissionRatePct — the flip override", () => {
  const cases: [string | number | null | undefined, number][] = [
    [undefined, 0], // unset -> launch default
    [null, 0],
    ["", 0],
    ["20", 20],
    [20, 20],
    ["12.5", 12.5],
    ["12.345", 12.35], // WD-010: rounded to 2dp
    ["-5", 0], // negative -> fail-safe default
    ["abc", 0], // non-numeric -> fail-safe default
    ["150", 100], // clamped to 100
    [150, 100],
    ["0", 0],
    [0, 0],
  ];
  it.each(cases)("resolveCommissionRatePct(%s) === %s", (raw, expected) => {
    expect(resolveCommissionRatePct(raw)).toBe(expected);
  });

  it("always yields a value in [0, 100] rounded to 2dp", () => {
    for (const raw of ["0", "0.001", "12.345", "99.999", "100", "1000", "-1", "abc", 47.5]) {
      const r = resolveCommissionRatePct(raw);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
      expect(Math.abs(r - Math.round(r * 100) / 100)).toBeLessThan(1e-9);
    }
  });
});

describe("isCommissionActive", () => {
  it("is true only for a strictly positive rate", () => {
    expect(isCommissionActive(0)).toBe(false);
    expect(isCommissionActive(-1)).toBe(false);
    expect(isCommissionActive(0.01)).toBe(true);
    expect(isCommissionActive(20)).toBe(true);
  });
});

describe("customerRatingCarriesWeight", () => {
  it("requires at least CUSTOMER_TRUST.minCompletedOrders (3) prior completed orders", () => {
    expect(customerRatingCarriesWeight(0)).toBe(false);
    expect(customerRatingCarriesWeight(2)).toBe(false);
    expect(customerRatingCarriesWeight(3)).toBe(true);
    expect(customerRatingCarriesWeight(5)).toBe(true);
  });
});

describe("broadcastRadiusAtMs — widening schedule", () => {
  // [ageMs, expectedRadiusM]
  const cases: [number, number][] = [
    [0, 5000],
    [29999, 5000], // just before the first step
    [30000, 8000], // first step boundary (inclusive)
    [59999, 8000],
    [60000, 12000], // second step boundary (inclusive)
    [120000, 12000], // never exceeds the last scheduled step
  ];
  it.each(cases)("broadcastRadiusAtMs(%d) === %d", (age, expected) => {
    expect(broadcastRadiusAtMs(age)).toBe(expected);
  });

  it("never exceeds the service-corridor cap", () => {
    for (let age = 0; age <= 600000; age += 5000) {
      expect(broadcastRadiusAtMs(age)).toBeLessThanOrEqual(BROADCAST.maxRadiusM);
    }
  });

  it("is monotonic non-decreasing in order age", () => {
    let prev = -Infinity;
    for (let age = 0; age <= 300000; age += 1000) {
      const r = broadcastRadiusAtMs(age);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});
