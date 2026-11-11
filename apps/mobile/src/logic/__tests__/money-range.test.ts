import { formatMoneyRange } from "../money";
import { etaRangeLabel, etaRangeParts } from "../eta";

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

describe("etaRangeParts (D-133)", () => {
  it("stays in minutes under an hour", () => {
    expect(etaRangeParts(48, 58)).toEqual({ value: "48–58", unit: "min" });
    expect(etaRangeLabel(30, 40)).toBe("30–40 min");
  });

  it("reads in quarter hours once the top reaches an hour, low down and high up", () => {
    expect(etaRangeParts(59, 69)).toEqual({ value: "¾–1¼", unit: "hr" });
    expect(etaRangeParts(65, 75)).toEqual({ value: "1–1¼", unit: "hr" });
    expect(etaRangeLabel(95, 105)).toBe("1½–1¾ hr");
    expect(etaRangeLabel(120, 130)).toBe("2–2¼ hr");
  });

  it("keeps two distinct ends", () => {
    expect(etaRangeParts(60, 60).value).toBe("1–1¼");
  });
});
