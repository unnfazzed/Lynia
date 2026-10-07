import { describe, expect, it } from "vitest";
import { centerCropRect, dimensionLadder, encodeUnderBudget, MAX_DIMENSION_BY_KIND, nextQuality, outputDimensions } from "./image-compress";

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

describe("encodeUnderBudget (MJ-RL11: a photo still over budget at the quality floor steps its size down)", () => {
  /** A fake encoder: bytes grow with pixel area and quality, like a JPEG does. */
  const fakeEncoder = (bytesPerMegapixelAtFullQuality: number) => {
    const calls: Array<[number, number]> = [];
    const encode = async (dimension: number, quality: number) => {
      calls.push([dimension, Number(quality.toFixed(3))]);
      const megapixels = (dimension * dimension) / 1_000_000;
      return new Blob([new Uint8Array(Math.round(megapixels * bytesPerMegapixelAtFullQuality * quality))]);
    };
    return { encode, calls };
  };

  it("an ordinary photo fits at full size by lowering quality only", async () => {
    const { encode, calls } = fakeEncoder(150_000);
    const blob = await encodeUnderBudget(encode, 300_000, 1600);
    expect(blob.size).toBeLessThanOrEqual(300_000);
    expect(new Set(calls.map(([d]) => d))).toEqual(new Set([1600]));
  });

  it("a detailed photo that won't fit at 1600 px / q0.35 is re-encoded at 1200, then 800, until it fits", async () => {
    // At 1600 px the floor is 2.56 MP x 600 KB x 0.35 = 537 KB; at 1200 px, 302 KB; at 800 px, 134 KB.
    const { encode, calls } = fakeEncoder(600_000);
    const blob = await encodeUnderBudget(encode, 250_000, 1600);
    expect(blob.size).toBeLessThanOrEqual(250_000);
    expect([...new Set(calls.map(([d]) => d))]).toEqual([1600, 1200, 800]);
    // The quality floor is tried once per size, not re-encoded over and over.
    expect(calls.filter(([d, q]) => d === 1600 && q === 0.35)).toHaveLength(1);
  });

  it("the ladder starts at the kind's own cap", () => {
    expect(dimensionLadder(1600)).toEqual([1600, 1200, 800, 600, 400]);
    expect(dimensionLadder(MAX_DIMENSION_BY_KIND.dish)).toEqual([1200, 800, 600, 400]);
    expect(dimensionLadder(MAX_DIMENSION_BY_KIND.logo)).toEqual([512, 400]);
  });
});

describe("MAX_DIMENSION_BY_KIND (P04: no kind is uploaded bigger than it is drawn)", () => {
  it("dish 1200, cover 1600, logo 512", () => {
    expect(MAX_DIMENSION_BY_KIND).toEqual({ dish: 1200, banner: 1600, logo: 512 });
  });
});
