import type { MerchantOrderResponse, MerchantProfileResponse } from "@lynia/shared";
import { dayKeyFor, DAY_KEYS, type PartialMerchantHours } from "./hours";
import { groupQueue, isNoRiderHold, isReadyBucket, needsKitchenConfirm } from "./order-groups";

/**
 * The merchant mobile Orders screens' logic (packages/design/handoff/merchant-mobile B1–B7, ledger
 * D-48), kept pure so every rule is unit-tested: what the Orders home lists where, which screen an
 * order opens on, the tracking stepper, and the header's open/closed line.
 */

/** "#A111" — the first four characters of the id, as the handoff draws them. */
export function orderLabel(o: Pick<MerchantOrderResponse, "id">): string {
  return `#${o.id.slice(0, 4).toUpperCase()}`;
}

export function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

/** "2× Mazondo · 1× Sadza & greens". */
export function itemsLine(o: Pick<MerchantOrderResponse, "items">): string {
  return o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ");
}

export function riderFirstName(o: MerchantOrderResponse): string | null {
  if (!o.rider) return null;
  const last = o.rider.lastName ? ` ${o.rider.lastName.charAt(0)}.` : "";
  return `${o.rider.firstName}${last}`;
}

/** The statuses after the rider has the food (the API's own AFTER_PICKUP set). */
const AFTER_PICKUP = new Set(["picked_up", "en_route_dropoff", "delivered", "completed", "undelivered"]);

export function isAfterPickup(o: Pick<MerchantOrderResponse, "status">): boolean {
  return AFTER_PICKUP.has(o.status);
}

export interface HomeSections {
  /** New: the ringing orders, the auto-accepted ones waiting for the kitchen to confirm, then the ones
   *  waiting on the customer (changes to answer, or a wallet order placed before D-74 to pay for). */
  new: MerchantOrderResponse[];
  cooking: MerchantOrderResponse[];
  /** Ready and waiting for a rider — searching, holding, or a rider coming to the counter. */
  ready: MerchantOrderResponse[];
  /** The rider has the food and the merchant hasn't closed it: on the way, or delivered with cash due. */
  outForDelivery: MerchantOrderResponse[];
}

/** B1: what the Orders home lists under New · Cooking · Ready and "Out for delivery". */
export function homeSections(orders: readonly MerchantOrderResponse[]): HomeSections {
  const g = groupQueue(orders.filter((o) => !isAfterPickup(o)));
  return {
    new: [...g.awaitingAccept, ...g.awaitingKitchenConfirm, ...g.awaitingItemApproval, ...g.awaitingPayment],
    cooking: g.preparing,
    ready: g.ready,
    outForDelivery: orders.filter((o) => isAfterPickup(o) && !o.merchantClosedAt),
  };
}

export type DetailView = "ringing" | "scheduled" | "payment" | "cooking" | "handover" | "tracking" | "delivered" | "closed";

/** Order flow v2 (BRIEF §12): a scheduled order that hasn't rung yet (M7a/M7b). */
export function isScheduledWaiting(o: Pick<MerchantOrderResponse, "scheduledFor" | "scheduleStartedAt">): boolean {
  return !!o.scheduledFor && !o.scheduleStartedAt;
}

/** "12:30–13:00" and "today" / "tomorrow" / "Fri 3 Oct" for a scheduled order's slot (30-minute slots). */
export function slotLabel(scheduledFor: string, now: Date, slotMinutes = 30): { slot: string; day: string } {
  const start = new Date(scheduledFor);
  const end = new Date(start.getTime() + slotMinutes * 60_000);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day =
    dayKey(start) === dayKey(now)
      ? "today"
      : dayKey(start) === dayKey(tomorrow)
        ? "tomorrow"
        : start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return { slot: `${hm(start.toISOString())}–${hm(end.toISOString())}`, day };
}

/** Which screen an order opens on: B3 cooking, B4 handover, B6 tracking or B7 delivered. */
export function detailView(o: MerchantOrderResponse): DetailView {
  if (o.merchantClosedAt || o.status === "cancelled" || o.status === "expired") return "closed";
  // M7b: a scheduled order waits on its ticket until it rings (then it rings like a new one, M1c).
  if (o.merchantPhase === "awaiting_accept" && isScheduledWaiting(o)) return "scheduled";
  // M2: the order waits on the customer's answer — to an accept that asked about a swap, or to a
  // shortened order a merchant screen from before Order flow v2 sent. Either way it is M2's wait.
  if (o.merchantPhase === "awaiting_item_approval") return "cooking";
  // An auto-accepted order the kitchen hasn't confirmed rings too (M1a), on the Orders home.
  if (o.merchantPhase === "awaiting_accept" || needsKitchenConfirm(o)) return "ringing";
  // A wallet order placed before D-74 (cash only) still waits for its payment before cooking.
  if (o.merchantPhase === "awaiting_payment") return "payment";
  if (o.merchantPhase === "preparing") return "cooking";
  if (isReadyBucket(o)) return "handover";
  if (o.status === "delivered" || o.status === "completed" || o.status === "undelivered") {
    return o.debtStatus === "open" ? "delivered" : "closed";
  }
  if (isAfterPickup(o)) return "tracking";
  return "closed";
}

