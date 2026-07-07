import { hapticPattern, type HapticKind } from "../haptics";

describe("hapticPattern", () => {
  it("returns a single short buzz for a light tap", () => {
    expect(hapticPattern("tap")).toBe(12);
  });

  it("returns a single attention buzz for notify", () => {
    expect(hapticPattern("notify")).toBe(28);
  });

  it("returns a two-buzz double for success", () => {
    const p = hapticPattern("success");
    expect(Array.isArray(p)).toBe(true);
    // [wait, buzz, wait, buzz] — exactly two buzzes.
    expect((p as number[]).length).toBe(4);
  });

  it("warning is firmer than success (longer total)", () => {
    const total = (k: HapticKind): number => {
      const p = hapticPattern(k);
      return Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    };
    expect(total("warning")).toBeGreaterThan(total("success"));
  });

  it("alert is the most urgent — a three-buzz triple", () => {
    const p = hapticPattern("alert");
    expect(Array.isArray(p)).toBe(true);
    // [wait, buzz, wait, buzz, wait, buzz] — three buzzes.
    expect((p as number[]).length).toBe(6);
  });

  it("every cue yields a positive-duration pattern (never a no-op zero)", () => {
    const kinds: HapticKind[] = ["tap", "notify", "success", "warning", "alert"];
    for (const k of kinds) {
      const p = hapticPattern(k);
      const total = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
      expect(total).toBeGreaterThan(0);
    }
  });
});
