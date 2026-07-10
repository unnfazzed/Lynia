import { mapFallbackHint } from "../map-fallback";

describe("mapFallbackHint", () => {
  it("keyed build, pickup pin: offers search, locate, and landmark", () => {
    expect(mapFallbackHint(true, true)).toBe(
      'Search for an address above, tap "Use my location" below, or type your landmark under "Add details" and we\'ll use that.',
    );
  });

  it("keyed build, drop-off pin: offers search and landmark (no locate for drop-off)", () => {
    expect(mapFallbackHint(true, false)).toBe(
      'Search for an address above, or type your landmark under "Add details" and we\'ll use that.',
    );
  });

  it("keyless build, pickup pin: offers locate and landmark, never mentions the missing search box", () => {
    const hint = mapFallbackHint(false, true);
    expect(hint).not.toMatch(/search/i);
    expect(hint).toBe('Tap "Use my location" below, or type your landmark under "Add details" and we\'ll use that.');
  });

  it("keyless build, drop-off pin: falls back to the landmark field alone", () => {
    const hint = mapFallbackHint(false, false);
    expect(hint).not.toMatch(/search/i);
    expect(hint).not.toMatch(/use my location/i);
    expect(hint).toBe('Type your landmark under "Add details" and we\'ll use that.');
  });
});
