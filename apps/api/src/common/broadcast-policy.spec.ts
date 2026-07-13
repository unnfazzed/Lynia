import { BOARD_CELL_DEG, BROADCAST, boardCell, boardCellsCoveringRadius, broadcastRadiusAtMs } from "@lynia/shared";
import { afterEach, describe, expect, it } from "vitest";
import { baseBroadcastRadiusM, effectiveBroadcastRadiusM, heartbeatMaxAgeMs, maxBroadcastRadiusM } from "./broadcast-policy";

// The shared step function + the API-side env resolution are tested together here — packages/shared
// has no test rig of its own (precedent: tracking.constants.spec.ts covers shared helpers from the API).

afterEach(() => {
  delete process.env[BROADCAST.baseRadiusEnv];
  delete process.env[BROADCAST.heartbeatMaxAgeEnv];
});

describe("broadcastRadiusAtMs — the widening schedule", () => {
  it("steps 5 km → 8 km at 30 s → 12 km at 60 s (policy BROADCAST.expansion)", () => {
    expect(broadcastRadiusAtMs(0)).toBe(5_000);
    expect(broadcastRadiusAtMs(29_999)).toBe(5_000);
    expect(broadcastRadiusAtMs(30_000)).toBe(8_000);
    expect(broadcastRadiusAtMs(59_999)).toBe(8_000);
    expect(broadcastRadiusAtMs(60_000)).toBe(12_000);
    expect(broadcastRadiusAtMs(10 * 60_000)).toBe(12_000); // monotonic, saturates at the last step
  });

  it("never exceeds the service corridor, whatever the base override", () => {
    expect(broadcastRadiusAtMs(60_000, 40_000)).toBe(BROADCAST.maxRadiusM);
    expect(broadcastRadiusAtMs(0, 40_000)).toBe(BROADCAST.maxRadiusM);
  });

  it("a base larger than a step wins over that step (the reach never shrinks)", () => {
    expect(broadcastRadiusAtMs(30_000, 10_000)).toBe(10_000); // 8 km step can't shrink a 10 km base
    expect(broadcastRadiusAtMs(60_000, 10_000)).toBe(12_000); // but the 12 km step still widens it
  });
});

describe("env resolution (deploy overrides, SOS_POLICY idiom)", () => {
  it("defaults to the policy constants when the env vars are unset", () => {
    expect(baseBroadcastRadiusM()).toBe(BROADCAST.baseRadiusM);
    expect(heartbeatMaxAgeMs()).toBe(BROADCAST.heartbeatMaxAgeMs);
  });

  it("reads valid overrides from the env", () => {
    process.env[BROADCAST.baseRadiusEnv] = "3000";
    process.env[BROADCAST.heartbeatMaxAgeEnv] = "60000";
    expect(baseBroadcastRadiusM()).toBe(3_000);
    expect(heartbeatMaxAgeMs()).toBe(60_000);
  });

  it("caps the base override at the service corridor", () => {
    process.env[BROADCAST.baseRadiusEnv] = "99000";
    expect(baseBroadcastRadiusM()).toBe(BROADCAST.maxRadiusM);
  });

  it("falls back to the default on a malformed/empty value (boot validation rejects these anyway)", () => {
    for (const bad of ["", "  ", "abc", "-5", "0"]) {
      process.env[BROADCAST.baseRadiusEnv] = bad;
      expect(baseBroadcastRadiusM()).toBe(BROADCAST.baseRadiusM);
    }
  });

  it("effectiveBroadcastRadiusM derives the radius from the order's age", () => {
    const createdAt = new Date("2026-07-01T00:00:00Z");
    const t0 = createdAt.getTime();
    expect(effectiveBroadcastRadiusM(createdAt, t0)).toBe(5_000);
    expect(effectiveBroadcastRadiusM(createdAt, t0 + 45_000)).toBe(8_000);
    expect(effectiveBroadcastRadiusM(createdAt, t0 + 61_000)).toBe(12_000);
  });

  it("maxBroadcastRadiusM is the schedule's terminal radius", () => {
    expect(maxBroadcastRadiusM()).toBe(12_000);
  });
});

describe("boardCellsCoveringRadius — the widened board-room set", () => {
  it("covers every cell of the disc's bounding box, superset of the 3×3 neighbourhood scale", () => {
    const lat = -17.83;
    const lng = 31.05;
    const cells = boardCellsCoveringRadius(lat, lng, 12_000);
    // 12 km ≈ 2.4 cells of latitude each way → at least a 5×5 grid (longitude widens further).
    expect(cells.length).toBeGreaterThanOrEqual(25);
    expect(cells).toContain(boardCell(lat, lng)); // always includes the pickup's own cell
    expect(new Set(cells).size).toBe(cells.length); // no duplicate rooms
    // Every cell within one cell-length of the disc edge is present (spot-check the extremes).
    expect(cells).toContain(boardCell(lat + 12_000 / 111_320, lng));
    expect(cells).toContain(boardCell(lat - 12_000 / 111_320, lng));
  });

  it("a small radius degrades to the pickup's own cell (± its box neighbours)", () => {
    const cells = boardCellsCoveringRadius(-17.83, 31.05, 100);
    expect(cells).toContain(boardCell(-17.83, 31.05));
    expect(cells.length).toBeLessThanOrEqual(9);
  });

  it("cell ids use the same row:col dialect as boardCell (rooms must match subscribers)", () => {
    for (const cell of boardCellsCoveringRadius(-17.83, 31.05, 8_000)) {
      expect(cell).toMatch(/^-?\d+:-?\d+$/);
    }
    // The grid is anchored on the same BOARD_CELL_DEG lattice.
    expect(boardCellsCoveringRadius(0.5 * BOARD_CELL_DEG, 0.5 * BOARD_CELL_DEG, 100)).toContain("0:0");
  });
});
