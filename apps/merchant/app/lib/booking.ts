import {
  type CreateMerchantBookingRequest,
  type LatLng,
  MERCHANT_OFFER_WEIGHTS,
  type MerchantBookingOffer,
  type MerchantBookingResponse,
  type MerchantBookingState,
  type MerchantProfileResponse,
  normalizePhone,
  quoteFare,
  rankOffers,
  type Waypoint,
} from "@lynia/shared";
import { insideServiceArea } from "./geo";
import { parseAmountInput } from "./money-input";
import { randomUuid } from "./random-id";

/**
 * Book a rider's pure rules (merchant web upgrade L2, docs/designs/merchant-web-upgrade.md "L2 — Book a
 * rider"): when the feature is on, the states and their words, how often to poll, the booking form,
 * and getting the delivery code to the buyer.
 */

/** Send's liability disclaimer version — the same terms the customer app shows before a broadcast
 *  (apps/mobile/src/logic/order-draft.ts DISCLAIMER_POLICY_VERSION), recorded on the order. */
export const SEND_DISCLAIMER_VERSION = "2026-07-01";

/** Send's pilot cap on declared value. */
export const DECLARED_VALUE_CAP = 150;
export const VALUE_CAP_MESSAGE =
  "LyniaGo can carry goods worth up to $150 for now. Split it into smaller deliveries, or use your own transport for this one.";

/**
 * Book a rider is on once the API serves L2. Its `GET /merchant/me` carries `location` (an optional
 * field an older API doesn't send), so the web never offers a feature the API can't serve yet, in
 * whichever order the two deploy.
 */
export function bookingsAvailable(profile: Pick<MerchantProfileResponse, "location"> | null | undefined): boolean {
  return !!profile && profile.location !== undefined;
}

/** Where a signed-in business lands: its Orders home — the board for a restaurant, Deliveries for a shop
 *  until shops take customer orders. The setup checklist is gone (merchant mobile redesign, D-48).
 *  Shared by sign-in, sign-up and Orders. */
export function homePath(merchant: Pick<MerchantProfileResponse, "businessType">): string {
  return merchant.businessType === "shop" ? "/deliveries" : "/queue";
}

export const STATE_LABEL: Record<MerchantBookingState, string> = {
  finding: "Finding a rider",
  finding_again: "Your rider cancelled. Finding another",
  coming: "Rider coming to you",
  picked_up: "Picked up",
  delivered: "Delivered",
  not_delivered: "Not delivered",
  expired: "No rider picked in time",
  cancelled: "Cancelled",
};

export type BookingTone = "live" | "good" | "warn" | "muted";

export const STATE_TONE: Record<MerchantBookingState, BookingTone> = {
  finding: "live",
  finding_again: "warn",
  coming: "live",
  picked_up: "live",
  delivered: "good",
  not_delivered: "warn",
  expired: "warn",
  cancelled: "muted",
};

/** Send's undelivered reasons, in the business's words (the rider picked one at the door). */
export const UNDELIVERED_LABEL: Record<string, string> = {
  unreachable: "The rider couldn't reach the buyer.",
  refused: "The buyer refused the delivery.",
  wrong_address: "The address was wrong.",
  breakdown: "The rider's bike broke down.",
};

export function undeliveredText(reason: string | null): string {
  return (reason && UNDELIVERED_LABEL[reason]) || "The rider couldn't complete the delivery.";
}

export function isLiveBooking(state: MerchantBookingState): boolean {
  return state === "finding" || state === "finding_again" || state === "coming" || state === "picked_up";
}

export function isFinding(state: MerchantBookingState): boolean {
  return state === "finding" || state === "finding_again";
}

/** Every 3 s while finding a rider (the 90-second window), every 15 s after, never once it's over. */
export function pollIntervalMs(state: MerchantBookingState): number | null {
  if (isFinding(state)) return 3_000;
  if (state === "coming" || state === "picked_up") return 15_000;
  return null;
}

/**
 * The offers in the order the business should read them (L3): the usual fare/rating/ETA blend plus the
 * bonus for the business's own riders, and a teammate's offer (which can't be picked) last.
 */
export function orderOffers(offers: readonly MerchantBookingOffer[]): MerchantBookingOffer[] {
  const ranked = rankOffers(
    offers.map((o) => ({
      offeredFare: Number(o.offeredFare),
      ratingAvg: o.rider.ratingAvg ?? 0,
      ratingCount: o.rider.ratingCount,
      etaMinutes: o.etaMinutes,
      preferred: o.preferred,
    })),
    MERCHANT_OFFER_WEIGHTS,
  ).map((r) => offers[r.index]!);
  return [...ranked.filter((o) => !o.ownMember), ...ranked.filter((o) => o.ownMember)];
}

