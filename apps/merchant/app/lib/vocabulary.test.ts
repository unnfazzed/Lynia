import { describe, expect, it } from "vitest";
import { MerchantShopKind } from "@lynia/shared";
import { STARTER_CATEGORY_NAMES } from "./menu-groups";
import { countOf, vocabulary } from "./vocabulary";

describe("vocabulary (merchant web upgrade plan D6)", () => {
  it("keeps a restaurant's drawn words exactly, and is the default while the business is unknown", () => {
    const v = vocabulary("restaurant");
    expect(v.catalog).toBe("Menu");
    expect(v.whatYouOffer).toBe("What you cook");
    expect(v.starterCategories).toBe(STARTER_CATEGORY_NAMES);
    expect(vocabulary(undefined)).toEqual(v);
    expect(vocabulary(null)).toEqual(v);
  });

  it("gives a shop its own words", () => {
    const v = vocabulary("shop", "auto_parts");
    expect(v.catalog).toBe("Items");
    expect([v.item, v.items, v.anItem]).toEqual(["item", "items", "an item"]);
    expect(v.whatYouOffer).toBe("What you sell");
    expect(v.onStorefront).toBe("in your shop");
    expect(v.starterCategories).toEqual(["Engine", "Brakes", "Electrical", "Tyres"]);
    expect(`${JSON.stringify(v)}`).not.toMatch(/dish|kitchen|food|cook/i);
  });

  it("has starting categories for every kind of shop, and over-the-counter ones for pharmacies", () => {
    for (const kind of MerchantShopKind.options) expect(vocabulary("shop", kind).starterCategories.length).toBeGreaterThan(0);
    expect(vocabulary("shop", "pharmacy").starterCategories.join(" ")).not.toMatch(/prescription/i);
    expect(vocabulary("shop", null).starterCategories).toEqual(vocabulary("shop", "other").starterCategories);
  });

  it("speaks of the phone the app runs on, never a tablet (ledger D-48: the merchant app is phone-first)", () => {
    expect(vocabulary("restaurant").itemPhotoNote).toContain("Pick the file from this phone;");
    for (const kind of MerchantShopKind.options) expect(JSON.stringify(vocabulary("shop", kind))).not.toMatch(/tablet/i);
    expect(JSON.stringify(vocabulary("restaurant"))).not.toMatch(/tablet/i);
  });

  it("counts in the business's words", () => {
    expect(countOf(1, vocabulary("restaurant"))).toBe("1 dish");
    expect(countOf(3, vocabulary("shop"))).toBe("3 items");
    expect(countOf(0, vocabulary("shop"))).toBe("0 items");
  });
});
