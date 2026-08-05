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
  return sortedCategories(categories).map((category) => ({ category, dishes: byCategory.get(category.id) ?? [] }));
}

/** Categories in the order customers see them as menu tabs. Ties on `sortOrder` are broken by name so
 *  the list is stable across refetches — `POST /merchant/categories` never assigns a sortOrder, so a
 *  shop that has never reordered has every category sitting on the schema default of 0 and Postgres is
 *  free to return them in any order it likes. */
export function sortedCategories(categories: MerchantCategoryResponse[]): MerchantCategoryResponse[] {
  return [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * M4·2 reorder (r-merchant.jsx:1005-1010). Moves one category by `delta` places and returns both the
 * new order and the minimum set of `PATCH /merchant/categories/:id { sortOrder }` writes that makes it
 * stick.
 *
 * Every position whose index no longer matches its stored `sortOrder` is rewritten, not just the two
 * that swapped: `createCategory` leaves every category on the default `sortOrder: 0`, so on a shop that
 * has never reordered, patching only the swapped pair would leave 0,1,0,0 — an order the server can't
 * reproduce. Normalising to 0..n-1 is the one write pattern that makes the list deterministic using
 * only the endpoint that already exists.
 */
export function planCategoryMove(
  categories: MerchantCategoryResponse[],
  categoryId: string,
  delta: number,
): { next: MerchantCategoryResponse[]; patches: { id: string; sortOrder: number }[] } {
  const ordered = sortedCategories(categories);
  const from = ordered.findIndex((c) => c.id === categoryId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordered.length) return { next: ordered, patches: [] };

  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);

  const patches = next.flatMap((c, i) => (c.sortOrder === i ? [] : [{ id: c.id, sortOrder: i }]));
  return { next, patches };
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
