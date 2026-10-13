import { OFFER_WINDOW_MS, RESTAURANTS_AUTO_ACCEPT, RESTAURANTS_DISPATCH, RESTAURANTS_TIMING } from "@lynia/shared";

/**
 * Admin console v2 §7 — the order monitor's stages and their SLA limits, in one place.
 *
 * Every active order sits in exactly one stage. A stage has a start time (from the order's own columns or its
 * OrderEvent rows) and a limit. Past the limit the order is "breach"; past {@link LIVE_WARN_RATIO} of it,
 * "warn". The limits are ops targets for when to look, not product timers: nothing here cancels or moves an
 * order. Where a product timer exists, the limit is derived from it so the two can't drift.
 *
 * | Stage             | Order                                                   | Clock starts                        | Limit |
 * |-------------------|---------------------------------------------------------|-------------------------------------|-------|
 * | `no_bid`          | parcel, open for offers, no bid yet                     | createdAt                           | 2 min (> the 90 s offer window) |
 * | `choosing`        | parcel, open for offers, bids in, customer hasn't picked | first bid                           | 3 min |
 * | `merchant_accept` | food/shop, the venue hasn't accepted                    | the ring (acceptDeadlineAt − 3 min) | 3 min (the accept window) |
 * | `kitchen_confirm` | auto-accepted, the kitchen isn't confirmed              | createdAt                           | 5 min (the ops escalation) |
 * | `customer`        | food/shop, waiting on the customer (pay / approve)      | merchantAcceptedAt ?? createdAt     | 15 min (the payment reminder) |
 * | `preparing`       | food/shop, being made, no biker search yet              | prepStartedAt ?? merchantAcceptedAt | prep minutes + 10 min |
 * | `no_biker`        | food/shop, ready or searching, no biker yet             | dispatchStartedAt ?? readyAt        | 6 min (the NO_RIDER cap) |
 * | `pickup`          | a biker is on the way to the pickup                     | assignedAt ?? the `assigned` event  | 20 min |
 * | `delivery`        | picked up, on the way to the drop-off                   | the order's last event              | 20 min with no event |
 */
export const LIVE_STAGES = [
  "no_bid",
  "choosing",
  "merchant_accept",
  "kitchen_confirm",
  "customer",
  "preparing",
  "no_biker",
  "pickup",
  "delivery",
] as const;
export type LiveStage = (typeof LIVE_STAGES)[number];

const MIN = 60_000;

/** Grace over the venue's own prep time before a cooking order counts as late. */
export const PREP_GRACE_MS = 10 * MIN;

/** The fixed limit per stage (ms). `preparing` is the order's prep minutes + {@link PREP_GRACE_MS}; this is its fallback. */
export const LIVE_SLA_MS: Readonly<Record<LiveStage, number>> = {
  no_bid: Math.max(2 * MIN, OFFER_WINDOW_MS),
  choosing: 3 * MIN,
  merchant_accept: RESTAURANTS_TIMING.acceptWindowMs,
  kitchen_confirm: RESTAURANTS_AUTO_ACCEPT.escalateAfterMs,
  customer: RESTAURANTS_TIMING.paymentReminderWindowMs,
  preparing: RESTAURANTS_AUTO_ACCEPT.defaultPrepMinutes * MIN + PREP_GRACE_MS,
  no_biker: RESTAURANTS_DISPATCH.maxAttempts * RESTAURANTS_DISPATCH.offerWindowMs,
  pickup: 20 * MIN,
  delivery: 20 * MIN,
};

/** Plain labels for the stages (the console and the config panel show them). */
export const LIVE_STAGE_LABELS: Readonly<Record<LiveStage, string>> = {
  no_bid: "No bid yet",
  choosing: "Customer choosing a bid",
  merchant_accept: "Venue hasn't accepted",
  kitchen_confirm: "Kitchen not confirmed",
  customer: "Waiting on the customer",
  preparing: "Being made",
  no_biker: "No biker yet",
  pickup: "Biker going to pickup",
  delivery: "On the way, no update",
};

/** At this share of the limit the order turns "warn". */
export const LIVE_WARN_RATIO = 0.75;

/** The statuses the monitor watches (delivered and the terminal statuses are done). */
export const LIVE_ORDER_STATUSES = [
  "requested",
  "open_for_offers",
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
] as const;

export type LiveBreach = "ok" | "warn" | "breach";

/** The order columns {@link stageOf} reads. */
export interface LiveOrderFacts {
  orderType: string;
  status: string;
  merchantPhase: string | null;
  createdAt: Date;
  riderId: string | null;
  assignedAt: Date | null;
  merchantAcceptedAt: Date | null;
  acceptDeadlineAt: Date | null;
  autoAccepted: boolean;
  kitchenConfirmedAt: Date | null;
  prepStartedAt: Date | null;
  prepMinutes: number | null;
  dispatchStartedAt: Date | null;
  readyAt: Date | null;
  collectedAt: Date | null;
}

