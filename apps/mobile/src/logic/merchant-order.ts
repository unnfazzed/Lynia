import { haversineKm } from "@lynia/shared";
import { ETA_SPEED_KMH, ROAD_WINDING_FACTOR } from "./eta";
import { ARRIVING_M, GPS_PAUSED_MS } from "./order-stage";

/**
 * Order flow v2 (ledger D-59, `packages/design/handoff/order-flow-v2/`): the customer order screen for a
 * merchant (restaurant) order. Pure and framework-free so the stage machine, the four-step track and the
 * ETA honesty rules unit-test off-device. The screen holds the React state; this file only derives what
 * to draw from the server's own fields (`status` + `merchantPhase` on the food order, events / rider fix
 * on the generic snapshot).
 *
 * NEEDS BACKEND (README): there is no merchant-order step track on the customer socket yet, so the
 * four-step track is derived here on the phone from `status` + `merchantPhase`.
 */

/** The README's T/P/D states this screen can be in (T10 "at your door" = P). */
export type MerchantStage =
  | "confirming" // T2 — auto-accepted, the kitchen hasn't said yes yet
  | "waiting" // T3 — waiting for the venue to accept
  | "itemApproval" // U2 — the venue took a line off at accept; the customer answers
  | "cooking" // T4
  | "slowRider" // T11a — food ready, no rider yet
  | "riderDropped" // T11b — a rider had the job and dropped it
  | "toVenue" // T6 (T12a with no fix)
  | "collecting" // T7 — the rider is at the venue
  | "onWay" // T8/T9 (T12a/b)
  | "door" // P1–P3
  | "delivered" // D1
  | "completed" // D2
  | "cancelled" // D3a–f
  | "undelivered"; // D4

/** The four steps: Confirmed → Cooking → On the way → Delivered. `4` = every step done. */
export type TrackStep = 0 | 1 | 2 | 3 | 4;

export interface TrackInput {
  status: string;
  merchantPhase: string | null | undefined;
  autoAccepted?: boolean | null;
  kitchenConfirmedAt?: string | null;
}

const PRE_PICKUP = new Set(["assigned", "confirmed", "en_route_pickup"]);
const POST_PICKUP = new Set(["picked_up", "en_route_dropoff"]);

/** True while the kitchen auto-accepted but nobody has confirmed it is cooking yet (T2). */
export function awaitingKitchenConfirm(i: TrackInput): boolean {
  return i.autoAccepted === true && !i.kitchenConfirmedAt && i.merchantPhase === "preparing" && i.status === "requested";
}

/**
 * The current step of the four-step track. Rider found, at the venue and collected are sheet content and
 * map state inside steps 2–3 (BRIEF §4), so a rider heading to the venue is still "Cooking".
 */
export function trackStep(i: TrackInput): TrackStep {
  if (i.status === "delivered" || i.status === "completed") return 4;
  if (POST_PICKUP.has(i.status)) return 2;
  if (PRE_PICKUP.has(i.status)) return 1;
  switch (i.merchantPhase) {
    case "preparing":
      return awaitingKitchenConfirm(i) ? 0 : 1;
    case "ready_for_pickup":
      return 1;
    default:
      // awaiting_accept / awaiting_item_approval / awaiting_payment / not yet phased
      return 0;
  }
}

export interface StageInput extends TrackInput {
  riderId: string | null | undefined;
  /** A rider was seen on this order earlier (the drop latch). */
  sawRider: boolean;
  /** The rider's last fix, if any. */
  rider: { lat: number; lng: number; at: string | null } | null;
  venue: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  /** When the rider was assigned (the GPS-paused clock starts here before the first fix). */
  assignedAt: string | null;
  /** The cash handshake has started (either side confirmed, or it froze). */
  handshakeStarted: boolean;
  nowMs: number;
}

export interface StageResult {
  stage: MerchantStage;
  /** A live rider stage with no fix yet — no ETA, only the sentence (BRIEF §5). */
  noFix: boolean;
  /** The last fix is older than a minute — "Last seen" pin + the paused note (T12b). */
  gpsPaused: boolean;
}

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => haversineKm(a, b) * 1000;

function baseStage(i: StageInput): MerchantStage {
  switch (i.status) {
    case "delivered":
      return "delivered";
    case "completed":
      return "completed";
    case "cancelled":
    case "expired":
      return "cancelled";
    case "undelivered":
      return "undelivered";
    default:
      break;
  }
  if (PRE_PICKUP.has(i.status) && i.riderId) {
    if (i.rider && i.venue && metres(i.rider, i.venue) <= ARRIVING_M) return "collecting";
    return "toVenue";
  }
  if (POST_PICKUP.has(i.status)) {
    // The door card takes over once the rider is within ~150 m, or as soon as either side starts the
    // cash handshake — the customer must always be able to pay, even when the fix is stale.
    if (i.status === "en_route_dropoff" && i.handshakeStarted) return "door";
    if (i.status === "en_route_dropoff" && i.rider && i.dropoff && metres(i.rider, i.dropoff) <= ARRIVING_M) return "door";
    return "onWay";
  }
  switch (i.merchantPhase) {
    case "awaiting_accept":
    case "awaiting_payment":
      return "waiting";
    case "awaiting_item_approval":
      return "itemApproval";
    case "preparing":
      return awaitingKitchenConfirm(i) ? "confirming" : "cooking";
    case "ready_for_pickup":
      return i.sawRider && !i.riderId ? "riderDropped" : "slowRider";
    default:
      return "waiting";
  }
}

