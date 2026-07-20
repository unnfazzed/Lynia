import { describe, expect, it } from "vitest";
import { addMoney, fromCents, percentOf, roundToCents, subMoney, toCents } from "./money";

describe("money — integer-cents arithmetic", () => {
  it("toCents/fromCents round-trip 2dp amounts exactly", () => {
    expect(toCents(1.5)).toBe(150);
    expect(toCents(0.1)).toBe(10);
    expect(fromCents(150)).toBe(1.5);
    expect(fromCents(toCents(3.77))).toBe(3.77);
  });

  it("addMoney carries no float accumulation error (the whole point)", () => {
    // The float trap: 0.1 + 0.2 === 0.30000000000000004. Integer cents avoids it.
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(addMoney(0.1, 0.2, 0.3)).toBe(0.6);
    // A long running balance stays exact.
    expect(addMoney(...Array.from({ length: 10 }, () => 0.1))).toBe(1);
  });

  it("subMoney is exact", () => {
    expect(subMoney(0.3, 0.1)).toBe(0.2);
    expect(subMoney(10, 2.5)).toBe(7.5);
    expect(subMoney(5, 5.5)).toBe(-0.5); // balances may go negative (owed)
  });

  it("roundToCents reproduces the former round2 (half rounds up, away from zero)", () => {
    expect(roundToCents(0.005)).toBe(0.01);
    expect(roundToCents(0.015)).toBe(0.02);
    expect(roundToCents(2.345)).toBe(2.35);
  });
});

describe("percentOf pins perRideCommission's exact rounding (behaviour-preserving)", () => {
  // These MUST equal the values policy.test.ts pins for perRideCommission — same expression.
  it("matches the pinned commission goldens", () => {
    expect(percentOf(0.5, 1)).toBe(0.01); // raw 0.005 → up
    expect(percentOf(0.3, 5)).toBe(0.02); // raw 0.015 → up
    expect(percentOf(2.5, 1)).toBe(0.03); // raw 0.025 → up
    expect(percentOf(3, 10)).toBe(0.3);
    expect(percentOf(50, 0)).toBe(0);
  });
});
