import { FARE_UNIT_USD, normalizePhone, quoteFare, roundFare, stepFare } from "@lynia/shared";
import { parseNum } from "../util";
import type { ItemRow } from "./order-draft";
import { isAccountOnHold, isWithinServiceCorridor } from "./gates";

/**
 * The pure rules of the stepped Send flow (ledger D-52, packages/design/handoff/send-compose-v2). The
 * screen (app/send.tsx) owns state and effects; everything that decides "is this step done, what is
 * still missing, where does the price go" lives here so it is unit-testable without rendering.
 */

export type SendStep = 1 | 2 | 3 | 4;

/** One end of the trip. `name` is the rider-facing label (the address line) — there is no landmark. */
export interface Stop {
  lat: number;
  lng: number;
  name: string;
  placeId?: string;
  /** Where the point came from. `gps` drives the "PICKUP · Your location" meta on the row. */
  source: "gps" | "search" | "map" | "prefill";
}

export const STOP_NAME_MAX = 160;

/** A stop's label: trimmed and capped at the contract's 160. */
export function stopName(name: string): string {
  return name.trim().slice(0, STOP_NAME_MAX);
}

/** The label a pin gets before (or without) a reverse geocode: its coordinates, so it is never empty. */
export function coordName(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function inArea(stop: Stop | null): boolean {
  return stop != null && isWithinServiceCorridor({ lat: stop.lat, lng: stop.lng });
}

export function phoneOk(phone: string): boolean {
  return normalizePhone(phone) !== null;
}

export function itemsOk(items: ItemRow[]): boolean {
  return items.length > 0 && items.every((it) => it.description.trim().length > 0);
}

/**
 * U47: the shortest trip that counts as a trip. "Use my location" can drop the drop-off on the GPS pickup,
 * a 0.0 km "delivery" that went out to riders. A drop-off within 50 m of the pickup is treated as not set
 * (the CTA hint asks for a drop-off again, the existing "Add a drop-off to continue.").
 */
export const MIN_TRIP_KM = 0.05;

/** True when both stops exist but sit closer together than MIN_TRIP_KM. */
export function tripTooShort(pickup: Stop | null, drop: Stop | null): boolean {
  if (!pickup || !drop) return false;
  return quoteFare({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng }).distanceKm < MIN_TRIP_KM;
}

/** Step 1 is done when both stops exist, both sit inside the service corridor, and they are apart (U47). */
export function whereOk(pickup: Stop | null, drop: Stop | null): boolean {
  return pickup != null && drop != null && inArea(pickup) && inArea(drop) && !tripTooShort(pickup, drop);
}

export function whatOk(items: ItemRow[], senderPhone: string, recipientPhone: string): boolean {
  return itemsOk(items) && phoneOk(senderPhone) && phoneOk(recipientPhone);
}

/** The contract's ceiling on `proposedFare` (CreateOrderRequest: `.max(100_000)`). */
export const PRICE_MAX = 100_000;

/**
 * A price Review can send. U61: above the contract's $100,000 the create was refused client-side and the
 * customer got a "Couldn't send" whose Try again failed forever; now Review stays disabled instead.
 */
export function priceOk(price: number | null): boolean {
  return price != null && Number.isFinite(price) && price > 0 && price <= PRICE_MAX;
}

/**
 * The CTA hint for step 2: "Still needed: what you're sending, recipient phone" names only what is
 * actually missing, in the order the fields appear. Null when nothing is.
 */
export function whatMissingHint(
  items: ItemRow[],
  senderPhone: string,
  recipientPhone: string,
  /** A phone field already showing its own inline error is not repeated in the hint. */
  shown: { senderShown?: boolean; recipientShown?: boolean } = {},
): string | null {
  const missing: string[] = [];
  if (!itemsOk(items)) missing.push("what you're sending");
  if (!phoneOk(senderPhone) && !shown.senderShown) missing.push("your phone");
  if (!phoneOk(recipientPhone) && !shown.recipientShown) missing.push("recipient phone");
  return missing.length > 0 ? `Still needed: ${missing.join(", ")}` : null;
}

/**
 * U45: the server refuses a broadcast for the sender's account standing — a customer hold (`on_hold`), or a
 * banned or suspended rider sending as a customer (`account_banned` / `account_suspended`). Every one of
 * them lands on the drawn hold wall (state 17); a retry can never succeed.
 */
export type SendRefusal = "hold" | "standing";
export function sendRefusal(err: { code?: string | null; message?: string | null } | null | undefined): SendRefusal | null {
  if (!err) return null;
  const code = (err.code ?? "").toLowerCase();
  if (code === "account_banned" || code === "account_suspended") return "standing";
  return isAccountOnHold(err) ? "hold" : null;
}

/**
 * U16: whether a failed create is a DEFINITIVE answer about this order. A 4xx is: the server judged the
 * request and refused it, so nothing was created. Anything else — no response (status 0: a timeout, a
 * dropped link), a 5xx, a non-API error — may have created the order before the answer was lost, so the
 * idempotency key that went out stays frozen and the next send replays it.
 */
export function isDefinitiveSendFailure(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number" || status < 400 || status >= 500) return false;
  // A standing refusal (U45) is checked BEFORE the server's idempotency lookup, so an order an earlier,
  // unanswered attempt made under this key may still exist: the key stays frozen behind the hold wall.
  return sendRefusal(err as { code?: string | null; message?: string | null }) == null;
}


/** The first step that is not yet complete — where a prefilled "Send again" lands. */
export function firstIncompleteStep(s: {
  pickup: Stop | null;
  drop: Stop | null;
  items: ItemRow[];
  senderPhone: string;
  recipientPhone: string;
  price: number | null;
}): SendStep {
  if (!whereOk(s.pickup, s.drop)) return 1;
  if (!whatOk(s.items, s.senderPhone, s.recipientPhone)) return 2;
  if (!priceOk(s.price)) return 3;
  return 4;
}

/** − / + on the price: to the next 50c, never below $0.50, always two decimals. */
export const PRICE_STEP = FARE_UNIT_USD;
export const PRICE_FLOOR = 0.5;
export function stepPrice(price: number | null, dir: 1 | -1): number {
  return stepFare(price != null && Number.isFinite(price) ? price : 0, dir, PRICE_FLOOR);
}

/** The price the customer is asking: what they typed, to the nearest 50c (every fare is, owner 2026-10-15). */
export function priceFromText(text: string): number | null {
  const n = parseNum(text);
  return n != null && Number.isFinite(n) && n > 0 ? roundFare(n) : n;
}

/** Typed price text → at most two decimals (the decimal pad allows anything). */
export function sanitizePriceText(t: string): string {
  const cleaned = t.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole ?? "";
  return `${whole ?? ""}.${rest.join("").slice(0, 2)}`;
}

/**
 * The band bar's scale. The handoff draws a $0–$6 track; a long trip's band can sit past $6, so the
 * scale stretches to keep the whole band (plus headroom) on the track rather than clipping it.
 */
export function bandScaleMax(bandHigh: number): number {
  return Math.max(6, Math.ceil(bandHigh * 1.5));
}

/** 0–1 position of a value on a 0–max track, clamped to the ends. */
export function trackPos(value: number, max: number): number {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/** "3.1 km" — one decimal, the handoff's distance format. */
export function kmLabel(km: number): string {
  return `${km.toFixed(1)} km`;
}

/** "$3.36" */
export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The "Send again" banner: "Copied from your order on 28 Sep. Check it, then send." */
export function sendAgainBanner(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "Copied from your order. Check it, then send.";
  return `Copied from your order on ${d.getDate()} ${MONTHS[d.getMonth()]}. Check it, then send.`;
}
