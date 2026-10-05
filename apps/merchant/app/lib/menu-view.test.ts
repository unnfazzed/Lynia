import { describe, expect, it } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import { backOnLine, offLabel, searchDishes } from "./menu-view";

const NOON = new Date(2026, 8, 30, 12, 0); // a Wednesday

describe("an off dish's line (C1)", () => {
  it("reads until tomorrow, until turned back on, or until a time today", () => {
    expect(offLabel({ outOfStock: false, outOfStockUntil: null }, NOON)).toBeNull();
    expect(offLabel({ outOfStock: true, outOfStockUntil: new Date(2026, 8, 30, 23, 59, 59).toISOString() }, NOON)).toBe("Off until tomorrow");
    expect(offLabel({ outOfStock: true, outOfStockUntil: "9999-12-31T23:59:59.000Z" }, NOON)).toBe("Off until you turn it back on");
    expect(offLabel({ outOfStock: true, outOfStockUntil: new Date(2026, 8, 30, 13, 0).toISOString() }, NOON)).toBe("Off until 13:00");
    expect(offLabel({ outOfStock: true }, NOON)).toBe("Off until tomorrow");
  });

  it("names tomorrow's opening time when the business has hours (T1, D-77)", () => {
    const hours = { thu: { open: "08:00", close: "22:00" } } as MerchantProfileResponse["hours"];
    expect(offLabel({ outOfStock: true, outOfStockUntil: new Date(2026, 8, 30, 23, 59, 59).toISOString() }, NOON, { hours })).toBe("Off until 08:00 tomorrow");
    expect(offLabel({ outOfStock: true, outOfStockUntil: new Date(2026, 8, 30, 13, 0).toISOString() }, NOON, { hours })).toBe("Off until 13:00");
  });
});

describe("C2 'Rest of today' comes back at tomorrow's opening", () => {
  it("names the time, or says tomorrow without hours", () => {
    const hours = { thu: { open: "08:00", close: "22:00" } } as MerchantProfileResponse["hours"];
    expect(backOnLine({ hours }, NOON)).toBe("Back on automatically at 08:00");
    expect(backOnLine({ hours: null }, NOON)).toBe("Back on automatically tomorrow");
  });
});

describe("the search", () => {
  it("matches names, ignoring case and spaces", () => {
    const d = (name: string) => ({ id: name, categoryId: "c", name, description: null, priceUsd: 1, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: 0 });
    expect(searchDishes([d("Mazondo"), d("Mazoe"), d("Sadza")], " MAZ ").map((x) => x.name)).toEqual(["Mazondo", "Mazoe"]);
  });
});
