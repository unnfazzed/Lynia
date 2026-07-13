import { HeldReason, RELIABILITY, UNDELIVERED_ABUSE } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { applyReliabilityDelta, shouldFlagUndeliveredVelocity, undeliveredPenalty } from "./reliability";

describe("applyReliabilityDelta (Q2 clamp + on_hold hysteresis)", () => {
  it("adds/subtracts the delta", () => {
    expect(applyReliabilityDelta({ reliabilityScore: 80, onHold: false, heldReason: null }, -5).reliabilityScore).toBe(75);
    expect(applyReliabilityDelta({ reliabilityScore: 80, onHold: false, heldReason: null }, RELIABILITY.RECOVER_PER_COMPLETION).reliabilityScore).toBe(82);
  });

  it("clamps to [MIN, MAX]", () => {
    expect(applyReliabilityDelta({ reliabilityScore: 2, onHold: true, heldReason: "reliability" }, -50).reliabilityScore).toBe(RELIABILITY.MIN);
    expect(applyReliabilityDelta({ reliabilityScore: 99, onHold: false, heldReason: null }, 50).reliabilityScore).toBe(RELIABILITY.MAX);
  });

  it("trips on_hold (heldReason=reliability) when the new score drops below ON_HOLD_BELOW", () => {
    // 61 → 56 (< 60) trips a score-based hold.
    expect(applyReliabilityDelta({ reliabilityScore: 61, onHold: false, heldReason: null }, -5)).toEqual({
      reliabilityScore: 56,
      onHold: true,
      heldReason: "reliability",
    });
  });

  it("clears on_hold only at/above ON_HOLD_CLEAR_AT (hysteresis, not the lower bound)", () => {
    // Recovering from a reliability hold: at 65 (>= ON_HOLD_BELOW 60 but < ON_HOLD_CLEAR_AT 70) it stays held...
    expect(applyReliabilityDelta({ reliabilityScore: 60, onHold: true, heldReason: "reliability" }, 5)).toEqual({
      reliabilityScore: 65,
      onHold: true,
      heldReason: "reliability",
    });
    // ...and only clears (and drops heldReason) once it reaches 70.
    expect(applyReliabilityDelta({ reliabilityScore: 68, onHold: true, heldReason: "reliability" }, 2)).toEqual({
      reliabilityScore: 70,
      onHold: false,
      heldReason: null,
    });
  });

  it("is sticky in the dead-band: a passing rider stays off-hold there, a held rider stays held", () => {
    // Same score (65, in [60,70)), opposite starting flags → the flag is preserved either way.
    expect(applyReliabilityDelta({ reliabilityScore: 66, onHold: false, heldReason: null }, -1).onHold).toBe(false);
    expect(applyReliabilityDelta({ reliabilityScore: 66, onHold: true, heldReason: "reliability" }, -1).onHold).toBe(true);
  });

  /* ── RH-01 (DEEP-SWEEP-2026-07-13): a velocity/fraud hold must survive a score recovery ─────────── */

  it("RH-01: a velocity hold does NOT self-clear on a positive recovery, even at max score", () => {
    // The FRAUD P0-3 velocity hold (#198) stamps onHold=true while the score is left high (~100). The
    // pre-fix hysteresis cleared any hold at score >= ON_HOLD_CLEAR_AT, silently un-holding an abusive
    // rider on the next completion/rating recovery. The hold must now persist — only admin clear-hold lifts it.
    const held = { reliabilityScore: 100, onHold: true, heldReason: HeldReason.VELOCITY };
    expect(applyReliabilityDelta(held, RELIABILITY.RECOVER_PER_COMPLETION)).toEqual({
      reliabilityScore: 100,
      onHold: true,
      heldReason: "velocity",
    });
    // Also survives a full clamp to MAX from below.
    expect(applyReliabilityDelta({ reliabilityScore: 80, onHold: true, heldReason: "velocity" }, 50)).toEqual({
      reliabilityScore: 100,
      onHold: true,
      heldReason: "velocity",
    });
  });

  it("preserves the existing behaviour: a reliability hold recovering to >= ON_HOLD_CLEAR_AT clears", () => {
    // 55 → 70 clears a plain reliability hold and drops the reason (unchanged from pre-RH-01).
    expect(applyReliabilityDelta({ reliabilityScore: 55, onHold: true, heldReason: "reliability" }, 15)).toEqual({
      reliabilityScore: 70,
      onHold: false,
      heldReason: null,
    });
    // A legacy null hold (pre-column on_hold row) stays score-clearable too.
    expect(applyReliabilityDelta({ reliabilityScore: 68, onHold: true, heldReason: null }, 2)).toEqual({
      reliabilityScore: 70,
      onHold: false,
      heldReason: null,
    });
  });

  it("RH-01: the trip branch sets reliability but never DOWNGRADES an existing velocity hold", () => {
    // A fresh score-trip on a not-yet-held rider stamps "reliability".
    expect(applyReliabilityDelta({ reliabilityScore: 61, onHold: false, heldReason: null }, -10).heldReason).toBe("reliability");
    // A rider already velocity-held whose score also drops below the trip line KEEPS the velocity reason
    // (the fraud signal outranks the score reason — a later admin clear must still see it as velocity).
    expect(applyReliabilityDelta({ reliabilityScore: 61, onHold: true, heldReason: "velocity" }, -10)).toEqual({
      reliabilityScore: 51,
      onHold: true,
      heldReason: "velocity",
    });
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
