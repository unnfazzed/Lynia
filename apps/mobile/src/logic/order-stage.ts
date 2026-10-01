import { haversineKm } from "@lynia/shared";

/**
 * The After Send order screen (ledger D-53) is ONE screen whose title, map mode, sheet content and CTA
 * follow the order's stage. This is the pure status → stage mapping (the handoff's `resolveStage`), kept
 * framework-free so every status / flag combination is unit-tested off-device.
 */
export type OrderStage =
  | "finding"
  | "noRiders"
  | "offers"
  | "toPickup"
  | "toDropoff"
  | "handoff"
  | "retryNoMatch"
  | "retryRiderCancelled"
  | "reopened"
  | "delivered"
  | "completed"
  | "undelivered"
  | "cancelled";

export interface StageInput {
  status: string;
  /** Pending offers on the open auction. */
  offerCount: number;
  /** Online riders near the pickup while open (null = unknown, never "none"). */
  ridersNearby: number | null | undefined;
  cancelledBy: string | null | undefined;
  /** The order's event timeline — a `picked_up` event means the parcel was collected. */
  events: readonly { status: string; createdAt: string }[];
  rider: { lat: number; lng: number; at: string | null } | null;
  dropoff: { lat: number; lng: number };
  /** App-wide reachability (false = offline). */
  online: boolean;
  nowMs: number;
  /**
   * This auction is the re-broadcast the server opened when the customer's rider cancelled before
   * pickup (v2 state 13): while it has no offers it is a finding state with a reason header.
   */
  reopened?: boolean;
}

export interface StageResult {
  stage: OrderStage;
  /** No rider GPS fix for {@link GPS_PAUSED_MS} on a live trip (state 9). */
  gpsPaused: boolean;
  /** The device is offline (state 19). */
  offline: boolean;
  /** Matched but no GPS fix has arrived yet, and it's not yet "paused" (v2 2.12). */
  noFix: boolean;
}

/** No fix for 60 s on a live trip → the paused marker and the "call them" notice. */
export const GPS_PAUSED_MS = 60_000;
/** En route to the drop-off and within ~150 m of it → "Arriving now" (the hand-off stage). */
export const ARRIVING_M = 150;

const LIVE: ReadonlySet<OrderStage> = new Set(["toPickup", "toDropoff", "handoff"]);

export function isLiveStage(stage: OrderStage): boolean {
  return LIVE.has(stage);
}

function baseStage(i: StageInput): OrderStage {
  switch (i.status) {
    case "open_for_offers":
      if (i.offerCount > 0) return "offers";
      if (i.reopened) return "reopened";
      // `null` is "unknown" — keep the calm finding state rather than claim nobody is online.
      return i.ridersNearby === 0 ? "noRiders" : "finding";
    case "assigned":
    case "confirmed":
    case "en_route_pickup":
      return "toPickup";
    case "picked_up":
      return "toDropoff";
    case "en_route_dropoff": {
      if (i.rider) {
        const m = haversineKm({ lat: i.rider.lat, lng: i.rider.lng }, i.dropoff) * 1000;
        if (m <= ARRIVING_M) return "handoff";
      }
      return "toDropoff";
    }
    case "delivered":
      return "delivered";
    case "completed":
      return "completed";
    case "undelivered":
      return "undelivered";
    case "expired":
      return "retryNoMatch";
    case "cancelled": {
      // A rider who bails BEFORE collecting puts the customer on the one-tap retry (state 13); after
      // pickup (the parcel is on the bike) it's an ordinary "cancelled" terminal (18b).
      const collected = i.events.some((e) => e.status === "picked_up");
      return i.cancelledBy === "rider" && !collected ? "retryRiderCancelled" : "cancelled";
    }
    default:
      // Unknown/new status: the quietest honest screen.
      return "cancelled";
  }
}

export function resolveStage(i: StageInput): StageResult {
  const stage = baseStage(i);
  let gpsPaused = false;
  if (LIVE.has(stage)) {
    // Measure from the last fix, or — before the first fix — from the assignment.
    const since = i.rider?.at ?? i.events.find((e) => e.status === "assigned")?.createdAt ?? null;
    const t = since ? Date.parse(since) : NaN;
    gpsPaused = Number.isFinite(t) && i.nowMs - t > GPS_PAUSED_MS;
  }
  const noFix = LIVE.has(stage) && i.rider == null && !gpsPaused;
  return { stage, gpsPaused, offline: !i.online, noFix };
}

