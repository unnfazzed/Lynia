import type { MerchantOrderResponse, MerchantProfileResponse } from "@lynia/shared";
import { dayKeyFor, DAY_KEYS, type PartialMerchantHours } from "./hours";
import { groupQueue, isNoRiderHold, isReadyBucket } from "./order-groups";

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
  /** New: the ringing orders, then the older undecided lanes (item approval, legacy wallet payment). */
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
    new: [...g.awaitingAccept, ...g.awaitingItemApproval, ...g.awaitingPayment],
    cooking: g.preparing,
    ready: g.ready,
    outForDelivery: orders.filter((o) => isAfterPickup(o) && !o.merchantClosedAt),
  };
}

export type DetailView = "ringing" | "legacy" | "cooking" | "handover" | "tracking" | "delivered" | "closed";

/** Which screen an order opens on: B3 cooking, B4 handover, B6 tracking or B7 delivered. */
export function detailView(o: MerchantOrderResponse): DetailView {
  if (o.merchantClosedAt || o.status === "cancelled" || o.status === "expired") return "closed";
  if (o.merchantPhase === "awaiting_accept") return "ringing";
  if (o.merchantPhase === "awaiting_item_approval" || o.merchantPhase === "awaiting_payment") return "legacy";
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

export interface Step {
  label: string;
  state: "done" | "now" | "todo";
  /** "12:04", or "live" on the current step. */
  time: string;
}

function hm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * B6's stepper: the seven delivery steps in the customer app's restaurant grammar, told from the
 * merchant's side, plus the merchant-only "Cash back to you". Times come from the order's timeline.
 */
export function steps(o: MerchantOrderResponse): Step[] {
  const at = (status: string) => o.timeline?.find((e) => e.status === status)?.at ?? null;
  const reached: [string, boolean, string | null][] = [
    ["Order placed", true, o.createdAt ?? at("requested")],
    ["You accepted", o.prepStartedAt != null || o.merchantPhase !== "awaiting_accept", o.prepStartedAt],
    ["Rider secured", o.riderId != null, at("assigned")],
    // Reached when the rider types the pickup code at the counter — the picked-up moment.
    ["Rider at your counter", isAfterPickup(o), at("picked_up")],
    ["Picked up", isAfterPickup(o), at("picked_up")],
    ["On the way", isAfterPickup(o) && o.status !== "picked_up", at("en_route_dropoff")],
    ["Delivered", o.status === "delivered" || o.status === "completed", o.deliveredAt ?? at("delivered")],
    ["Cash back to you", o.debtStatus === "settled_cash" || o.debtStatus === "settled_goods" || o.merchantClosedAt != null, o.debtSettledAt ?? o.merchantClosedAt ?? null],
  ];
  const firstTodo = reached.findIndex(([, done]) => !done);
  return reached.map(([label, done, time], i) => ({
    label,
    state: done ? "done" : i === firstTodo ? "now" : "todo",
    time: done ? hm(time) : i === firstTodo ? "live" : "",
  }));
}

/** When the next opening window starts, "HH:MM", looking a week ahead from `from`. */
function nextOpenTime(hours: PartialMerchantHours | null, from: Date): string | null {
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
