import { fmtClock, fmtDateTime } from "../format-time";

describe("format-time (extracted + deduped from rider/job + wallet, roadmap 3.5)", () => {
  it("returns '' for an unparseable date rather than 'Invalid Date' (never on a terminal)", () => {
    expect(fmtClock("not-a-date")).toBe("");
    expect(fmtClock("")).toBe("");
    expect(fmtDateTime("nonsense")).toBe("");
  });

  it("fmtClock renders a non-empty time for a valid ISO string", () => {
    // Exact text is locale/ICU-dependent, so assert it produced something, not a specific string.
    expect(fmtClock("2026-07-05T15:07:00Z").length).toBeGreaterThan(0);
  });

  it("fmtDateTime joins a date and a time with the ' · ' separator", () => {
    const out = fmtDateTime("2026-07-05T15:07:00Z");
    expect(out).toContain(" · ");
    // Both halves are present (non-empty on either side of the separator).
    const parts = out.split(" · ");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBeTruthy();
    expect(parts[1]).toBeTruthy();
  });
});
