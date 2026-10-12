import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentRailStatus } from "./payment-rail.interface";

/**
 * Paynow's wire format (developers.paynow.co.zw), as pure functions so the protocol is testable without
 * the network. Every message both ways is a URL-encoded `key=value&…` string carrying a `hash`:
 * SHA-512, as uppercase hex, of every other field's RAW value concatenated in message order, followed by
 * the integration key. A message whose hash doesn't verify is not from Paynow and is never acted on.
 */

/** One Paynow message: its fields in wire order, keys lower-cased (Paynow writes `Status` and `status`). */
export type PaynowMessage = Array<[key: string, value: string]>;

/** The hash Paynow expects on `fields` (any `hash` field is skipped). */
export function paynowHash(fields: PaynowMessage, integrationKey: string): string {
  let joined = "";
  for (const [key, value] of fields) {
    if (key.toLowerCase() !== "hash") joined += value;
  }
  return createHash("sha512").update(joined + integrationKey, "utf8").digest("hex").toUpperCase();
}

/** `fields` plus their hash, URL-encoded in the same order the hash was computed over. */
export function encodePaynowMessage(fields: PaynowMessage, integrationKey: string): string {
  const body = new URLSearchParams();
  for (const [key, value] of fields) body.append(key, value);
  body.append("hash", paynowHash(fields, integrationKey));
  return body.toString();
}

/** Parse a Paynow reply or status update. Keys are lower-cased; values are URL-decoded. */
export function parsePaynowMessage(raw: string): PaynowMessage {
  const out: PaynowMessage = [];
  for (const [key, value] of new URLSearchParams(raw.trim())) out.push([key.toLowerCase(), value]);
  return out;
}

export function paynowField(message: PaynowMessage, key: string): string | undefined {
  const k = key.toLowerCase();
  return message.find(([name]) => name === k)?.[1];
}

/** True when `message` carries a hash and it matches. Constant-time compare. */
export function verifyPaynowMessage(message: PaynowMessage, integrationKey: string): boolean {
  const given = paynowField(message, "hash");
  if (!given) return false;
  const want = Buffer.from(paynowHash(message, integrationKey), "utf8");
  const got = Buffer.from(given.toUpperCase(), "utf8");
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Paynow's transaction status → the rail seam's view. `Paid`, `Awaiting Delivery` and `Delivered` all
 * mean the money moved. `Cancelled` and `Failed` are final. Everything else, including `Created`, `Sent`
 * and `Disputed` (funds held for ops), is still pending, so nothing is credited or declined on it.
 */
export function mapPaynowStatus(status: string | undefined): PaymentRailStatus {
  switch ((status ?? "").trim().toLowerCase()) {
    case "paid":
    case "awaiting delivery":
    case "delivered":
      return "confirmed";
    case "cancelled":
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** Paynow wants the mobile-money line in national form: `0771234567`. Null when it isn't a Zimbabwe mobile. */
export function paynowPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("263")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^7\d{8}$/.test(digits) ? `0${digits}` : null;
}

/** Our `TopUp` id as Paynow's `merchanttrace` (≤ 32 chars, unique per merchant): the UUID without dashes. */
export function paynowTrace(topUpId: string): string {
  return topUpId.replace(/-/g, "").slice(0, 32);
}
