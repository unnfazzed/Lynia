import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";

export interface CategoryGroup {
  category: MerchantCategoryResponse;
  dishes: MerchantDishResponse[];
}

/** Groups the flat dish list (GET /merchant/dishes) under the merchant's own categories, in the
 *  categories' own sortOrder — the same order the customer sees the menu tabs in (D-29). A dish whose
 *  categoryId doesn't match any known category (a race between an in-flight category delete and this
 *  fetch) is silently dropped from the grouped view rather than crashing the page — it still exists
 *  server-side and the next refetch resolves it either way. */
export function groupDishesByCategory(categories: MerchantCategoryResponse[], dishes: MerchantDishResponse[]): CategoryGroup[] {
  const byCategory = new Map<string, MerchantDishResponse[]>();
  for (const dish of dishes) {
    const list = byCategory.get(dish.categoryId);
    if (list) list.push(dish);
    else byCategory.set(dish.categoryId, [dish]);
  }
  return [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((category) => ({ category, dishes: byCategory.get(category.id) ?? [] }));
}

/** D-29 "four one-tap starting points" for a merchant with zero categories — the first-run screen
 *  can't let them add a dish into nothing, so these are one-tap category creates. */
export const STARTER_CATEGORY_NAMES = ["Mains", "Sides", "Drinks", "Breakfast"] as const;

export function menuSummary(categories: MerchantCategoryResponse[], dishes: MerchantDishResponse[]): string {
  const catWord = categories.length === 1 ? "category" : "categories";
  const dishWord = dishes.length === 1 ? "dish" : "dishes";
  const oosCount = dishes.filter((d) => d.outOfStock).length;
  const draftCount = dishes.filter((d) => d.isDraft).length;
  const parts = [`${categories.length} ${catWord}`, `${dishes.length} ${dishWord}`];
  // "1 out of stock today" — M4·1's own sub-line wording (r-merchant.jsx:955); out-of-stock is a
  // same-day flag here (it clears at the start of the next open day), so "today" is literal.
  if (oosCount > 0) parts.push(`${oosCount} out of stock today`);
  if (draftCount > 0) parts.push(`${draftCount} draft${draftCount === 1 ? "" : "s"} waiting for a photo`);
  return parts.join(" · ");
}
