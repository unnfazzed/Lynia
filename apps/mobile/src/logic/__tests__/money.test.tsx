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
});