/** A booking a rider cancelled has been re-sent by Send as a new one: follow that instead. */
export function supersededBy(b: Pick<MerchantBookingResponse, "rebroadcastedToId">): string | null {
  return b.rebroadcastedToId;
}

/* ── The delivery code ──────────────────────────────────────────────────────────────────────── */

/**
 * The message the booker sends the buyer from their own WhatsApp: who is coming and the code to give
 * them. Plain text, so it reads the same in WhatsApp, an SMS or read out loud.
 */
export function codeMessage(input: { businessName: string; riderName: string | null; bikeReg: string | null; code: string }): string {
  const rider = input.riderName ? `${input.riderName}${input.bikeReg ? ` (${input.bikeReg})` : ""}` : "A LyniaGo rider";
  return `Hi, it's ${input.businessName}. ${rider} is bringing your order. When it arrives, give the rider this code: ${input.code}`;
}

/** `wa.me` wants the number in international digits only. */
export function whatsappLink(phone: string, text: string): string | null {
  const e164 = normalizePhone(phone);
  if (!e164) return null;
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}`;
}

const CODE_KEY = "lynia_booking_code:";

/** The browser that picked keeps the code for that booking (it's shown once; only its hash is stored). */
export function rememberCode(bookingId: string, code: string): void {
  try {
    window.sessionStorage.setItem(CODE_KEY + bookingId, code);
  } catch {
    // Storage blocked: the code stays on screen for this visit, and "Send a new code" covers the rest.
  }
}

export function recallCode(bookingId: string): string | null {
  try {
    return window.sessionStorage.getItem(CODE_KEY + bookingId);
  } catch {
    return null;
  }
}

/* ── The booking form ───────────────────────────────────────────────────────────────────────── */

export interface BookingForm {
  point: LatLng;
  /** False until the booker placed the pin (a read link, a drag, the arrow keys). */
  pinConfirmed: boolean;
  landmark: string;
  buyerPhone: string;
  what: string;
  value: string;
  fare: string;
  note: string;
  accepted: boolean;
}

export type BookingField = "point" | "landmark" | "buyerPhone" | "what" | "value" | "fare" | "accepted";
export type BookingErrors = Partial<Record<BookingField, string>>;

/** Send's suggested fare for the trip ($1.50 + $0.60/km, straight line), as the form's starting fare. */
export function suggestedFare(pickup: LatLng, dropoff: LatLng): number {
  return quoteFare(pickup, dropoff).suggestedFare;
}

export function validateBooking(form: BookingForm): BookingErrors {
  const errors: BookingErrors = {};
  if (!form.pinConfirmed) errors.point = "Paste the location the buyer sent, or drag the map until the pin is on their door.";
  else if (!insideServiceArea(form.point)) errors.point = "That's outside the area LyniaGo covers for now.";
  if (!form.landmark.trim()) errors.landmark = "Tell the rider what to look for.";
  else if (form.landmark.trim().length > 160) errors.landmark = "Keep it under 160 letters.";
  if (!normalizePhone(form.buyerPhone.trim()) || form.buyerPhone.trim().length > 20) errors.buyerPhone = "Enter the buyer's phone, like 0771234567.";
  if (!form.what.trim()) errors.what = "Say what's going.";
  else if (form.what.trim().length > 140) errors.what = "Keep it under 140 letters.";
  const value = parseAmountInput(form.value);
  if (value === null) errors.value = "Enter what it's worth in dollars, like 45.";
  else if (value > DECLARED_VALUE_CAP) errors.value = VALUE_CAP_MESSAGE;
  if (parseAmountInput(form.fare) === null) errors.fare = "Enter the fare in dollars, like 3.50.";
  if (!form.accepted) errors.accepted = "Tick the box to accept how LyniaGo works.";
  return errors;
}

/** The `POST /merchant/bookings` body. Only call once `validateBooking` passes. */
export function toCreateRequest(form: BookingForm, idempotencyKey: string): CreateMerchantBookingRequest {
  const dropoff: Waypoint = {
    point: form.point,
    landmark: form.landmark.trim(),
    contactPhone: normalizePhone(form.buyerPhone.trim()) ?? form.buyerPhone.trim(),
  };
  return {
    dropoff,
    items: [{ description: form.what.trim(), quantity: 1 }],
    declaredValue: parseAmountInput(form.value) ?? 0,
    proposedFare: parseAmountInput(form.fare) ?? 0,
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
    disclaimerVersion: SEND_DISCLAIMER_VERSION,
    idempotencyKey,
  };
}

/** A fresh idempotency key per form attempt (a double tap or a retried request books once). */
export function newIdempotencyKey(): string {
  return randomUuid();
}
