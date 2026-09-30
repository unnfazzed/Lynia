import type { CreateMerchantBookingRequest, LatLng } from "@lynia/shared";
import { DECLARED_VALUE_CAP, SEND_DISCLAIMER_VERSION, VALUE_CAP_MESSAGE } from "./booking";
import { insideServiceArea } from "./geo";
import { LOCAL_DIGITS, toE164 } from "./phone-input";

/**
 * D2 · Book · where and D3 · Book · what + fare (packages/design/handoff/merchant-mobile, ledger D-48),
 * kept pure so every rule is unit-tested: the items and their worth, the fare stepper, and the
 * `POST /merchant/bookings` body.
 */

export const FARE_STEP = 0.5;
export const FARE_MIN = 1.5;

export interface BookLine {
  /** Set when the line came from the shop's own items. */
  dishId?: string;
  name: string;
  qty: number;
  /** Price of one; the line shows qty × this. */
  unitPrice: number;
}

export interface Where {
  point: LatLng;
  /** What the rider looks for there: the address picked, or what the buyer's link said. */
  address: string;
}

/** "Worth $51.00": auto-summed from the lines (D3). */
export function worth(lines: readonly BookLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * 100) / 100;
}

/** Adding the same item from the list again bumps its quantity rather than repeating the line. */
export function addLine(lines: readonly BookLine[], line: BookLine): BookLine[] {
  const i = line.dishId ? lines.findIndex((l) => l.dishId === line.dishId) : -1;
  if (i < 0) return [...lines, line];
  return lines.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l));
}

/** The fare the stepper starts on: Send's suggestion, to the nearest step, never under the minimum. */
export function startFare(suggested: number): number {
  return Math.max(FARE_MIN, Math.round(suggested / FARE_STEP) * FARE_STEP);
}

export function stepFare(fare: number, direction: -1 | 1): number {
  return Math.max(FARE_MIN, Math.round((fare + direction * FARE_STEP) * 100) / 100);
}

/** "Typical $3–4": the whole dollars either side of Send's suggestion. */
export function typicalLine(suggested: number): string {
  const low = Math.max(1, Math.floor(suggested));
  const high = Math.max(low + 1, Math.ceil(suggested));
  return `Typical $${low}–${high}`;
}

export type WhereErrors = Partial<Record<"where" | "phone", string>>;

export function validateWhere(where: Where | null, phoneDigits: string): WhereErrors {
  const errors: WhereErrors = {};
  if (!where) errors.where = "Search for the buyer's street, or paste the location they sent.";
  else if (!insideServiceArea(where.point)) errors.where = "That's outside the area LyniaGo covers for now.";
  if (phoneDigits.length !== LOCAL_DIGITS) errors.phone = "Enter the buyer's number, like 77 123 4567.";
  return errors;
}

export function validateWhat(lines: readonly BookLine[], collectCash = false): string | null {
  if (lines.length === 0) return "Add what's going: from your items, or type one.";
  // Cash on delivery rides as one more line on the booking (packages/shared booking-cod.ts).
  const max = collectCash ? 9 : 10;
  if (lines.length > max) return `A booking carries up to ${max} lines. Split it into two.`;
  if (worth(lines) > DECLARED_VALUE_CAP) return VALUE_CAP_MESSAGE;
  return null;
}

/** The `POST /merchant/bookings` body. Only call once both steps validate. */
export function toBookingRequest(
  where: Where,
  phoneDigits: string,
  lines: readonly BookLine[],
  fare: number,
  idempotencyKey: string,
  collectCash = false,
): CreateMerchantBookingRequest {
  return {
    dropoff: { point: where.point, landmark: where.address.trim().slice(0, 160) || "Buyer's location", contactPhone: toE164(phoneDigits) },
    items: lines.map((l) => ({ description: l.name.trim().slice(0, 140), quantity: l.qty })),
    declaredValue: worth(lines),
    proposedFare: fare,
    disclaimerVersion: SEND_DISCLAIMER_VERSION,
    idempotencyKey,
    ...(collectCash ? { collectCash: true } : {}),
  };
}
