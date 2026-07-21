import { earningsCoverageNote } from "../earnings";

describe("earningsCoverageNote (WD-027)", () => {
  it("returns null when every trip behind the total is actually shown", () => {
    expect(earningsCoverageNote(3, 3)).toBeNull();
    expect(earningsCoverageNote(0, 0)).toBeNull();
  });

  it("returns a distinct message when the total is nonzero but nothing rider-role is in the shown window", () => {
    const note = earningsCoverageNote(3, 0);
    expect(note).not.toBeNull();
    expect(note).toMatch(/older delivered trips/i);
  });

  it("returns a partial-coverage message with the exact shown/total counts when some trips are shown but not all", () => {
    expect(earningsCoverageNote(12, 5)).toBe("Showing your 5 most recent delivered trips of 12 total.");
    expect(earningsCoverageNote(2, 1)).toBe("Showing your 1 most recent delivered trip of 2 total.");
  });

  it("never claims more shown than exist", () => {
    // shownTripCount can't exceed tripCount in practice, but guard the boundary explicitly.
    expect(earningsCoverageNote(5, 5)).toBeNull();
  });
});
