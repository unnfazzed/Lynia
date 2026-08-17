// Pure content-selection helpers for the launcher home screen (plan §5 Lane A2: LiveOrderCard /
// "Restaurants near you" rail) — no React, unit-testable in isolation, mirrors order-labels.ts /
// order-tracking.ts. (The "Send again" rail was removed 2026-08-12 per the design AppHome contract:
// "no order-again / send-again rails" — owner decision resolving home.prompt.md's conflicting spec.)
import type { LatLng, MerchantHours, RestaurantListItem } from "@lynia/shared";
import { deliveryFeeForDistance, haversineKm, isMerchantOpenNow, nextOpenDescription } from "@lynia/shared";
import { ETA_SPEED_KMH, liveEta, ROAD_WINDING_FACTOR } from "./eta";
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

/**
 * The 8c tracker PILL model for one running job (`packages/design/handoff/home-8c` §3): one text
 * line, a 7-segment progress strip and a gold ETA chip. It supersedes `liveOrderCardModel` on the
 * home screen — 8c draws no second (meta) line, so the payment/delivery-code string that model
 * builds has nowhere to go and is not rendered. `liveOrderCardModel` itself stays: nothing else has
 * moved off it yet, and the two are tested independently.
 */
export interface LiveOrderPillModel {
  id: string;
  /** Always the rider's bike — the mock draws one glyph in the accent circle, for both services. */
  icon: "bike";
  /** The whole drawn line, "‹who› · ‹phrase›". */
  title: string;
  step: number;
  steps: number;
  /** The gold chip's minutes, or null when there is no honest estimate (no rider fix / no live leg). */
  etaMinutes: number | null;
  route: string;
}

/**
 * "Tendai M." — a rider's first name plus their last initial, the form the mock draws. Returns null
 * for an empty first name so the caller falls back to service copy rather than rendering a stray dot.
 */
