import { describe, expect, it } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import { addTag, canSave, isAddKey, isDirty, isShopNotLive, splitAtComma, tagSuggestions, valuesFrom } from "./shop-front";

const profile = (over: Partial<MerchantProfileResponse> = {}) =>
  ({ name: "Sadza Republic", description: "Home cooking", cuisineTags: ["Sadza"], priceLevel: 1, businessType: "restaurant", shopKind: null, pilotEnabled: true, ...over }) as MerchantProfileResponse;

describe("Shop front v1 rules (D-115)", () => {
  it("adds a trimmed tag, cut to 24 characters", () => {
    expect(addTag([], "  Grill  ")).toEqual({ kind: "added", tags: ["Grill"] });
    const r = addTag([], "x".repeat(30));
    expect(r.kind === "added" && r.tags[0]!.length).toBe(24);
  });

  it("reports a duplicate whatever its case and spaces, and adds nothing", () => {
    expect(addTag(["Grill"], " grill ")).toEqual({ kind: "duplicate", tags: ["Grill"], existing: "Grill" });
  });

  it("stops at 3 and ignores an empty draft", () => {
    expect(addTag(["A", "B", "C"], "D").kind).toBe("ignored");
    expect(addTag(["A"], "   ").kind).toBe("ignored");
  });

  it("treats Enter, a comma and keyCode 13 as add, and splits a typed comma", () => {
    expect(isAddKey({ key: "Enter" })).toBe(true);
    expect(isAddKey({ key: "," })).toBe(true);
    expect(isAddKey({ key: "Unidentified", keyCode: 13 })).toBe(true);
    expect(isAddKey({ key: "Unidentified", keyCode: 229 })).toBe(false);
    expect(splitAtComma("Grill,")).toEqual({ add: "Grill", rest: "" });
    expect(splitAtComma("Grill")).toBeNull();
  });

  it("compares values for dirty, so undoing an edit by hand makes the form clean", () => {
    const saved = valuesFrom(profile());
    expect(isDirty({ ...saved, name: "Sadza Republic 2" }, saved, undefined, undefined)).toBe(true);
    expect(isDirty({ ...saved, name: "Sadza Republic" }, saved, undefined, undefined)).toBe(false);
    expect(isDirty({ ...saved, tags: ["Sadza"] }, saved, undefined, undefined)).toBe(false);
    expect(isDirty(saved, saved, { kind: "removed" }, undefined)).toBe(true);
    expect(isDirty({ ...saved, priceLevel: null }, saved, undefined, undefined)).toBe(true);
  });

  it("holds Save while a photo is on its way, while saving, and without a name", () => {
    const saved = valuesFrom(profile());
    expect(canSave(saved, true, false, false)).toBe(true);
    expect(canSave(saved, true, false, true)).toBe(false);
    expect(canSave(saved, true, true, false)).toBe(false);
    expect(canSave({ ...saved, name: "  " }, true, false, false)).toBe(false);
    expect(canSave(saved, false, false, false)).toBe(false);
  });

  it("suggests the shop kind's aisles or the restaurant list, minus added ones, by prefix", () => {
    expect(tagSuggestions(profile({ businessType: "shop", shopKind: "pharmacy" }), ["Vitamins"], "")).toEqual(["Pain relief", "Cold & flu", "Personal care"]);
    expect(tagSuggestions(profile(), ["sadza"], "")).not.toContain("Sadza");
    expect(tagSuggestions(profile(), [], "gr")).toEqual(["Grill"]);
  });

  it("only a shop that isn't live waits for LyniaGo Shops", () => {
    expect(isShopNotLive(profile({ businessType: "shop", pilotEnabled: false }))).toBe(true);
    expect(isShopNotLive(profile({ businessType: "shop", pilotEnabled: true }))).toBe(false);
    expect(isShopNotLive(profile({ businessType: "restaurant", pilotEnabled: false }))).toBe(false);
  });
});
