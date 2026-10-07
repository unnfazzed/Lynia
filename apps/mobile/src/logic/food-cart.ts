/**
 * D1 (browse) cart — pure types + helpers, framework-free so the math unit-tests off-device. The
 * cart itself lives in ../state/food-cart.tsx (React context + SecureStore persistence); this file
 * only shapes the data and totals it.
 */
// Via the zod-free entry, not the barrel (MOB-BOOT-03-SIB-2): this module is EAGER at boot —
// app/food/_layout.tsx → cart-context → here (expo-router evaluates every layout while building
// the route tree) — and a barrel value import would put the API contracts back on the launch path.
import { RESTAURANTS_PRICING, smallOrderFeeForSubtotal } from "@lynia/shared/restaurants-order";
import { randomUuidV4, uuidV4FromSeed } from "../util";

export const MAX_ITEM_QTY = 20;

export interface FoodCartLine {
  dishId: string;
  name: string;
  priceUsd: number;
  quantity: number;
  /** D-35: a note on this single line — travels with it on the kitchen ticket. Never changes price. */
  note: string;
  /** Order flow v2 R8 (BRIEF §13): a pharmacy item that needs a prescription (only ever true while the
   *  `rxEnabled` flag is on — the server hides such items otherwise). */
  rxRequired?: boolean;
}

/** Order flow v2 (ledger D-59): which kind of venue the one cart belongs to. Restaurants and shops
 *  share the same merchant row (`businessType`), and Pharmacy is the shop kind `pharmacy`. */
export interface FoodCartVenue {
  businessType: "restaurant" | "shop";
  shopKind: string | null;
}

/** The customer section a cart's venue belongs to (picks the copy, the sticker and the storefront). */
export function cartService(venue: FoodCartVenue | null | undefined): "food" | "shops" | "pharmacy" {
  if (!venue || venue.businessType !== "shop") return "food";
  return venue.shopKind === "pharmacy" ? "pharmacy" : "shops";
}

export interface FoodCartState {
  restaurantId: string | null;
  restaurantName: string | null;
  lines: FoodCartLine[];
  /** D-35: one note for the whole order, distinct from a per-line note. */
  orderNote: string;
  /** The venue's kind; absent on a cart saved before shop ordering (a restaurant cart). */
  venue?: FoodCartVenue | null;
  /**
   * U02: a random token minted when a cart STARTS (the first line into an empty cart, or a switch to
   * another venue) and dropped with the cart (`clear()`, or the last line removed). It seeds the
   * place-order idempotency key, so retries of one attempt — a double tap, a timeout, an app restart
   * (the cart is persisted) — still land on the same key and dedupe, while the same basket ordered
   * again later is a NEW cart with a new key, not the old (cancelled / delivered) order replayed.
   * Absent on a cart saved before it existed; the cart store mints one on load.
   */
  nonce?: string;
}

export const EMPTY_CART: FoodCartState = { restaurantId: null, restaurantName: null, lines: [], orderNote: "" };

/** A fresh cart nonce (see `FoodCartState.nonce`). */
export function newCartNonce(): string {
  return randomUuidV4();
}

/**
 * U02: the place-order idempotency key for this cart. `attempt` is everything else that makes the order
 * (the drop-off, the slot, the out-of-stock choice, the prescription photos); the cart's own `nonce`
 * makes a new cart a new order even when every one of those matches a past one.
 */
export function foodOrderIdempotencyKey(cart: FoodCartState, attempt: string): string {
  return uuidV4FromSeed(`food-order|${cart.nonce ?? ""}|${cart.restaurantId}|${JSON.stringify(cart.lines)}|${cart.orderNote}|${attempt}`);
}

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