/** Per-order facts from other tables: bids (parcels) and OrderEvent rows. */
export interface LiveOrderExtras {
  /** Pending bids on the order. */
  bids: number;
  /** The first bid's time. */
  firstBidAt: Date | null;
  /** The newest OrderEvent's time. */
  lastEventAt: Date | null;
  /** The `assigned` OrderEvent's time (fallback for orders from before `assignedAt`). */
  assignedEventAt: Date | null;
}

export interface LiveStageResult {
  stage: LiveStage;
  startedAt: Date;
  limitMs: number;
}

const latest = (...ds: Array<Date | null | undefined>): Date | null =>
  ds.reduce<Date | null>((acc, d) => (d && (!acc || d > acc) ? d : acc), null);

/**
 * The stage an active order is in, when it started and its limit. Null when the order isn't being timed:
 * a scheduled order that hasn't rung yet, or a status the monitor doesn't watch.
 */
export function stageOf(o: LiveOrderFacts, x: LiveOrderExtras): LiveStageResult | null {
  const merchant = o.orderType === "merchant";
  const at = (stage: LiveStage, startedAt: Date, limitMs = LIVE_SLA_MS[stage]): LiveStageResult => ({ stage, startedAt, limitMs });

  if (o.status === "assigned" || o.status === "confirmed" || o.status === "en_route_pickup") {
    return at("pickup", o.assignedAt ?? x.assignedEventAt ?? o.createdAt);
  }
  if (o.status === "picked_up" || o.status === "en_route_dropoff") {
    return at("delivery", latest(x.lastEventAt, o.collectedAt, o.assignedAt) ?? o.createdAt);
  }
  if (!merchant) {
    if (o.status !== "open_for_offers") return null;
    return x.bids > 0 && x.firstBidAt ? at("choosing", x.firstBidAt) : at("no_bid", o.createdAt);
  }

  // Food, shop and pharmacy orders before a biker is on them.
  if (o.status !== "requested" && o.status !== "open_for_offers") return null;
  const phase = o.merchantPhase;
  const cooking = phase === "preparing" || phase === "ready_for_pickup";
  // An auto-accepted order sends no biker until the kitchen is confirmed, so that comes first.
  if (cooking && o.autoAccepted && !o.kitchenConfirmedAt) return at("kitchen_confirm", o.createdAt);
  if (o.riderId === null && (o.status === "open_for_offers" || (cooking && o.dispatchStartedAt) || phase === "ready_for_pickup")) {
    return at("no_biker", o.dispatchStartedAt ?? o.readyAt ?? o.createdAt);
  }
  switch (phase) {
    case "awaiting_accept":
      // A scheduled order has no deadline until it rings: not live yet.
      if (!o.acceptDeadlineAt) return null;
      return at("merchant_accept", new Date(o.acceptDeadlineAt.getTime() - RESTAURANTS_TIMING.acceptWindowMs));
    case "awaiting_item_approval":
    case "awaiting_payment":
      return at("customer", o.merchantAcceptedAt ?? o.createdAt);
    case "preparing":
      return at(
        "preparing",
        o.prepStartedAt ?? o.merchantAcceptedAt ?? o.createdAt,
        o.prepMinutes != null && o.prepMinutes > 0 ? o.prepMinutes * MIN + PREP_GRACE_MS : LIVE_SLA_MS.preparing,
      );
    default:
      return null;
  }
}

export function breachOf(elapsedMs: number, limitMs: number): LiveBreach {
  if (elapsedMs >= limitMs) return "breach";
  if (elapsedMs >= limitMs * LIVE_WARN_RATIO) return "warn";
  return "ok";
}

const BREACH_RANK: Record<LiveBreach, number> = { breach: 0, warn: 1, ok: 2 };

/** Breach first, then warn, then on time; inside each, the longest in its stage first. */
export function compareLive(a: { breach: LiveBreach; elapsedMs: number }, b: { breach: LiveBreach; elapsedMs: number }): number {
  return BREACH_RANK[a.breach] - BREACH_RANK[b.breach] || b.elapsedMs - a.elapsedMs;
}

/** The SLA table as the config panel shows it. */
export function slaTable(): Array<{ stage: LiveStage; label: string; limitMinutes: number; note: string | null }> {
  return LIVE_STAGES.map((stage) => ({
    stage,
    label: LIVE_STAGE_LABELS[stage],
    limitMinutes: Math.round((LIVE_SLA_MS[stage] / MIN) * 10) / 10,
    note:
      stage === "preparing"
        ? `The venue's prep minutes + ${PREP_GRACE_MS / MIN} (${RESTAURANTS_AUTO_ACCEPT.defaultPrepMinutes} + ${PREP_GRACE_MS / MIN} when unset)`
        : stage === "delivery"
          ? "Since the order's last event"
          : null,
  }));
}
