import {
  BACKGROUND_CHECK_TIMEOUT_MS,
  FAST_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  queryRetryDelayMs,
  RTT_BUDGET_MS,
  STANDARD_TIMEOUT_MS,
  fullJitterBackoffMs,
} from "../network-policy";

describe("timeout tiers", () => {
  it("are ordered probe < fast < background-check < standard, all above the RTT floor", () => {
    expect(PROBE_TIMEOUT_MS).toBeLessThan(FAST_TIMEOUT_MS);
    expect(FAST_TIMEOUT_MS).toBeLessThan(BACKGROUND_CHECK_TIMEOUT_MS);
    expect(BACKGROUND_CHECK_TIMEOUT_MS).toBeLessThan(STANDARD_TIMEOUT_MS);
    for (const tier of [PROBE_TIMEOUT_MS, FAST_TIMEOUT_MS, BACKGROUND_CHECK_TIMEOUT_MS, STANDARD_TIMEOUT_MS]) {
      expect(tier).toBeGreaterThan(RTT_BUDGET_MS);
    }
  });
});

describe("fullJitterBackoffMs", () => {
  it("returns 0 when the RNG lands at 0 (the full window, from 0, is in play)", () => {
    expect(fullJitterBackoffMs(0, { baseMs: 100, capMs: 1_000 }, () => 0)).toBe(0);
  });

  it("scales up to (but never reaches) the uncapped window as attempt grows", () => {
    // rng pinned to just under 1 so the result approaches the window's ceiling without a flaky
    // exact-equality assertion against a floating-point product.
    const rng = () => 0.999_999;
    expect(fullJitterBackoffMs(0, { baseMs: 100, capMs: 10_000 }, rng)).toBe(99);
    expect(fullJitterBackoffMs(1, { baseMs: 100, capMs: 10_000 }, rng)).toBe(199);
    expect(fullJitterBackoffMs(2, { baseMs: 100, capMs: 10_000 }, rng)).toBe(399);
  });

  it("caps the window so later attempts don't grow unbounded", () => {
    const rng = () => 0.999_999;
    expect(fullJitterBackoffMs(10, { baseMs: 100, capMs: 1_000 }, rng)).toBe(999);
    expect(fullJitterBackoffMs(20, { baseMs: 100, capMs: 1_000 }, rng)).toBe(999);
  });

  it("defaults to Math.random when no rng is injected, staying within [0, window)", () => {
    for (let i = 0; i < 50; i++) {
      const delay = fullJitterBackoffMs(3, { baseMs: 50, capMs: 500 });
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(500);
    }
  });
});

describe("queryRetryDelayMs", () => {
  it("stays within [0, 4s] for early attempts and never exceeds the 4s cap", () => {
    for (const attempt of [0, 1, 2, 5, 20]) {
      for (let i = 0; i < 20; i++) {
        const delay = queryRetryDelayMs(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(4_000);
      }
    }
  });
});
