import type { MerchantBookingOffer, MerchantBookingResponse } from "@lynia/shared";
import { isFinding, isLiveBooking, orderOffers, STATE_LABEL } from "./booking";
import type { Step } from "./orders-view";

/**
 * D1's "Riders you booked" trackers and the D5 stepper (packages/design/handoff/merchant-mobile, ledger
 * D-48), kept pure so the rules are unit-tested.
 */

/** "Blessing Moyo" → "Blessing M." — how the handoff names a rider everywhere. */
export function shortName(name: string | null | undefined): string | null {
  const [first, last] = (name ?? "").trim().split(/\s+/);
  if (!first) return null;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

/** Bookings worth a tracker: live ones, and ones that ended in the last day (so a delivery can be
 *  opened for its result). A booking Send re-sent after its rider cancelled lives on as the new one. */
export function trackedBookings(bookings: readonly MerchantBookingResponse[], now: number): MerchantBookingResponse[] {
  const day = 24 * 60 * 60 * 1000;
  return bookings.filter((b) => !b.rebroadcastedToId && (isLiveBooking(b.state) || now - new Date(b.createdAt).getTime() < day));
}

export interface Tracker {
  icon: "timer" | "bike" | "banknote" | "circle-check" | "ban";
  title: string;
  /** Finding: "Pick a rider" / "Waiting for offers"; ended: its state. Coming / picked up draw a bar instead. */
  sub: string | null;
  /** Filled segments of the 5-step bar (Booked · Rider secured · Picked up · On the way · Delivered). */
  progress: number | null;
}

export function tracker(b: MerchantBookingResponse): Tracker {
  const rider = shortName(b.rider?.name);
  if (isFinding(b.state)) {
    const offers = b.offerCount > 0 ? ` · ${b.offerCount} offer${b.offerCount === 1 ? "" : "s"}` : "";
    return { icon: "timer", title: `${b.itemsSummary}${offers}`, sub: b.offerCount > 0 ? "Pick a rider" : "Waiting for offers", progress: null };
  }
  const title = rider ? `${b.itemsSummary} · ${rider}` : b.itemsSummary;
  if (b.state === "coming") return { icon: "bike", title, sub: null, progress: 2 };
  if (b.state === "picked_up") return { icon: "bike", title, sub: null, progress: 4 };
  if (b.state === "delivered" && b.cashOnDelivery?.status === "due") {
    // Still live for the shop: its cash is on the way back (D-48 PR 4b).
    return { icon: "banknote", title, sub: `Delivered · cash back $${Number(b.cashOnDelivery.amount).toFixed(2)}`, progress: null };
  }
  if (b.state === "delivered") return { icon: "circle-check", title, sub: STATE_LABEL.delivered, progress: null };
  return { icon: "ban", title, sub: STATE_LABEL[b.state], progress: null };
}

/* ── D4 offers ─────────────────────────────────────────────────────────────────────────────── */

export type OfferSort = "best" | "cheapest" | "closest";

/** D4's sort chips. Best match is the usual ranking with the business's own riders on top (as drawn);
 *  a teammate's offer, which can't be picked, always sits last. */
export function sortOffers(offers: readonly MerchantBookingOffer[], sort: OfferSort): MerchantBookingOffer[] {
  const ranked = orderOffers(offers);
  const pickable = ranked.filter((o) => !o.ownMember);
  const team = ranked.filter((o) => o.ownMember);
  const sorted =
    sort === "cheapest"
      ? [...pickable].sort((a, b) => Number(a.offeredFare) - Number(b.offeredFare))
      : sort === "closest"
        ? [...pickable].sort((a, b) => a.etaMinutes - b.etaMinutes)
        : [...pickable.filter((o) => o.preferred), ...pickable.filter((o) => !o.preferred)];
  return [...sorted, ...team];
}

/** "$0.40 less" / "$0.80 more" than the fare the business offered; nothing when it's the same. */
export function fareDelta(offered: string, proposed: string): { text: string; less: boolean } | null {
  const d = Math.round((Number(offered) - Number(proposed)) * 100) / 100;
  if (!Number.isFinite(d) || d === 0) return null;
  return { text: `$${Math.abs(d).toFixed(2)} ${d < 0 ? "less" : "more"}`, less: d < 0 };
}

/* ── D5 stepper ────────────────────────────────────────────────────────────────────────────── */

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const BOOKING_STEPS = ["Booked", "Rider secured", "Rider at your shop", "Picked up", "On the way", "Delivered"] as const;

/** D5's stepper. The API gives no time for the middle steps, so only "Booked" carries one; the current
 *  step says "live". A cash-on-delivery booking has the drawn 7th step, "Cash back to you". */
export function bookingSteps(b: Pick<MerchantBookingResponse, "state" | "createdAt" | "cashOnDelivery">): Step[] {
  const cod = b.cashOnDelivery ?? null;
  const labels = cod ? [...BOOKING_STEPS, "Cash back to you"] : [...BOOKING_STEPS];
  const cashDone = cod?.status === "returned" || cod?.status === "closed";
  const done = b.state === "coming" ? 2 : b.state === "picked_up" ? 4 : b.state === "delivered" ? (cod && !cashDone ? 6 : labels.length) : 1;
  return labels.map((label, i) => ({
    label,
    state: i < done ? "done" : i === done ? "now" : "todo",
    time: i === 0 ? hm(b.createdAt) : i === done ? "live" : "",
  }));
}
