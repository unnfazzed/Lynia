/**
 * D1 (browse) cart — pure types + helpers, framework-free so the math unit-tests off-device. The
 * cart itself lives in ../state/food-cart.tsx (React context + SecureStore persistence); this file
 * only shapes the data and totals it.
 */
import { RESTAURANTS_PRICING, smallOrderFeeForSubtotal } from "@lynia/shared";

export const MAX_ITEM_QTY = 20;

export interface FoodCartLine {
  dishId: string;
  name: string;
  priceUsd: number;
  quantity: number;
  /** D-35: a note on this single line — travels with it on the kitchen ticket. Never changes price. */
  note: string;
}

export interface FoodCartState {
  restaurantId: string | null;
  restaurantName: string | null;
  lines: FoodCartLine[];
  /** D-35: one note for the whole order, distinct from a per-line note. */
  orderNote: string;
}

export const EMPTY_CART: FoodCartState = { restaurantId: null, restaurantName: null, lines: [], orderNote: "" };

export function cartItemCount(lines: FoodCartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function cartSubtotal(lines: FoodCartLine[]): number {
  return lines.reduce((sum, l) => sum + l.priceUsd * l.quantity, 0);
}

/** N-15: the small-order fee that applies below the $4.00 minimum — 0 once the cart clears it. */
export function cartSmallOrderFee(lines: FoodCartLine[]): number {
  return smallOrderFeeForSubtotal(cartSubtotal(lines));
}

export function cartTotal(lines: FoodCartLine[]): number {
  return cartSubtotal(lines) + cartSmallOrderFee(lines);
}

export function isBelowMinimumOrder(lines: FoodCartLine[]): boolean {
  return lines.length > 0 && cartSubtotal(lines) < RESTAURANTS_PRICING.minOrderSubtotal;
}

/** Upsert a line: adding an already-present dish (same id, same note) sums the quantity rather than
 *  duplicating the row — matches how the menu row's "in cart: N" badge reads. A different note on
 *  the same dish is kept as its own line (it's a different kitchen instruction). */
export function addLine(lines: FoodCartLine[], line: FoodCartLine): FoodCartLine[] {
  const idx = lines.findIndex((l) => l.dishId === line.dishId && l.note === line.note);
  if (idx === -1) return [...lines, line];
  const next = [...lines];
  const existing = next[idx] as FoodCartLine;
  next[idx] = { ...existing, quantity: Math.min(MAX_ITEM_QTY, existing.quantity + line.quantity) };
  return next;
}

/** Set an existing line's quantity; 0 removes it. Matched by dishId + note (see addLine). */
export function setLineQuantity(lines: FoodCartLine[], dishId: string, note: string, quantity: number): FoodCartLine[] {
  if (quantity <= 0) return lines.filter((l) => !(l.dishId === dishId && l.note === note));
  return lines.map((l) => (l.dishId === dishId && l.note === note ? { ...l, quantity: Math.min(MAX_ITEM_QTY, quantity) } : l));
}

export function removeLine(lines: FoodCartLine[], dishId: string, note: string): FoodCartLine[] {
  return lines.filter((l) => !(l.dishId === dishId && l.note === note));
}
