import { formatMoneyRange } from "../money";

describe("formatMoneyRange (D-128, D-133)", () => {
  it("shows whole dollars, rounding the low end down and the high end up", () => {
    expect(formatMoneyRange(2, 3)).toBe("$2–3");
    expect(formatMoneyRange(5.5, 6.5)).toBe("$5–7");
    expect(formatMoneyRange(2.5, 3)).toBe("$2–3");
  });

  it("never reads below the high end it stands for", () => {
    for (const [lo, hi] of [[1.25, 2.75], [4.5, 5.5], [3, 4.01]] as const) {
      const top = Number(formatMoneyRange(lo, hi).split("–")[1]);
      expect(top).toBeGreaterThanOrEqual(hi);
    }
  });

  it("ignores float noise at a whole dollar", () => {
    expect(formatMoneyRange(2.0000000001, 2.9999999999)).toBe("$2–3");
  });

  it("reads as one exact price with no low end or equal ends", () => {
    expect(formatMoneyRange(null, 1.5)).toBe("$1.50");
    expect(formatMoneyRange(1.5, 1.5)).toBe("$1.50");
  });
});

