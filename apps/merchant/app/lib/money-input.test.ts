import { describe, expect, it } from "vitest";
import { MerchantDishRequest } from "@lynia/shared";
import { DISH_PRICE_MAX_USD, formatMoney, parseAmountInput } from "./money-input";

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

  it("a dish price stops at the dish contract's 1000 (E2E 2026-10-05 P-1)", () => {
    expect(parseAmountInput("1000", DISH_PRICE_MAX_USD)).toBe(1000);
    expect(parseAmountInput("1000.01", DISH_PRICE_MAX_USD)).toBeNull();
    expect(parseAmountInput("1500", DISH_PRICE_MAX_USD)).toBeNull();
    // The ceiling is the server's own: a price the client takes, the contract takes.
    const dish = { categoryId: "00000000-0000-4000-8000-000000000000", name: "Sadza" };
    expect(MerchantDishRequest.safeParse({ ...dish, priceUsd: DISH_PRICE_MAX_USD }).success).toBe(true);
    expect(MerchantDishRequest.safeParse({ ...dish, priceUsd: DISH_PRICE_MAX_USD + 0.01 }).success).toBe(false);
  });
});

describe("formatMoney", () => {
  it("always shows two decimals", () => {
    expect(formatMoney(6)).toBe("6.00");
    expect(formatMoney(13.5)).toBe("13.50");
  });
});