/** The header title per stage (README "Header" table) — keys into the order screen's copy object. */
const TITLE_KEY = {
  finding: "tFinding",
  noRiders: "tNoOnline",
  offers: "tChoose",
  toPickup: "tOnWay",
  toDropoff: "tToDrop",
  handoff: "tHandoff",
  retryNoMatch: "tNoRider",
  retryRiderCancelled: "tRiderCx",
  reopened: "tRiderCx",
  delivered: "tDelivered",
  completed: "tComplete",
  undelivered: "tNotDel",
  cancelled: "tCancelled",
} as const satisfies Record<OrderStage, string>;

export function stageTitleKey(stage: OrderStage): (typeof TITLE_KEY)[OrderStage] {
  return TITLE_KEY[stage];
}

/**
 * The map's share of the space under the header at peek (README "Sheet" table) — the sheet's top sits
 * at `header + (H − header) × share`. A cancel panel keeps the tracking share.
 */
export function stageMapShare(stage: OrderStage): number {
  switch (stage) {
    case "finding":
    case "noRiders":
      return 0.34;
    case "toPickup":
    case "toDropoff":
    case "cancelled":
    case "reopened":
      return 0.3;
    case "retryNoMatch":
    case "retryRiderCancelled":
      return 0.26;
    case "undelivered":
      return 0.22;
    case "completed":
      return 0.2;
    case "handoff":
      return 0.17;
    case "offers":
      return 0.16;
    case "delivered":
      return 0.14;
  }
}

/**
 * v2 peek floors (README "Peek floors"): the sheet's minimum height at peek, in dp, so the stage's
 * must-see block is fully visible. Columns: 360×720 · 320×640 · 320×640 at font scale 1.3. A window
 * at least 700dp tall takes the first column; shorter ones the second (third above font scale 1.05).
 * Stages without a floor return 0 (the measured peek alone decides).
 */
const PEEK_FLOORS: Partial<Record<OrderStage, readonly [number, number, number]>> = {
  finding: [424, 372, 372],
  noRiders: [424, 372, 372],
  cancelled: [424, 372, 372],
  offers: [540, 473, 495],
  toPickup: [450, 394, 417],
  toDropoff: [450, 394, 417],
  handoff: [534, 467, 484],
  retryNoMatch: [476, 417, 417],
  retryRiderCancelled: [476, 417, 417],
  reopened: [476, 417, 417],
  delivered: [553, 484, 507],
  undelivered: [502, 439, 473],
};

export function stagePeekFloor(stage: OrderStage, windowHeight: number, fontScale: number): number {
  const f = PEEK_FLOORS[stage];
  if (!f) return 0;
  return windowHeight >= 700 ? f[0] : fontScale > 1.05 ? f[2] : f[1];
}

/** The step track's current step: Matched 0 · Picked up 1 · On the way 2 · Delivered 3. */
export function stepIndex(status: string): number {
  switch (status) {
    case "picked_up":
      return 1;
    case "en_route_dropoff":
      return 2;
    case "delivered":
    case "completed":
      return 3;
    default:
      return 0;
  }
}

/** Help shows on live trips only (matched → delivered). */
export function showsHelp(stage: OrderStage): boolean {
  return LIVE.has(stage);
}

/** After the trip ends the rider's number is masked and Call / WhatsApp are hidden; undelivered keeps them. */
export function phoneMasked(stage: OrderStage): boolean {
  return stage === "delivered" || stage === "completed" || stage === "cancelled" || stage === "retryRiderCancelled";
}

/** The suggested retry price: the last price + $0.50 (README "Retry"). */
export function suggestedRetryPrice(lastPrice: number): number {
  return Math.round((lastPrice + 0.5) * 100) / 100;
}

/** Whole minutes since an ISO time (for "Last seen 3 min ago"), floored at 1. */
export function minutesSince(iso: string | null | undefined, nowMs: number): number {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 1;
  return Math.max(1, Math.floor((nowMs - t) / 60_000));
}
