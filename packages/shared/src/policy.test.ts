import { describe, it, expect } from "vitest";
import {
  COMMISSION,
  canCoverJobCommission,
  jobCommissionBasis,
  perRideCommission,
  commissionBasis,
  resolveCommissionRatePct,
  isCommissionActive,
  customerRatingCarriesWeight,
  broadcastRadiusAtMs,
  BROADCAST,
  estimatePickupEtaMinutes,
  PICKUP_ETA,
} from "./policy";
import { NATIONWIDE_REACH_M } from "./service-area";

/**
 * Regression anchors for the commission money-math. `perRideCommission` / `commissionBasis` /
 * `resolveCommissionRatePct` decide what a rider is actually charged once the take-rate flips on, so
 * the exact rounding is load-bearing. Numbers pinned here are the CURRENT shipped output.
 */

describe("COMMISSION constants", () => {
  it("pins the owner's policy (2026-10-12): 10% after 10 free jobs, no minimum balance", () => {
    expect(COMMISSION.ratePct).toBe(10);
    expect(COMMISSION.freeFirstJobs).toBe(10);
    expect(COMMISSION.lowBalanceBlockBelow).toBe(0);
    expect(COMMISSION.basisFloorPct).toBe(0.5);
    expect(COMMISSION.model).toBe("prepaid_per_ride");
  });
});

describe("jobCommissionBasis — what each job type is charged on", () => {
  it("a parcel: the agreed fare, floored at half the suggested fare", () => {
    expect(jobCommissionBasis({ orderType: "parcel", agreedFare: 4, suggestedFare: 4 })).toBe(4);
    expect(jobCommissionBasis({ orderType: "parcel", agreedFare: 1, suggestedFare: 10 })).toBe(5);
  });
  it("a merchant job: the delivery fee, never the goods+delivery agreed total", () => {
    expect(jobCommissionBasis({ orderType: "merchant", agreedFare: 25, deliveryFee: 3 })).toBe(3);
  });
  it("null when the figure is missing", () => {
    expect(jobCommissionBasis({ orderType: "merchant", agreedFare: 25, deliveryFee: null })).toBeNull();
    expect(jobCommissionBasis({ orderType: "parcel", agreedFare: null })).toBeNull();
  });
});

describe("canCoverJobCommission — a biker can't take a job whose commission is more than their balance", () => {
  it("free jobs left (0–9 completed) → always", () => {
    expect(canCoverJobCommission({ ratePct: 10, tripsCount: 9, balance: 0, commission: 5 })).toBe(true);
  });
  it("past the free jobs → only when the balance covers it (equal is enough)", () => {
    expect(canCoverJobCommission({ ratePct: 10, tripsCount: 10, balance: 0.3, commission: 0.3 })).toBe(true);
    expect(canCoverJobCommission({ ratePct: 10, tripsCount: 10, balance: 0.29, commission: 0.3 })).toBe(false);
  });
  it("commission off → always", () => {
    expect(canCoverJobCommission({ ratePct: 0, tripsCount: 99, balance: 0, commission: 1 })).toBe(true);
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

  it("defaults to 10% (owner 2026-10-12) when no rate is passed", () => {
    expect(perRideCommission(10)).toBe(1);
    expect(perRideCommission(999.99)).toBe(100);
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
    [undefined, 10], // unset -> the 10% default (owner 2026-10-12)
    [null, 10],
    ["", 10],
    ["20", 20],
    [20, 20],
    ["12.5", 12.5],
    ["12.345", 12.35], // WD-010: rounded to 2dp
    ["-5", 10], // negative -> the default
    ["abc", 10], // non-numeric -> the default
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

describe("broadcastRadiusAtMs — nationwide reach (D-99)", () => {
  it.each([0, 29_999, 30_000, 60_000, 120_000])("broadcastRadiusAtMs(%d) is all of Zimbabwe from the start", (age) => {
    expect(broadcastRadiusAtMs(age)).toBe(NATIONWIDE_REACH_M);
  });

  it("has nothing left to widen", () => {
    expect(BROADCAST.expansion).toHaveLength(0);
  });

  it("still steps up a narrower base, capped at the nationwide reach", () => {
    expect(broadcastRadiusAtMs(0, 5_000)).toBe(5_000);
    expect(broadcastRadiusAtMs(0, 5_000_000)).toBe(BROADCAST.maxRadiusM);
  });

  it("never exceeds the cap", () => {
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

describe("estimatePickupEtaMinutes", () => {
  it("is the start time for a biker at the pickup (or a bad distance)", () => {
    expect(estimatePickupEtaMinutes(0)).toBe(PICKUP_ETA.startMinutes);
    expect(estimatePickupEtaMinutes(Number.NaN)).toBe(PICKUP_ETA.startMinutes);
  });

  it("adds riding time at the town speed", () => {
    // 5 km at 25 km/h = 12 min, plus the start.
    expect(estimatePickupEtaMinutes(5_000)).toBe(PICKUP_ETA.startMinutes + 12);
  });

  it("caps a cross-country distance", () => {
    expect(estimatePickupEtaMinutes(NATIONWIDE_REACH_M)).toBe(PICKUP_ETA.maxMinutes);
  });
});

describe("topupFee — the transaction fee the biker pays on a Paynow top-up (rounded UP to the cent)", () => {
  it("2.5% of the drawn amounts", async () => {
    const { topupFee } = await import("./policy");
    expect(topupFee(5, 2.5)).toBe(0.13);
    expect(topupFee(10, 2.5)).toBe(0.25);
    expect(topupFee(20, 2.5)).toBe(0.5);
    expect(topupFee(50, 2.5)).toBe(1.25);
    expect(topupFee(7, 2.5)).toBe(0.18);
  });
  it("is 0 for no amount or no fee", async () => {
    const { topupFee } = await import("./policy");
    expect(topupFee(0, 2.5)).toBe(0);
    expect(topupFee(5, 0)).toBe(0);
    expect(topupFee(Number.NaN, 2.5)).toBe(0);
  });
});
