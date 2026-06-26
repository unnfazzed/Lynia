import { FARE, haversineKm, quoteFare, suggestFare } from "@lynia/shared";
import { describe, expect, it } from "vitest";

describe("haversineKm", () => {
  it("is zero for identical points", () => {
    expect(haversineKm({ lat: -17.83, lng: 31.05 }, { lat: -17.83, lng: 31.05 })).toBe(0);
  });

  it("matches the known length of one degree of latitude (~111 km)", () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111);
    expect(d).toBeLessThan(111.4);
  });

  it("is symmetric", () => {
    const a = { lat: -17.83, lng: 31.05 };
    const b = { lat: -17.78, lng: 31.10 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("suggestFare", () => {
  it("floors short hops at the minimum fare", () => {
    expect(suggestFare(0)).toBe(FARE.minUsd);
    expect(suggestFare(-5)).toBe(FARE.minUsd);
  });

  it("adds the per-km component above the floor", () => {
    // base 1.5 + 0.6 * 10 = 7.5
    expect(suggestFare(10)).toBe(7.5);
  });

  it("rounds to two decimals", () => {
    // base 1.5 + 0.6 * 3.333 = 3.4998 -> 3.5
    expect(suggestFare(3.333)).toBe(3.5);
  });

  it("never returns NaN for bad input", () => {
    expect(suggestFare(NaN)).toBe(FARE.minUsd);
    expect(haversineKm({ lat: NaN, lng: 0 }, { lat: 1, lng: 1 })).toBe(0);
  });
});

describe("quoteFare", () => {
  it("returns a rounded distance and a fare consistent with suggestFare", () => {
    const pickup = { lat: -17.8292, lng: 31.0522 };
    const dropoff = { lat: -17.8192, lng: 31.0622 };
    const q = quoteFare(pickup, dropoff);
    expect(q.distanceKm).toBeGreaterThan(1);
    expect(q.distanceKm).toBeLessThan(2);
    expect(Math.round(q.distanceKm * 100) / 100).toBe(q.distanceKm); // 2dp
    expect(q.suggestedFare).toBe(suggestFare(q.distanceKm));
  });
});
