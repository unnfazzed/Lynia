import { describe, it, expect } from "vitest";
import {
  BOARD_CELL_DEG,
  boardCell,
  boardCellNeighborhood,
  boardCellsCoveringRadius,
} from "./geo";

/**
 * Regression anchors for the coarse geo-cell scoping that targets the live rider board. The cell IDs
 * are load-bearing room keys (push and subscribe must agree), so the exact strings are pinned. Values
 * are the CURRENT shipped output for known Harare-corridor coordinates.
 */

const CBD_LAT = -17.8292;
const CBD_LNG = 31.0522;

describe("BOARD_CELL_DEG", () => {
  it("pins the cell edge length (~5 km at Harare)", () => {
    expect(BOARD_CELL_DEG).toBe(0.045);
  });
});

describe("boardCell", () => {
  it("pins the single cell for the Harare CBD", () => {
    expect(boardCell(CBD_LAT, CBD_LNG)).toBe("-397:690");
  });

  it("floors toward negative infinity on each axis", () => {
    // -17.8292 / 0.045 = -396.20 -> floor -> -397; 31.0522 / 0.045 = 690.05 -> floor -> 690
    expect(boardCell(0, 0)).toBe("0:0");
    expect(boardCell(-0.001, -0.001)).toBe("-1:-1");
    expect(boardCell(0.05, 0.05)).toBe("1:1");
  });

  it("gives the same cell for two points inside the same cell", () => {
    expect(boardCell(CBD_LAT, CBD_LNG)).toBe(boardCell(CBD_LAT + 0.001, CBD_LNG + 0.001));
  });
});

describe("boardCellNeighborhood", () => {
  it("pins the 3x3 neighbourhood for the Harare CBD", () => {
    expect(boardCellNeighborhood(CBD_LAT, CBD_LNG)).toEqual([
      "-398:689", "-398:690", "-398:691",
      "-397:689", "-397:690", "-397:691",
      "-396:689", "-396:690", "-396:691",
    ]);
  });

  it("always returns 9 cells including the point's own cell", () => {
    const cells = boardCellNeighborhood(CBD_LAT, CBD_LNG);
    expect(cells).toHaveLength(9);
    expect(cells).toContain(boardCell(CBD_LAT, CBD_LNG));
  });

  it("has no duplicate cells", () => {
    const cells = boardCellNeighborhood(CBD_LAT, CBD_LNG);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe("boardCellsCoveringRadius", () => {
  it("covers the same 3x3 as the neighbourhood at the base broadcast radius (5 km)", () => {
    // At 5 km the disc bounding box matches the 3x3 neighbourhood the rider subscribes to.
    expect(boardCellsCoveringRadius(CBD_LAT, CBD_LNG, 5000)).toEqual(boardCellNeighborhood(CBD_LAT, CBD_LNG));
  });

  it("returns a superset of the point's own cell", () => {
    for (const radius of [1000, 5000, 12000, 25000]) {
      expect(boardCellsCoveringRadius(CBD_LAT, CBD_LNG, radius)).toContain(boardCell(CBD_LAT, CBD_LNG));
    }
  });

  it("widens (never shrinks) the covered cell count as the radius grows", () => {
    let prev = 0;
    for (const radius of [1000, 5000, 12000, 25000, 50000]) {
      const count = boardCellsCoveringRadius(CBD_LAT, CBD_LNG, radius).length;
      expect(count).toBeGreaterThanOrEqual(prev);
      prev = count;
    }
  });

  it("produces no duplicate cells", () => {
    const cells = boardCellsCoveringRadius(CBD_LAT, CBD_LNG, 12000);
    expect(new Set(cells).size).toBe(cells.length);
  });
});
