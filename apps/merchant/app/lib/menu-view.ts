import type { MerchantDishResponse, MerchantProfileResponse } from "@lynia/shared";
import { type PartialMerchantHours } from "./hours";
import { nextOpenTime } from "./orders-view";
import { startOfNextDay } from "@lynia/shared";

/**
 * C1 Menu and C2 Out-of-stock sheet (packages/design/handoff/merchant-mobile, ledger D-48), kept pure
 * so the rules are unit-tested: what an off dish's line says, when "Rest of today" brings it back, and
 * what the search matches.
 */

/** "Until I turn it back on" is stored as a date no kitchen reaches (the API's year 9999). */
const UNTIL_BACK_YEAR = 9000;

function hm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * An off dish's gold line: "Off until 08:00 tomorrow" (T1, Merchant v2 — tomorrow's opening time, when
 * the business has hours), "Off until tomorrow" without them, "Off until you turn it back on", or
 * "Off until 14:30" for a time later today.
 */
export function offLabel(
  dish: Pick<MerchantDishResponse, "outOfStock" | "outOfStockUntil">,
  now: Date,
  business: Pick<MerchantProfileResponse, "hours"> | null = null,
): string | null {
  if (!dish.outOfStock) return null;
  const tomorrow = () => {
    const next = nextOpenTime((business?.hours ?? null) as PartialMerchantHours | null, startOfNextDay(now));
    return next ? `Off until ${next} tomorrow` : "Off until tomorrow";
  };
  if (!dish.outOfStockUntil) return tomorrow();
  const until = new Date(dish.outOfStockUntil);
  if (until.getFullYear() >= UNTIL_BACK_YEAR) return "Off until you turn it back on";
  const sameDay = until.toDateString() === now.toDateString();
  return sameDay && until.getHours() < 23 ? `Off until ${hm(until)}` : tomorrow();
}

/** C2 "Rest of today"'s sub-line: "Back on automatically at 08:00", tomorrow's opening time. */
export function backOnLine(business: Pick<MerchantProfileResponse, "hours"> | null, now: Date): string {
  const next = nextOpenTime((business?.hours ?? null) as PartialMerchantHours | null, startOfNextDay(now));
  return next ? `Back on automatically at ${next}` : "Back on automatically tomorrow";
}

/** The header search: every dish whose name holds the query, whatever category it sits in. */
export function searchDishes(dishes: readonly MerchantDishResponse[], query: string): MerchantDishResponse[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...dishes];
  return dishes.filter((d) => d.name.toLowerCase().includes(q));
}
