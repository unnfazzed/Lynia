/**
 * Review & place (Order flow v2 R1–R9, ledger D-59) — the pure rules behind `app/food/checkout.tsx`.
 * Framework-free so the money, the reconcile and the exact place-order payload unit-test off-device.
 * The screen owns state and effects; everything that decides a figure or a request body lives here.
 */
import {
  normalizePhone,
  type CustomerBalanceResponse,
  type OutOfStockPref,
  type PlaceMerchantOrderRequest,
  type PrescriptionInput,
  type ScheduleSlot,
  type ScheduleSlotsResponse,
} from "@lynia/shared";
import { RESTAURANTS_PRICING, smallOrderFeeForSubtotal } from "@lynia/shared/restaurants-order";
import { cartSubtotal, type FoodCartLine } from "./food-cart";
import { zwNationalDigits } from "./zw-mobile";

// ── Breakdown ──────────────────────────────────────────────────────────────────────────────────────

export interface ReviewBreakdown {
  /** "Food" — the dishes. */
  food: number;
  /** "Delivery fee" — null until a drop-off exists (R9b draws no fee without an address). */
  deliveryFee: number | null;
  /** "Small-order fee" — $1.00 under the $4.00 minimum, else 0 (the row is not rendered). */
  smallOrderFee: number;
  /** BRIEF D3f: owed from an earlier cancel after collection, carried on this order (0 = no row). */
  owed: number;
  /** "Total" — food + small-order fee + the delivery fee when known + anything owed. The cash the
   *  customer pays at the door. */
  total: number;
  /** Under the minimum: R4's "Add {d} more to skip the {f} small-order fee." */
  belowMinimum: boolean;
  /** What R4's hint names as `{d}` — the food still needed to clear the minimum. 0 when clear. */
  shortfall: number;
}

/** Cents-exact sum: money is added in integer cents so $9.00 + $6.00 + $1.50 is $16.50, never 16.499…. */
function cents(n: number): number {
  return Math.round(n * 100);
}

export function reviewBreakdown(lines: readonly FoodCartLine[], deliveryFee: number | null, owed = 0): ReviewBreakdown {
  const food = cents(cartSubtotal(lines as FoodCartLine[])) / 100;
  const smallOrderFee = lines.length > 0 ? smallOrderFeeForSubtotal(food) : 0;
  const belowMinimum = lines.length > 0 && food < RESTAURANTS_PRICING.minOrderSubtotal;
  const carried = owed > 0 ? cents(owed) / 100 : 0;
  const total = (cents(food) + cents(smallOrderFee) + cents(deliveryFee ?? 0) + cents(carried)) / 100;
  const shortfall = belowMinimum ? (cents(RESTAURANTS_PRICING.minOrderSubtotal) - cents(food)) / 100 : 0;
  return { food, deliveryFee, smallOrderFee, owed: carried, total, belowMinimum, shortfall };
}

/**
 * BRIEF D3f: what the NEXT order carries as `previousBalanceUsd` — every owed line not already carried by
 * a live order (the server's "open" rows). Mirrors `openBalance` in apps/api customer-balance.ts.
 */
export function carriedBalance(balance: Pick<CustomerBalanceResponse, "lines">): number {
  return balance.lines.filter((l) => l.carriedOnOrderId == null).reduce((sum, l) => sum + cents(l.amount), 0) / 100;
}

// ── Reconcile (R6a) ────────────────────────────────────────────────────────────────────────────────

export interface LatestDish {
  priceUsd: number;
  outOfStock: boolean;
}

export interface ReconcileResult {
  /** The lines that stay in the cart, at their CURRENT price. */
  lines: FoodCartLine[];
  /** Lines taken off because the dish is gone or sold out — drawn struck through on R6a. */
  gone: FoodCartLine[];
  /** Price changes applied to kept lines, keyed by the line key (`dishId|note`). */
  priceChanges: Record<string, { from: number; to: number }>;
}

export function lineKey(l: Pick<FoodCartLine, "dishId" | "note">): string {
  return `${l.dishId}|${l.note}`;
}

/**
 * Reconciles the cart against the latest menu fetch: a dish gone or now out of stock is taken off; a
 * changed price is applied to the line. The cart never silently keeps a stale price (D-35) — R6a shows
 * both changes above the items, so the customer sees exactly what moved before placing.
 */
export function reconcileCart(lines: readonly FoodCartLine[], latest: ReadonlyMap<string, LatestDish> | null): ReconcileResult {
  if (!latest) return { lines: [...lines], gone: [], priceChanges: {} };
  const kept: FoodCartLine[] = [];
  const gone: FoodCartLine[] = [];
  const priceChanges: Record<string, { from: number; to: number }> = {};
  for (const line of lines) {
    const dish = latest.get(line.dishId);
    if (!dish || dish.outOfStock) {
      gone.push(line);
      continue;
    }
    if (dish.priceUsd !== line.priceUsd) {
      priceChanges[lineKey(line)] = { from: line.priceUsd, to: dish.priceUsd };
      kept.push({ ...line, priceUsd: dish.priceUsd });
    } else {
      kept.push(line);
    }
  }
  return { lines: kept, gone, priceChanges };
}

