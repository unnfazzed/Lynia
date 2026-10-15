import { describe, it, expect } from "vitest";
import { FARE, FARE_UNIT_USD, haversineKm, isFareUnit, roundFare, stepFare, suggestFare, quoteFare } from "./pricing";
import type { LatLng } from "./contracts";

/**
 * Regression anchors for the suggested-fare / distance model. The exact numbers below are the CURRENT
 * output of the shipped functions — they pin behaviour so an accidental change to the fare formula,
 * the rounding, or the Haversine constants trips a test rather than silently repricing every ride.
 */

// --- Known Harare-corridor points (used across pricing + geo tests). ---
const HARARE_CBD: LatLng = { lat: -17.8292, lng: 31.0522 };
const AVONDALE: LatLng = { lat: -17.8003, lng: 31.0335 };
const CHITUNGWIZA: LatLng = { lat: -18.0128, lng: 31.0756 };

describe("FARE constants", () => {
  it("pins the launch pilot fare model", () => {
    expect(FARE.baseUsd).toBe(1.5);
    expect(FARE.perKmUsd).toBe(0.6);
    expect(FARE.minUsd).toBe(1.5);
    expect(FARE.earthRadiusKm).toBe(6371);
  });
});

describe("suggestFare — golden cases", () => {
  // [distanceKm, expectedFareUsd] — spread of short / medium / long / edge distances.
  const cases: [number, number][] = [
    [0, 1.5], // floored at minUsd
    [0.1, 1.5], // 1.56 -> nearest 50c
    [0.5, 2], // 1.80
    [1, 2], // 2.10
    [2.3, 3], // 2.88
    [5, 4.5],
    [5.7, 5], // 4.92
    [10, 7.5],
    [12.34, 9], // 8.904
    [25, 16.5],
    [100, 61.5],
  ];
  it.each(cases)("suggestFare(%f) === %f", (km, expected) => {
    expect(suggestFare(km)).toBe(expected);
  });

  it("floors at FARE.minUsd for zero / negative distance", () => {
    expect(suggestFare(0)).toBe(FARE.minUsd);
    expect(suggestFare(-3)).toBe(1.5);
  });

  it("is fail-safe for non-finite distance (falls back to minUsd)", () => {
    expect(suggestFare(Number.NaN)).toBe(1.5);
    expect(suggestFare(Number.POSITIVE_INFINITY)).toBe(1.5);
    expect(suggestFare(Number.NEGATIVE_INFINITY)).toBe(1.5);
  });

  it("always returns a whole number of 50c", () => {
    for (let km = 0; km <= 50; km += 0.37) expect(isFareUnit(suggestFare(km))).toBe(true);
  });

  it("is monotonic non-decreasing in distance", () => {
    let prev = -Infinity;
    for (let km = 0; km <= 200; km += 0.5) {
      const fare = suggestFare(km);
      expect(fare).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = fare;
    }
  });
});

describe("haversineKm — golden distances", () => {
  it("pins CBD -> Avondale (~3.77 km)", () => {
    expect(haversineKm(HARARE_CBD, AVONDALE)).toBeCloseTo(3.774358060129511, 9);
  });

  it("pins CBD -> Chitungwiza (~20.56 km)", () => {
    expect(haversineKm(HARARE_CBD, CHITUNGWIZA)).toBeCloseTo(20.56495232601788, 9);
  });

  it("returns exactly 0 for identical points (property: haversine(a,a) === 0)", () => {
    const pts: LatLng[] = [HARARE_CBD, AVONDALE, CHITUNGWIZA, { lat: 0, lng: 0 }, { lat: 51.5, lng: -0.12 }];
    for (const p of pts) {
      expect(haversineKm(p, p)).toBe(0);
    }
  });

  it("is symmetric (property: haversine(a,b) === haversine(b,a) within epsilon)", () => {
    const pts: LatLng[] = [HARARE_CBD, AVONDALE, CHITUNGWIZA, { lat: 0, lng: 0 }, { lat: -33.9, lng: 18.4 }];
    for (const a of pts) {
      for (const b of pts) {
        expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 12);
      }
    }
  });

  it("is fail-safe (returns 0) when any coordinate is non-finite", () => {
    expect(haversineKm({ lat: Number.NaN, lng: 1 }, { lat: 2, lng: 3 })).toBe(0);
    expect(haversineKm({ lat: 1, lng: Number.POSITIVE_INFINITY }, { lat: 2, lng: 3 })).toBe(0);
    expect(haversineKm({ lat: 1, lng: 2 }, { lat: Number.NaN, lng: 3 })).toBe(0);
  });

  it("is non-negative for a spread of pairs", () => {
    const pts: LatLng[] = [HARARE_CBD, AVONDALE, CHITUNGWIZA, { lat: 0, lng: 0 }, { lat: 89, lng: 179 }];
    for (const a of pts) {
      for (const b of pts) {
        expect(haversineKm(a, b)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("quoteFare — golden pairs", () => {
  it("pins CBD -> Avondale distance + fare", () => {
    expect(quoteFare(HARARE_CBD, AVONDALE)).toEqual({ distanceKm: 3.77, suggestedFare: 4 });
  });

  it("pins CBD -> Chitungwiza distance + fare", () => {
    expect(quoteFare(HARARE_CBD, CHITUNGWIZA)).toEqual({ distanceKm: 20.56, suggestedFare: 14 });
  });

  it("floors at minUsd for a zero-distance trip", () => {
    expect(quoteFare(HARARE_CBD, HARARE_CBD)).toEqual({ distanceKm: 0, suggestedFare: 1.5 });
  });

  it("computes suggestedFare off the ROUNDED distance (2dp) it reports", () => {
    // Pinning the current double-rounding behaviour: distance is round2'd first, then priced.
    const q = quoteFare(HARARE_CBD, CHITUNGWIZA);
    expect(q.suggestedFare).toBe(suggestFare(q.distanceKm));
  });
});

describe("50c fares (owner 2026-10-15)", () => {
  it("roundFare goes to the nearest 50c, half up, never below 50c", () => {
    expect(FARE_UNIT_USD).toBe(0.5);
    expect(roundFare(3.42)).toBe(3.5);
    expect(roundFare(3.24)).toBe(3);
    expect(roundFare(3.25)).toBe(3.5);
    expect(roundFare(3.74)).toBe(3.5);
    expect(roundFare(3.75)).toBe(4);
    expect(roundFare(4)).toBe(4);
    expect(roundFare(0.1)).toBe(0.5);
    expect(roundFare(Number.NaN)).toBe(0.5);
  });

  it("isFareUnit accepts only the 50c grid", () => {
    expect(isFareUnit(3.5)).toBe(true);
    expect(isFareUnit(3)).toBe(true);
    expect(isFareUnit(3.42)).toBe(false);
    expect(isFareUnit(3.1)).toBe(false);
  });

  it("stepFare moves to the next 50c in that direction and snaps an off-grid fare", () => {
    expect(stepFare(3.5, 1)).toBe(4);
    expect(stepFare(3.5, -1)).toBe(3);
    expect(stepFare(3.42, 1)).toBe(3.5);
    expect(stepFare(3.42, -1)).toBe(3);
    expect(stepFare(0.5, -1)).toBe(0.5);
    expect(stepFare(2, -1, 1.5)).toBe(1.5);
    expect(stepFare(1.5, -1, 1.5)).toBe(1.5);
  });
});
