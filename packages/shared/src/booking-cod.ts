import type { OrderItem } from "./contracts";

/**
 * Cash on delivery for a shop booking (merchant mobile redesign PR 4b, docs/DESIGN-DEVIATIONS.md D-48
 * §8): the rider collects the booking's declared value from the buyer and brings it back to the shop.
 *
 * The choice travels as one line item on the Send order, "Cash on delivery: collect $51.00 from the
 * buyer, bring it back to Mbare Auto Spares". That is deliberate:
 *  - every rider app already shows a booking's items (the board's line and the job's list), so a rider
 *    on an install from before this change still sees the cash before offering — no forced update;
 *  - Send copies items when it re-broadcasts a booking whose rider cancelled, and "Try again" reuses
 *    them, so the choice follows the booking with no extra plumbing.
 * The API opens the rider's debt at delivery when it finds the line; the merchant web hides it from
 * the item list and shows the cash its own way.
 */
export const COD_ITEM_PREFIX = "Cash on delivery: ";

/** The line added to a cash-on-delivery booking's items. Kept under OrderItem's 140 characters. */
export function codItem(amount: number, shopName: string): OrderItem {
  const head = `${COD_ITEM_PREFIX}collect $${amount.toFixed(2)} from the buyer, bring it back to `;
  return { description: `${head}${shopName.trim().slice(0, 140 - head.length) || "the shop"}`, quantity: 1 };
}

/** Tolerant of a malformed item (no description), as items are JSON read back from old rows. */
export function isCodItem(item: Pick<OrderItem, "description"> | null | undefined): boolean {
  return typeof item?.description === "string" && item.description.startsWith(COD_ITEM_PREFIX);
}

/** The amount a cash-on-delivery line asks for, or null when the items carry none. */
export function codAmount(items: readonly Pick<OrderItem, "description">[] | null | undefined): number | null {
  const line = items?.find(isCodItem);
  const m = line ? /\$(\d+(?:\.\d{1,2})?)/.exec(line.description) : null;
  return m ? Number(m[1]) : null;
}

/** The items without the cash line, for everywhere the shop's own goods are listed. */
export function withoutCodItem<T extends Pick<OrderItem, "description">>(items: readonly T[]): T[] {
  return items.filter((i) => !isCodItem(i));
}