/** B1's second line for a row on the home. */
export function rowSub(o: MerchantOrderResponse): string {
  const rider = riderFirstName(o);
  if (o.merchantPhase === "awaiting_item_approval") return "Waiting for the customer to approve";
  if (o.merchantPhase === "awaiting_payment") return "Waiting for payment";
  if (needsKitchenConfirm(o)) return "Waiting for you to confirm";
  if (o.merchantPhase === "preparing") {
    // The title already carries the items; the sub says when it'll be ready.
    const ready = o.prepStartedAt && o.prepMinutes ? hm(new Date(new Date(o.prepStartedAt).getTime() + o.prepMinutes * 60_000).toISOString()) : "";
    return ready ? `Cooking · ready by ${ready}` : "Cooking";
  }
  if (isReadyBucket(o)) {
    if (isNoRiderHold(o)) return "No rider yet · decide what to do";
    if (!rider) return "Finding a rider";
    // No "arrived" signal exists before the code is typed, so the rider is only ever on the way.
    return `${rider} coming to your counter`;
  }
  const cash = o.debtStatus === "open" && o.debtAmount ? ` · cash back ${money(o.debtAmount)}` : "";
  if (o.status === "delivered" || o.status === "completed") return `Delivered${cash}`;
  if (o.status === "undelivered") return `Not delivered${cash}`;
  return `On the way${cash}`;
}

/** "HH:MM" the items were last changed, or null when they never were. */
export function itemsEditedLabel(o: Pick<MerchantOrderResponse, "itemsEditedAt">): string | null {
  return o.itemsEditedAt ? `Items changed ${hm(o.itemsEditedAt)}` : null;
}

/** A row of the vertical stepper (the shop's booking tracking, D5/D7). */
export interface Step {
  label: string;
  state: "done" | "now" | "todo";
  /** "12:04", or "live" on the current step. */
  time: string;
}

/** "12:36" (local time) for an ISO instant; "" for none. */
export function hm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Order flow v2 (ledger D-59, README "Merchant track"): the merchant sees the customer's own four-step
 * track — Confirmed → Cooking/Packing → On the way → Delivered — instead of B6's eight-step stepper.
 * Returns the current step, 0–3, or 4 once delivered (every step done). Rider found, at the counter and
 * collected are content inside steps 2–3, not steps of their own (BRIEF §4).
 */
export function trackStep(o: MerchantOrderResponse): number {
  if (o.status === "delivered" || o.status === "completed") return 4;
  if (isAfterPickup(o)) return 2;
  if (o.merchantPhase === "awaiting_accept" || needsKitchenConfirm(o)) return 0;
  return 1;
}

export interface CashBackRow {
  /** "after" until the order is delivered, "due" while the rider owes it, "done" once settled. */
  state: "after" | "due" | "done";
  /** "13:17" when the cash is due back, or null. */
  dueAt: string | null;
}

/**
 * The merchant-only "Cash back to you" row under the track (README "Merchant track", M5/M6a): surface
 * until delivery, highlight wash once the cash is due. Only an order whose rider brings the food money
 * back (cash, collect-and-return) has one.
 */
export function cashBackRow(o: MerchantOrderResponse): CashBackRow | null {
  if (o.paymentMethod !== "cash" || o.merchantCashRule !== "collect_and_return") return null;
  const settled = o.debtStatus === "settled_cash" || o.debtStatus === "settled_goods" || o.merchantClosedAt != null;
  if (settled) return { state: "done", dueAt: null };
  const delivered = o.status === "delivered" || o.status === "completed";
  return delivered ? { state: "due", dueAt: o.cashDueAt ? hm(o.cashDueAt) : null } : { state: "after", dueAt: null };
}

/** BRIEF §16: every code is shown 3+3 — "731 604". A legacy four-digit code shows as it is. */
export function groupCode(code: string): string[] {
  return code.length === 6 ? [code.slice(0, 3), code.slice(3)] : [code];
}

/** When the next opening window starts, "HH:MM", looking a week ahead from `from`. */
export function nextOpenTime(hours: PartialMerchantHours | null, from: Date): string | null {
  if (!hours) return null;
  const nowHm = `${String(from.getHours()).padStart(2, "0")}:${String(from.getMinutes()).padStart(2, "0")}`;
  const today = hours[dayKeyFor(from)];
  if (today && nowHm < today.open) return today.open;
  for (let step = 1; step <= 7; step++) {
    const w = hours[DAY_KEYS[(DAY_KEYS.indexOf(dayKeyFor(from)) + step) % 7]!];
    if (w) return w.open;
  }
  return null;
}

export interface OpenStatus {
  /** What the switch shows. */
  open: boolean;
  /** Closed by hand from the switch (B5), as opposed to outside hours. */
  closedByHand: boolean;
  /** "● Open until 22:00" / "● Closed · opens 08:00". */
  label: string;
}

/** B1/B5's header line and switch. */
export function openStatus(business: Pick<MerchantProfileResponse, "hours" | "closedUntil"> | null, now: Date): OpenStatus {
  const hours = (business?.hours ?? null) as PartialMerchantHours | null;
  const closedByHand = !!business?.closedUntil && new Date(business.closedUntil).getTime() > now.getTime();
  const today = hours?.[dayKeyFor(now)];
  const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const inHours = !hours || (!!today && nowHm >= today.open && nowHm < today.close);
  if (inHours && !closedByHand) {
    return { open: true, closedByHand: false, label: today ? `Open until ${today.close}` : "Open" };
  }
  const from = closedByHand ? new Date(business!.closedUntil!) : now;
  const next = nextOpenTime(hours, from) ?? (closedByHand && !hours ? hm(business!.closedUntil) : null);
  return { open: false, closedByHand, label: next ? `Closed · opens ${next}` : "Closed" };
}
