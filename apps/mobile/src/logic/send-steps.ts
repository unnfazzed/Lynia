import { normalizePhone } from "@lynia/shared";
import type { ItemRow } from "./order-draft";
import { isWithinServiceCorridor } from "./gates";

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

/** Step 1 is done when both stops exist and both sit inside the service corridor. */
export function whereOk(pickup: Stop | null, drop: Stop | null): boolean {
  return pickup != null && drop != null && inArea(pickup) && inArea(drop);
}

export function whatOk(items: ItemRow[], senderPhone: string, recipientPhone: string): boolean {
  return itemsOk(items) && phoneOk(senderPhone) && phoneOk(recipientPhone);
}

export function priceOk(price: number | null): boolean {
  return price != null && Number.isFinite(price) && price > 0;
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

/** − / + on the price: $0.50 steps, never below $0.50, always two decimals. */
export const PRICE_STEP = 0.5;
export const PRICE_FLOOR = 0.5;
export function stepPrice(price: number | null, dir: 1 | -1): number {
  const base = price != null && Number.isFinite(price) ? price : 0;
  const next = Math.round((base + dir * PRICE_STEP) * 100) / 100;
  return Math.max(PRICE_FLOOR, next);
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