// ── Place order ────────────────────────────────────────────────────────────────────────────────────

/** The contract caps a waypoint landmark at 160. */
export const LANDMARK_MAX = 160;

/**
 * The drop-off's `landmark` — the rider-facing line the API has always taken. Before Review it was the
 * one "Landmark / delivery notes" field (prefilled with the reverse-geocoded address, overwritten by
 * whatever the customer typed, e.g. "Blue gate, 3rd house on the left"). Review splits that field into
 * the drawn "Deliver to" address and "Note for the rider", so the landmark is the rider note when there
 * is one and the address line otherwise — the same value the old field held in either case.
 */
export function deliveryLandmark(addressLabel: string, riderNote: string): string {
  const note = riderNote.trim();
  return (note || addressLabel.trim()).slice(0, LANDMARK_MAX);
}

export interface PlaceInput {
  lines: readonly FoodCartLine[];
  orderNote: string;
  drop: { lat: number; lng: number; label: string };
  riderNote: string;
  phone: string;
  idempotencyKey: string;
  /** R5: the chosen slot's start, exactly as the slots API returned it. Absent = ASAP. */
  scheduledFor?: string | null;
  /** R2a/R2b: shops and pharmacies only ("Ask me" / "Remove it"). */
  outOfStockPref?: OutOfStockPref | null;
  /** R8: the prescription, when a line needs one (and `rxEnabled`). */
  prescription?: PrescriptionInput | null;
}

/**
 * The exact `POST /restaurants/:id/orders` body. Unchanged from the old checkout: per-line notes, the
 * whole-order note, the drop-off waypoint with an E.164 contact phone, cash, and the idempotency key.
 */
export function placeOrderBody(input: PlaceInput): PlaceMerchantOrderRequest {
  return {
    items: input.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, note: l.note || undefined })),
    note: input.orderNote || undefined,
    dropoff: {
      point: { lat: input.drop.lat, lng: input.drop.lng },
      landmark: deliveryLandmark(input.drop.label, input.riderNote),
      contactPhone: normalizePhone(input.phone) ?? input.phone.trim(),
    },
    // D-48 / BRIEF §14: food is cash at the door only.
    paymentMethod: "cash",
    idempotencyKey: input.idempotencyKey,
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
    ...(input.outOfStockPref ? { outOfStockPref: input.outOfStockPref } : {}),
    ...(input.prescription ? { prescription: input.prescription } : {}),
  };
}

// ── Scheduled (R5a–c) ──────────────────────────────────────────────────────────────────────────────

export type SlotDay = "today" | "tomorrow";

export interface ChosenSlot {
  day: SlotDay;
  slot: ScheduleSlot;
}

/** Which list a slot came from (by its start); null when it's in neither any more. */
export function slotDay(slots: Pick<ScheduleSlotsResponse, "today" | "tomorrow">, start: string): SlotDay | null {
  if (slots.today.slots.some((s) => s.start === start)) return "today";
  if (slots.tomorrow.slots.some((s) => s.start === start)) return "tomorrow";
  return null;
}

/** The first slot that isn't full, with its day — R5c "Order for when they open" and R6b "Schedule for …". */
export function firstSlot(slots: ScheduleSlotsResponse): ChosenSlot | null {
  const s = slots.firstAvailable;
  if (!s || s.full) return null;
  const day = slotDay(slots, s.start);
  return day ? { day, slot: s } : null;
}

/** R5b "{v} starts {making} at {t}": the slot's start minus the venue's lead time, on the 24-hour clock. */
export function startsAt(slotStart: string, leadMinutes: number): string {
  const t = new Date(slotStart).getTime() - leadMinutes * 60_000;
  return Number.isFinite(t) ? hhmm(new Date(t)) : "";
}

// ── Clocks ─────────────────────────────────────────────────────────────────────────────────────────

/** "12:40" — the 24-hour clock every Order flow v2 frame draws. */
export function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** R1 "Arrives {a}–{b}" from an honest minutes band; null without one (never an invented window). */
export function arrivalWindow(band: { low: number; high: number } | null, now: Date): { a: string; b: string } | null {
  if (!band) return null;
  const at = (m: number): string => hhmm(new Date(now.getTime() + m * 60_000));
  return { a: at(band.low), b: at(band.high) };
}

/** The `{a}` R3b names: the first part of the address line ("Chitungwiza" of "Chitungwiza, Unit L"). */
export function areaOf(label: string): string {
  return (label.split(",")[0] ?? label).trim() || label.trim();
}

/** "0771 234 567" — how the YOUR PHONE block shows a Zimbabwe mobile; anything else as typed. */
export function displayPhone(phone: string): string {
  const d = zwNationalDigits(phone);
  return d.length === 9 ? `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : phone.trim();
}
