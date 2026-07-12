import { RELIABILITY, UNDELIVERED_ABUSE } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { applyReliabilityDelta, shouldFlagUndeliveredVelocity, undeliveredPenalty } from "./reliability";

describe("applyReliabilityDelta (Q2 clamp + on_hold hysteresis)", () => {
  it("adds/subtracts the delta", () => {
    expect(applyReliabilityDelta({ reliabilityScore: 80, onHold: false }, -5).reliabilityScore).toBe(75);
    expect(applyReliabilityDelta({ reliabilityScore: 80, onHold: false }, RELIABILITY.RECOVER_PER_COMPLETION).reliabilityScore).toBe(82);
  });

  it("clamps to [MIN, MAX]", () => {
    expect(applyReliabilityDelta({ reliabilityScore: 2, onHold: true }, -50).reliabilityScore).toBe(RELIABILITY.MIN);
    expect(applyReliabilityDelta({ reliabilityScore: 99, onHold: false }, 50).reliabilityScore).toBe(RELIABILITY.MAX);
  });

  it("trips on_hold when the new score drops below ON_HOLD_BELOW", () => {
    // 61 → 56 (< 60) trips.
    expect(applyReliabilityDelta({ reliabilityScore: 61, onHold: false }, -5)).toEqual({ reliabilityScore: 56, onHold: true });
  });

  it("clears on_hold only at/above ON_HOLD_CLEAR_AT (hysteresis, not the lower bound)", () => {
    // Recovering from held: at 65 (>= ON_HOLD_BELOW 60 but < ON_HOLD_CLEAR_AT 70) it stays held...
    expect(applyReliabilityDelta({ reliabilityScore: 60, onHold: true }, 5)).toEqual({ reliabilityScore: 65, onHold: true });
    // ...and only clears once it reaches 70.
    expect(applyReliabilityDelta({ reliabilityScore: 68, onHold: true }, 2)).toEqual({ reliabilityScore: 70, onHold: false });
  });

  it("is sticky in the dead-band: a passing rider stays off-hold there, a held rider stays held", () => {
    // Same score (65, in [60,70)), opposite starting flags → the flag is preserved either way.
    expect(applyReliabilityDelta({ reliabilityScore: 66, onHold: false }, -1).onHold).toBe(false);
    expect(applyReliabilityDelta({ reliabilityScore: 66, onHold: true }, -1).onHold).toBe(true);
  });
});

describe("undeliveredPenalty (Q2 reason → penalty)", () => {
  it("breakdown → postPickupCancel; unreachable → noShow", () => {
    expect(undeliveredPenalty("breakdown")).toBe(RELIABILITY.PENALTY.postPickupCancel);
    expect(undeliveredPenalty("unreachable")).toBe(RELIABILITY.PENALTY.noShow);
  });
  it("recipient/customer-fault reasons carry no reliability hit", () => {
    expect(undeliveredPenalty("refused")).toBe(0);
    expect(undeliveredPenalty("wrong_address")).toBe(0);
  });
});

describe("shouldFlagUndeliveredVelocity (FRAUD P0-3 auto-hold)", () => {
  it("does NOT trip below the incident floor, even at a high rate (spares a brand-new rider's 1/1)", () => {
    expect(UNDELIVERED_ABUSE.minCount).toBeGreaterThan(1); // guards the intent of this test
    expect(shouldFlagUndeliveredVelocity(1, 0)).toBe(false);
    expect(shouldFlagUndeliveredVelocity(2, 0)).toBe(false);
  });

  it("does NOT trip a high-volume rider with a few genuine failures (low fraction)", () => {
    // 3 undelivered out of 3 + 97 completed = 3% ≪ rate → no hold.
    expect(shouldFlagUndeliveredVelocity(3, 97)).toBe(false);
  });

  it("trips once there are enough incidents AND they are a high fraction of finished hand-offs", () => {
    // 3 undelivered / (3 + 1) completed = 75% ≥ rate, and ≥ minCount → hold.
    expect(shouldFlagUndeliveredVelocity(3, 1)).toBe(true);
    // All recent finished hand-offs failed.
    expect(shouldFlagUndeliveredVelocity(3, 0)).toBe(true);
  });
});