export function riderShortName(firstName?: string | null, lastName?: string | null): string | null {
  const first = (firstName ?? "").trim();
  if (!first) return null;
  const initial = (lastName ?? "").trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

/**
 * The phrase after the separator. The mock draws exactly one state — the rider heading to the
 * customer, "on the way" — so that string is used verbatim for that state, and every other state
 * reuses the app's ALREADY-SHIPPED status vocabulary rather than inventing new copy (CLAUDE.md:
 * mock copy verbatim; the live states are derived inside the drawn structure, not improvised
 * alongside it).
 */
function livePhrase(order: LiveOrderLike, statusLabel: string, foodStep: number): string {
  if (order.status === "picked_up" || order.status === "en_route_dropoff") return "on the way";
  if (order.orderType === "merchant") return FOOD_LIVE_ORDER_STEPS[foodStep]!.label;
  return statusLabel;
}

/**
 * One running job → the pill.
 *
 * `riderName` comes from the on-device rider-identity cache (`logic/rider-identity.ts`), which is
 * the only place the app knows a rider's name: the active-orders snapshot carries the rider's
 * `profileId` and GPS but no name. It is a single slot keyed by one order, so at most one live job
 * can be named — every other job falls back to service copy ("Sadza Republic · on the way", "Your
 * parcel · on the way"), which is honest rather than blank. When the API grows a rider name on the
 * active-orders response, pass it here and nothing else changes.
 */
export function liveOrderPillModel(order: LiveOrderLike, statusLabel: string, riderName: string | null): LiveOrderPillModel {
  const riderPoint =
    order.rider && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;
  const eta = liveEta({ status: order.status, rider: riderPoint, pickup: order.pickup.point, dropoff: order.dropoff.point });
  const food = order.orderType === "merchant";
  const foodStep = foodLiveStepIndex(order.status, order.merchantPhase);
  const who = riderName ?? (food ? order.merchantName || "Your order" : "Your parcel");

  return {
    id: order.id,
    icon: "bike",
    title: `${who} · ${livePhrase(order, statusLabel, foodStep)}`,
    step: food ? foodStep : liveOrderStepIndex(order.status),
    steps: food ? FOOD_LIVE_ORDER_STEPS.length : LIVE_ORDER_STEP_COUNT,
    etaMinutes: eta?.minutes ?? null,
    route: food ? `/food/order/${order.id}` : `/order/${order.id}`,
  };
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

// ---------------------------------------------------------------------------
// "Popular near you" (home 8c §4)
// ---------------------------------------------------------------------------

/** The mock draws a 2×2 grid; "See all →" owns everything past it. */
export const POPULAR_LIMIT = 4;

/**
 * Kitchen prep time for a merchant that has not set one. The mock's cards all carry an ETA, and a
 * missing prep baseline is a merchant-onboarding gap rather than "unknowable" — the delivery leg,
 * which is the part that varies by customer, is still computed from real coordinates.
 */
export const DEFAULT_PREP_MINUTES = 20;

export interface PopularVenue {
  id: string;
  name: string;
  photoUrl: string | null;
  /** One decimal ("4.9"), or null for a shop nobody has rated yet — never an invented "0" or "new". */
  rating: string | null;
  /** Prep + the delivery leg from the shop to the customer, or null when either point is unknown. */
  etaMinutes: number | null;
  /** Formatted ("$1.50"), or null when the distance cannot be computed. */
  deliveryFee: string | null;
  closed: boolean;
  /** Straight-line km to the customer; null when unknown. Ordering key, not drawn. */
  distanceKm: number | null;
}

/**
 * The home's venue grid: the nearest OPEN venues first, then the rest, capped at `POPULAR_LIMIT`.
 *
 * Everything the card draws beyond the name and the photo is derived here from the customer read
 * API plus the customer's own detected location — which is exactly what 8c's header made available:
 * before it, the app had no customer coordinate, so ETA and delivery fee could not be computed at
 * all and the pre-8c card honestly omitted them. The fee uses the SAME
 * `haversineKm → deliveryFeeForDistance` path the server prices an order with (and that
 * `logic/food-checkout.ts` already estimates checkout with), so the number on the card and the
 * number at checkout come from one formula rather than two.
 *
 * Anything that cannot be derived stays null and its element is simply not drawn — a shop with no
 * ratings shows no star, a customer with no location fix sees no ETA or fee. Never a fabricated
 * figure, never a placeholder.
 */
export function popularNearYou(
  restaurants: readonly RestaurantListItem[],
  now: Date,
  customer: LatLng | null,
  limit: number = POPULAR_LIMIT,
): PopularVenue[] {
  const venues = restaurants.map((r) => {
    const distanceKm = customer && r.location ? haversineKm(r.location, customer) : null;
    const roadKm = distanceKm == null ? null : distanceKm * ROAD_WINDING_FACTOR;
    const prep = r.prepBaselineMinutes ?? DEFAULT_PREP_MINUTES;
    return {
      id: r.id,
      name: r.name,
      photoUrl: r.coverPhotoUrl,
      rating: r.ratingCount > 0 && r.ratingAvg != null ? r.ratingAvg.toFixed(1) : null,
      etaMinutes: roadKm == null ? null : prep + Math.max(1, Math.ceil((roadKm / ETA_SPEED_KMH) * 60)),
      deliveryFee: distanceKm == null ? null : formatMoney(deliveryFeeForDistance(distanceKm)),
      closed: !isMerchantOpenNow(r.hours, now),
      distanceKm,
    };
  });

  // Open before closed, then nearest first. A venue with no distance (no merchant location, or no
  // customer fix) keeps its feed order behind the ones that can be ranked — `sort` is stable in
  // every engine the app runs on, so equal keys never shuffle between renders.
  return venues
    .slice()
    .sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      if (a.distanceKm == null || b.distanceKm == null) return (a.distanceKm == null ? 1 : 0) - (b.distanceKm == null ? 1 : 0);
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, limit);
}
