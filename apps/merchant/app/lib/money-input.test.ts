import { describe, expect, it } from "vitest";
import { formatMoney, parseAmountInput } from "./money-input";

describe("parseAmountInput", () => {
  it("accepts a plain amount", () => {
    expect(parseAmountInput("6")).toBe(6);
    expect(parseAmountInput("6.5")).toBe(6.5);
    expect(parseAmountInput("6.50")).toBe(6.5);
    expect(parseAmountInput(" 13.00 ")).toBe(13);
  });

  it("rejects empty, non-numeric, negative, zero and over-precision input", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("-6")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("6.123")).toBeNull();
  });

  it("rejects amounts above the server's 100000 ceiling", () => {
    expect(parseAmountInput("100000")).toBe(100_000);
    expect(parseAmountInput("100000.01")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("always shows two decimals", () => {
    expect(formatMoney(6)).toBe("6.00");
    expect(formatMoney(13.5)).toBe("13.50");
  });
});
