import { describe, expect, it } from "vitest";
import { centerCropRect, nextQuality, outputDimensions } from "./image-compress";

describe("nextQuality", () => {
  it("steps down by a fixed ratio", () => {
    expect(nextQuality(0.9)).toBeCloseTo(0.738, 3);
  });
  it("floors at 0.35 rather than degrading further", () => {
    expect(nextQuality(0.36)).toBe(0.35);
    expect(nextQuality(0.35)).toBe(0.35);
  });
});

describe("centerCropRect", () => {
  it("crops the sides when the source is wider than the target aspect", () => {
    // 2400x800 source (3:1) into a 1:1 target — source is wider than square, crop the sides in.
    const rect = centerCropRect(2400, 800, 1);
    expect(rect).toEqual({ x: 800, y: 0, width: 800, height: 800 });
  });

  it("crops top/bottom when the source is taller than the target aspect", () => {
    // 800x1600 source (1:2) into a 1:1 target — crop top/bottom down to a centered square.
    const rect = centerCropRect(800, 1600, 1);
    expect(rect).toEqual({ x: 0, y: 400, width: 800, height: 800 });
  });

  it("is a no-op crop when the source already matches the target aspect", () => {
    const rect = centerCropRect(900, 300, 3);
    expect(rect).toEqual({ x: 0, y: 0, width: 900, height: 300 });
  });
});

describe("outputDimensions", () => {
  it("passes dimensions through unchanged when already under the cap", () => {
    expect(outputDimensions(600, 200, 1200)).toEqual({ width: 600, height: 200 });
  });

  it("scales the long edge down to the cap, preserving aspect", () => {
    expect(outputDimensions(2400, 800, 1200)).toEqual({ width: 1200, height: 400 });
  });
});