const LIVE_RIDER: ReadonlySet<MerchantStage> = new Set(["toVenue", "collecting", "onWay", "door"]);

export function isRiderStage(stage: MerchantStage): boolean {
  return LIVE_RIDER.has(stage);
}

export function resolveMerchantStage(i: StageInput): StageResult {
  const stage = baseStage(i);
  if (!LIVE_RIDER.has(stage)) return { stage, noFix: false, gpsPaused: false };
  const since = i.rider?.at ?? i.assignedAt;
  const t = since ? Date.parse(since) : NaN;
  const gpsPaused = i.rider != null && Number.isFinite(t) && i.nowMs - t > GPS_PAUSED_MS;
  return { stage, noFix: i.rider == null, gpsPaused };
}

// ── ETA (BRIEF §5: a range until the rider collects, then one time; no fix ⇒ no ETA) ──────────────────

const RANGE_MIN = 15;
const MIN_MS = 60_000;

/** Minutes to ride `km` of straight line, inflated for road winding (the After Send estimate). */
export function rideMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const km = haversineKm(a, b) * ROAD_WINDING_FACTOR;
  return Math.max(1, Math.ceil((km / ETA_SPEED_KMH) * 60));
}

/** When the kitchen expects the food to be ready (`readyAt`, else prep start + prep minutes), or null. */
export function readyAtMs(o: { readyAt?: string | null; prepStartedAt?: string | null; prepMinutes?: number | null }): number | null {
  const ready = o.readyAt ? Date.parse(o.readyAt) : NaN;
  if (Number.isFinite(ready)) return ready;
  const start = o.prepStartedAt ? Date.parse(o.prepStartedAt) : NaN;
  if (Number.isFinite(start) && o.prepMinutes != null && o.prepMinutes > 0) return start + o.prepMinutes * MIN_MS;
  return null;
}

export type Eta = { kind: "range"; fromMs: number; toMs: number } | { kind: "one"; minutes: number; atMs: number };

/**
 * The ETA line for the stage, or null when there is nothing honest to show.
 *  - Before collection: a range — the food is ready (prep), the rider reaches the venue (fix), then the
 *    venue → door ride. The range starts on a 5-minute mark and is 15 minutes wide.
 *  - After collection: one time from the rider's fix to the door.
 *  - A rider stage without a fix shows no ETA at all; so does a stage without prep data.
 */
export function merchantEta(i: {
  stage: MerchantStage;
  noFix: boolean;
  nowMs: number;
  readyMs: number | null;
  venue: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  rider: { lat: number; lng: number } | null;
}): Eta | null {
  const { stage, nowMs, venue, dropoff, rider } = i;
  if (!venue || !dropoff) return null;
  if (stage === "onWay" || stage === "door") {
    if (!rider || i.noFix) return null;
    const minutes = rideMinutes(rider, dropoff);
    return { kind: "one", minutes, atMs: nowMs + minutes * MIN_MS };
  }
  const preCollect: ReadonlySet<MerchantStage> = new Set(["confirming", "cooking", "slowRider", "riderDropped", "toVenue", "collecting"]);
  if (!preCollect.has(stage)) return null;
  if ((stage === "toVenue" || stage === "collecting") && (i.noFix || !rider)) return null;
  if (i.readyMs == null && stage !== "slowRider" && stage !== "riderDropped") return null;
  let collectMs = Math.max(nowMs, i.readyMs ?? nowMs);
  if (rider && (stage === "toVenue" || stage === "collecting")) collectMs = Math.max(collectMs, nowMs + rideMinutes(rider, venue) * MIN_MS);
  const arrive = collectMs + rideMinutes(venue, dropoff) * MIN_MS;
  const fiveMin = 5 * MIN_MS;
  const fromMs = Math.floor(arrive / fiveMin) * fiveMin;
  return { kind: "range", fromMs, toMs: fromMs + RANGE_MIN * MIN_MS };
}

/** The prep bar: whole minutes left (≥ 1 while cooking) and the share done (0–100), or null. */
export function prepProgress(o: { readyAt?: string | null; prepStartedAt?: string | null; prepMinutes?: number | null }, nowMs: number): { minutesLeft: number; pct: number } | null {
  const start = o.prepStartedAt ? Date.parse(o.prepStartedAt) : NaN;
  const end = readyAtMs(o);
  if (!Number.isFinite(start) || end == null || end <= start) return null;
  const left = Math.max(1, Math.ceil((end - nowMs) / MIN_MS));
  const pct = Math.max(0, Math.min(100, Math.round(((nowMs - start) / (end - start)) * 100)));
  return { minutesLeft: left, pct };
}

// ── codes (BRIEF §16: every code is 6 digits, shown 3+3; copied / shared without the space) ─────────

/** "418290" → ["418", "290"]. A code of any other length comes back as one group. */
export function codeGroups(code: string): string[] {
  const digits = code.replace(/\s/g, "");
  return digits.length === 6 ? [digits.slice(0, 3), digits.slice(3)] : [digits];
}

/** "418 290" for reading; never used for copy / share. */
export function codeShown(code: string): string {
  return codeGroups(code).join(" ");
}

/** The value to copy or share: the digits only, no space. */
export function codeCopied(code: string): string {
  return code.replace(/\s/g, "");
}

/** "Order #A1B2" id — the first four hex digits of the order id, upper case. */
export function shortOrderId(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 4).toUpperCase();
}
