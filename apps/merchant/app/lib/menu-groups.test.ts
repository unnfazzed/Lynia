import { describe, expect, it } from "vitest";
import { groupDishesByCategory, menuSummary } from "./menu-groups";

const category = (over: Partial<import("@lynia/shared").MerchantCategoryResponse> = {}) => ({
  id: "c1",
  name: "Mains",
  sortOrder: 0,
  availableFrom: null,
  availableTo: null,
  hidden: false,
  dishCount: 0,
  ...over,
});

const dish = (over: Partial<import("@lynia/shared").MerchantDishResponse> = {}) => ({
  id: "d1",
  categoryId: "c1",
  name: "Sadza",
  description: null,
  priceUsd: 5,
  photoUrl: null,
  isDraft: false,
  outOfStock: false,
  sortOrder: 0,
  ...over,
});

describe("groupDishesByCategory", () => {
  it("groups dishes under their own category, ordered by category sortOrder", () => {
    const categories = [category({ id: "c2", name: "Drinks", sortOrder: 1 }), category({ id: "c1", name: "Mains", sortOrder: 0 })];
    const dishes = [dish({ id: "d1", categoryId: "c1" }), dish({ id: "d2", categoryId: "c2" })];
    const groups = groupDishesByCategory(categories, dishes);
    expect(groups.map((g) => g.category.name)).toEqual(["Mains", "Drinks"]);
    expect(groups[0]?.dishes.map((d) => d.id)).toEqual(["d1"]);
    expect(groups[1]?.dishes.map((d) => d.id)).toEqual(["d2"]);
  });

  it("gives an empty category an empty dish list rather than dropping it", () => {
    const groups = groupDishesByCategory([category({ id: "c1" })], []);
    expect(groups).toEqual([{ category: category({ id: "c1" }), dishes: [] }]);
  });

  it("silently drops a dish whose category no longer exists rather than crashing", () => {
    const groups = groupDishesByCategory([category({ id: "c1" })], [dish({ categoryId: "gone" })]);
    expect(groups[0]?.dishes).toEqual([]);
  });
});

describe("menuSummary", () => {
  it("counts categories and dishes with no OOS/draft callouts when there are none", () => {
    expect(menuSummary([category(), category({ id: "c2" })], [dish()])).toBe("2 categories · 1 dish");
  });

  it("adds an out-of-stock callout", () => {
    expect(menuSummary([category()], [dish({ outOfStock: true })])).toBe("1 category · 1 dish · 1 out of stock");
  });

  it("adds a draft callout, pluralized", () => {
    expect(menuSummary([category()], [dish({ isDraft: true }), dish({ id: "d2", isDraft: true })])).toBe(
      "1 category · 2 dishes · 2 drafts waiting for a photo",
    );
  });
});
