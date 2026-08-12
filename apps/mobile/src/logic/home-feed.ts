// Pure content-selection helpers for the launcher home screen (plan §5 Lane A2: LiveOrderCard /
// "Send again" rail / "Restaurants near you" rail) — no React, unit-testable in isolation, mirrors
// order-labels.ts / order-tracking.ts.
import type { MerchantHours } from "@lynia/shared";
import { isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import type { OrderHistoryRow } from "../api/orders";
import { liveEta } from "./eta";
import { formatMoney } from "./money";

// Mirrors the customer-view step order in `src/ui/index.tsx`'s Stepper (STEP_ORDER) — the same
// 7-step Express-tracker grammar the home LiveOrderCard's progress strip echoes. Kept as an
// independent copy rather than importing from `ui` (logic stays framework/layer-free, matching
// every other file in this directory — `ui/index.tsx` itself already keeps its own private copies
// of the same status lists for the same reason).
const LIVE_ORDER_STEPS = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
] as const;

export const LIVE_ORDER_STEP_COUNT = LIVE_ORDER_STEPS.length;

/** 0-based tracker index for a live order's current status; -1 pre-assignment (still in the
 *  auction) — the home LiveOrderCard's progress strip then correctly renders every segment unlit. */
export function liveOrderStepIndex(status: string): number {
  return LIVE_ORDER_STEPS.indexOf(status as (typeof LIVE_ORDER_STEPS)[number]);
}

// The food customer's 7-step grammar — a private mirror of `ui/index.tsx`'s FOOD_CUSTOMER_STEPS /
// foodCustomerStepIndex (same reason LIVE_ORDER_STEPS above mirrors STEP_ORDER: logic stays
// framework/layer-free). The two leading steps resolve from the kitchen `merchantPhase`; the rest
// from the shared dispatch statuses.
const FOOD_LIVE_ORDER_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "accepted", label: "Restaurant accepted" },
  { key: "assigned", label: "Rider secured" },
  { key: "confirmed", label: "Rider at the restaurant" },
  { key: "picked_up", label: "Picked up" },
  { key: "en_route_dropoff", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

function foodLiveStepIndex(status: string, merchantPhase?: string | null): number {
  if (status === "delivered" || status === "completed") return 6;
  if (status === "en_route_dropoff") return 5;
  if (status === "picked_up") return 4;
  if (status === "confirmed" || status === "en_route_pickup") return 3;
  if (status === "assigned") return 2;
  if (merchantPhase === "preparing" || merchantPhase === "ready_for_pickup") return 1;
  return 0;
}

/** The slice of OrderSnapshot the home card model reads — structural, so fixtures/tests stay small. */
export interface LiveOrderLike {
  id: string;
  status: string;
  orderType?: "parcel" | "merchant" | null;
  merchantName?: string | null;
  merchantPhase?: string | null;
  merchantPaymentMethod?: "cash" | "wallet" | null;
  pickup: { point: { lat: number; lng: number }; landmark?: string | null };
  dropoff: { point: { lat: number; lng: number }; landmark?: string | null };
  rider?: { currentLat: number | null; currentLng: number | null } | null;
  agreedFare: string | null;
  proposedFare: string;
}

export interface LiveOrderCardModel {
  id: string;
  icon: "utensils" | "bike";
  title: string;
  meta: string;
  step: number;
  steps: number;
  /** expo-router path the card opens — the food live tracker for a food job, the parcel tracker otherwise. */
  route: string;
}

/**
 * Home LiveOrderCard model for one running job — per-service copy per the design's
 * `home.prompt.md` ("Title = who/where + minutes; meta = payment + total") and RC.home's two drawn
 * cards: food `"Sadza Republic · 6 min away" / "Cash at the door · $15.50"`, parcel
 * `"Parcel to Msasa · rider 4 min away" / "Delivery code 4192 · $3.36"`.
 *
 * The minutes come from the same `liveEta` the tracking screen shows (rough haversine estimate —
 * that's why the design says "6 min away", not an arrival clock). A food title only carries minutes
 * while the rider is heading to the CUSTOMER (`to_dropoff`): pre-pickup the rider's minutes are to
 * the kitchen, which would read as a doorstep promise it isn't — those states fall back to the food
 * step label ("Rider secured", "Order placed"). A parcel shows minutes on both legs: the sender is
 * at the pickup, so "rider 4 min away" is honest whichever way the rider is heading.
 */
export function liveOrderCardModel(order: LiveOrderLike, statusLabel: string, deliveryCode: string | null): LiveOrderCardModel {
  const money = formatMoney(order.agreedFare ?? order.proposedFare);
  const riderPoint =
    order.rider && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;
  const eta = liveEta({ status: order.status, rider: riderPoint, pickup: order.pickup.point, dropoff: order.dropoff.point });

  if (order.orderType === "merchant") {
    const step = foodLiveStepIndex(order.status, order.merchantPhase);
    const suffix = eta && eta.phase === "to_dropoff" ? `${eta.minutes} min away` : FOOD_LIVE_ORDER_STEPS[step]!.label;
    const payment = order.merchantPaymentMethod === "cash" ? "Cash at the door" : order.merchantPaymentMethod === "wallet" ? "Paid" : null;
    return {
      id: order.id,
      icon: "utensils",
      title: `${order.merchantName || "Restaurant order"} · ${suffix}`,
      meta: payment ? `${payment} · ${money}` : money,
      step,
      steps: FOOD_LIVE_ORDER_STEPS.length,
      route: `/food/order/${order.id}`,
    };
  }

  const suffix = eta ? `rider ${eta.minutes} min away` : statusLabel;
  return {
    id: order.id,
    icon: "bike",
    title: `Parcel to ${order.dropoff.landmark || "drop-off"} · ${suffix}`,
    meta: deliveryCode ? `Delivery code ${deliveryCode} · ${money}` : money,
    step: liveOrderStepIndex(order.status),
    steps: LIVE_ORDER_STEP_COUNT,
    route: `/order/${order.id}`,
  };
}

export interface ReorderRailItem {
  id: string;
  name: string;
  price: string;
}

/**
 * "Send again" rail items (plan §5 A2) — the customer's own most-recently sent parcels, newest
 * first (the history API already orders by `createdAt desc`), capped so the rail is a bounded
 * shelf rather than the customer's whole history. Hidden by the caller while a live order shows
 * (`home.prompt.md`: "Hidden while a live order shows — the card takes its slot").
 */
export function reorderRailItems(rows: OrderHistoryRow[], limit = 10): ReorderRailItem[] {
  return rows
    .filter((r) => r.role === "customer")
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      name: r.dropoff.landmark || r.itemDesc || "Parcel",
      price: formatMoney(r.agreedFare ?? r.proposedFare),
    }));
}

export interface RestaurantCardStatus {
  closed: boolean;
  note: string | null;
}

/** Open/closed + the closed-card status pill (plan §5 A2 "Restaurants near you" rail), derived
 *  client-side exactly like the D1 browse list — the server never ships a staleable precomputed
 *  boolean (see `restaurant-hours.ts`). */
export function restaurantCardStatus(hours: MerchantHours | null, now: Date): RestaurantCardStatus {
  const open = isMerchantOpenNow(hours, now);
  return { closed: !open, note: open ? null : nextOpenDescription(hours, now) };
}
