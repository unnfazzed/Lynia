import { BAND_FAR_ABOVE_MULT, BAND_MIN_USD, fareBand, fareBandHint, isBelowBand, isFarAboveBand } from "../fare-band";

describe("fareBand", () => {
  it("returns null for a non-positive or invalid suggestion", () => {
    expect(fareBand(0)).toBeNull();
    expect(fareBand(-3)).toBeNull();
    expect(fareBand(Number.NaN)).toBeNull();
  });

  it("brackets the suggested fare (low ≤ suggested ≤ high)", () => {
    const band = fareBand(3)!;
    expect(band.low).toBeLessThanOrEqual(3);
    expect(band.high).toBeGreaterThanOrEqual(3);
    expect(band.low).toBeLessThan(band.high);
  });

  it("floors the low edge at the model minimum", () => {
    const band = fareBand(1.5)!; // 0.85 * 1.5 = 1.275 → floored to BAND_MIN_USD
    expect(band.low).toBe(BAND_MIN_USD);
  });

  it("rounds edges to a clean 10-cent step", () => {
    const band = fareBand(4.37)!;
    expect(band.low * 10).toBeCloseTo(Math.round(band.low * 10));
    expect(band.high * 10).toBeCloseTo(Math.round(band.high * 10));
  });
});

describe("isBelowBand", () => {
  const band = fareBand(3)!;
  it("flags a lowball below the band floor", () => {
    expect(isBelowBand(band.low - 0.5, band)).toBe(true);
  });
  it("does not flag a price at/above the floor", () => {
    expect(isBelowBand(band.low, band)).toBe(false);
    expect(isBelowBand(band.high, band)).toBe(false);
  });
  it("does not flag an empty/invalid proposal", () => {
    expect(isBelowBand(null, band)).toBe(false);
    expect(isBelowBand(0, band)).toBe(false);
  });
});

describe("isFarAboveBand", () => {
  const band = fareBand(3)!; // high ≈ 3.60
  it("flags a fat-finger price far above the band (e.g. a stray extra digit)", () => {
    expect(isFarAboveBand(band.high * BAND_FAR_ABOVE_MULT + 1, band)).toBe(true);
    expect(isFarAboveBand(250, band)).toBe(true); // $2.50 mistyped as $250
  });
  it("does not flag a merely-generous price within the guard multiple", () => {
    expect(isFarAboveBand(band.high, band)).toBe(false);
    expect(isFarAboveBand(band.high * 2, band)).toBe(false);
  });
  it("does not flag an empty/invalid proposal", () => {
    expect(isFarAboveBand(null, band)).toBe(false);
    expect(isFarAboveBand(0, band)).toBe(false);
  });
});

describe("fareBandHint", () => {
  it("formats both edges to 2dp", () => {
    expect(fareBandHint({ low: 2.1, high: 3 })).toBe("Riders usually accept around $2.10–$3.00");
  });
});
