import { mapFallbackHint } from "../map-fallback";

describe("mapFallbackHint", () => {
  it("pickup slot: names the search and the locate shortcut", () => {
    expect(mapFallbackHint(true)).toBe(
      'You can still send — search the address above. The pin is optional once an address is set. Or tap "Use my location" for the pickup.',
    );
  });

  it("drop-off slot: names the search only — locate never sets the recipient's pin", () => {
    const hint = mapFallbackHint(false);
    expect(hint).toBe("You can still send — search the address above. The pin is optional once an address is set.");
    expect(hint).not.toMatch(/use my location/i);
  });

  it("never sends the customer to a confirm-pin step — send-compose-v2 has none (owner review 2026-10-02)", () => {
    for (const hint of [mapFallbackHint(true), mapFallbackHint(false)]) expect(hint).not.toMatch(/confirm the pin/i);
  });

  it("never points at the landmark field, which produces text and not a coordinate", () => {
    // Regression: the previous copy promised 'type your landmark under "Add details" and we'll use
    // that'. `send.tsx` gates Broadcast on a lat/lng for both waypoints, so that advice was a dead
    // end on exactly the build where this card shows.
    for (const hint of [mapFallbackHint(true), mapFallbackHint(false)]) {
      expect(hint).not.toMatch(/landmark/i);
      expect(hint).not.toMatch(/add details/i);
    }
  });
});
