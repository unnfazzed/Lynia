import { formatMoney } from "../money";

describe("formatMoney", () => {
  it("pads to two decimals so round/single-decimal fares match their siblings", () => {
    expect(formatMoney("3")).toBe("$3.00");
    expect(formatMoney("2.5")).toBe("$2.50");
    expect(formatMoney("2.50")).toBe("$2.50");
    expect(formatMoney(3)).toBe("$3.00");
    expect(formatMoney(2.5)).toBe("$2.50");
  });

  it("is null/undefined/NaN-safe (renders $0.00 rather than $NaN)", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
    expect(formatMoney("not-a-number")).toBe("$0.00");
  });

  it("WD-008: renders a negative value sign-first, not '$-5.00'", () => {
    expect(formatMoney(-5)).toBe("-$5.00");
    expect(formatMoney("-5")).toBe("-$5.00");
    expect(formatMoney(-2.5)).toBe("-$2.50");
    expect(formatMoney(-0.004)).toBe("$0.00"); // rounds to zero — no stray "-$0.00"
  });
});
