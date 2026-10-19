import { harareDayKey } from "../merchant/harare-clock";
import { Inject, Injectable } from "@nestjs/common";
import { COMMISSION, resolveCommissionRatePct } from "@lynia/shared";
import { heartbeatMaxAgeMs } from "../common/broadcast-policy";
import { penaltiesSuspended } from "../common/penalties";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";
import { REVERSAL_CAP_USD } from "../wallet/wallet.service";
import { AdminKitchenService } from "./admin-kitchen.service";
import { AdminMoneyService } from "./admin-money.service";
import { applicationsPastSlaWhere } from "./admin.service";
import {
  breachOf,
  compareLive,
  LIVE_ORDER_STATUSES,
  LIVE_STAGE_LABELS,
  type LiveBreach,
  type LiveStage,
  slaTable,
  stageOf,
} from "./live-ops";

/** The monitor's read cap. A pilot has a handful of live orders; this only bounds a flood. */
const LIVE_ORDER_CAP = 300;
/** The fleet read's cap on online bikers. */
const FLEET_RIDER_CAP = 500;
/** A position older than this is drawn as stale (the live-position key's own TTL). */
export const FLEET_FRESH_MS = 2 * 60_000;
/** How long one instance reuses the alert counts. The strip renders on every page. */
export const ALERTS_CACHE_MS = 15_000;

export interface LiveOrderRow {
  id: string;
  orderType: string;
  status: string;
  merchantPhase: string | null;
  stage: LiveStage;
  stageLabel: string;
  stageStartedAt: string;
  limitMs: number;
  elapsedMs: number;
  breach: LiveBreach;
  createdAt: string;
  customer: { id: string; name: string };
  rider: { id: string; name: string } | null;
  merchant: { id: string; name: string } | null;
}

export interface LiveOrders {
  generatedAt: string;
  counts: { total: number; breach: number; warn: number };
  rows: LiveOrderRow[];
}

export interface FleetPoint {
  lat: number;
  lng: number;
}

export interface FleetRider {
  riderId: string;
  name: string;
  /** Null when the biker is online but has never sent a position. */
  position: (FleetPoint & { at: string | null; fresh: boolean }) | null;
  /** The order the biker is on, if any. */
  orderId: string | null;
}

export interface FleetOrder {
  orderId: string;
  orderType: string;
  status: string;
  breach: LiveBreach | null;
  riderId: string | null;
  pickup: FleetPoint | null;
  dropoff: FleetPoint | null;
}

export interface Fleet {
  generatedAt: string;
  riders: FleetRider[];
  orders: FleetOrder[];
}

export interface LiveAlerts {
  sosPending: number;
  topupAnomalies: number;
  kitchenConfirmations: number;
  merchantApplications: number;
  ordersBreaching: number;
  /** Own bikers (OB-A4 tile, D-117): fleets switched on, their bikers online now, and bills past their due day. */
  ownBikers: { fleets: number; bikersOnline: number; overdueBills: number };
}

const nameOf = (p: { firstName: string; lastName: string } | null | undefined, fallback: string): string =>
  `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim() || fallback;

function pointOf(waypoint: unknown): FleetPoint | null {
  const p = (waypoint as { point?: { lat?: unknown; lng?: unknown } } | null)?.point;
  return typeof p?.lat === "number" && typeof p?.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    ? { lat: p.lat, lng: p.lng }
    : null;
}

/**
 * Admin console v2 §7 — live ops: the order monitor, the fleet map's data, the alert strip and the read-only
 * config panel. Everything here is a read. Positions go to the admin only; nothing is written to domain_events.
 */
@Injectable()
export class AdminLiveService {
  private alertsCache: { at: number; value: LiveAlerts } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly tracking: TrackingService,
    private readonly kitchen: AdminKitchenService,
    private readonly money: AdminMoneyService,
  ) {}

  /** Every active order with its stage, the stage's clock and limit, and breach status. Breach first, then age. */
  async liveOrders(): Promise<LiveOrders> {
    const now = Date.now();
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [...LIVE_ORDER_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: LIVE_ORDER_CAP,
      select: {
        id: true,
        orderType: true,
        status: true,
        merchantPhase: true,
        createdAt: true,
        riderId: true,
        assignedAt: true,
        merchantAcceptedAt: true,
        acceptDeadlineAt: true,
        autoAccepted: true,
        kitchenConfirmedAt: true,
        prepStartedAt: true,
        prepMinutes: true,
        dispatchStartedAt: true,
        readyAt: true,
        collectedAt: true,
        customerId: true,
        customer: { select: { firstName: true, lastName: true } },
        rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        merchant: { select: { id: true, name: true } },
      },
    });
    const ids = orders.map((o) => o.id);
    const parcelOpen = orders.filter((o) => o.orderType === "parcel" && o.status === "open_for_offers").map((o) => o.id);
    const [bids, lastEvents, assignedEvents] = ids.length
      ? await Promise.all([
          parcelOpen.length
            ? this.prisma.offer.groupBy({
                by: ["orderId"],
                where: { orderId: { in: parcelOpen }, status: "pending" },
                _count: { _all: true },
                _min: { createdAt: true },
              })
            : Promise.resolve([]),
          this.prisma.orderEvent.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _max: { createdAt: true } }),
          this.prisma.orderEvent.groupBy({
            by: ["orderId"],
            where: { orderId: { in: ids }, status: "assigned" },
            _max: { createdAt: true },
          }),
        ])
      : [[], [], []];
    const bidsBy = new Map(bids.map((b) => [b.orderId, { n: b._count._all, first: b._min.createdAt }]));
    const lastBy = new Map(lastEvents.map((e) => [e.orderId, e._max.createdAt]));
    const assignedBy = new Map(assignedEvents.map((e) => [e.orderId, e._max.createdAt]));

    const rows: LiveOrderRow[] = [];
    for (const o of orders) {
      const b = bidsBy.get(o.id);
      const s = stageOf(o, {
        bids: b?.n ?? 0,
        firstBidAt: b?.first ?? null,
        lastEventAt: lastBy.get(o.id) ?? null,
        assignedEventAt: assignedBy.get(o.id) ?? null,
      });
      if (!s) continue;
      const elapsedMs = Math.max(0, now - s.startedAt.getTime());
      rows.push({
        id: o.id,
        orderType: o.orderType,
        status: o.status,
        merchantPhase: o.merchantPhase,
        stage: s.stage,
        stageLabel: LIVE_STAGE_LABELS[s.stage],
        stageStartedAt: s.startedAt.toISOString(),
        limitMs: s.limitMs,
        elapsedMs,
        breach: breachOf(elapsedMs, s.limitMs),
        createdAt: o.createdAt.toISOString(),
        customer: { id: o.customerId, name: nameOf(o.customer, "Customer") },
        rider: o.riderId ? { id: o.riderId, name: nameOf(o.rider?.profile, "Biker") } : null,
        merchant: o.merchant ? { id: o.merchant.id, name: o.merchant.name } : null,
      });
    }
    rows.sort(compareLive);
    return {
      generatedAt: new Date(now).toISOString(),
      counts: {
        total: rows.length,
        breach: rows.filter((r) => r.breach === "breach").length,
        warn: rows.filter((r) => r.breach === "warn").length,
      },
      rows,
    };
  }

  /**
   * Bikers online (fresh heartbeat, like the Overview count) with their last known position — the live Redis
   * fix when there is one, else the last one saved to Postgres — and the active orders' pickup and drop-off pins.
   */
  async fleet(): Promise<Fleet> {
    const now = Date.now();
    const hbCutoff = new Date(now - heartbeatMaxAgeMs());
    const [riders, live] = await Promise.all([
      this.prisma.rider.findMany({
        where: { isOnline: true, lastHeartbeatAt: { gte: hbCutoff } },
        orderBy: { lastHeartbeatAt: "desc" },
        take: FLEET_RIDER_CAP,
        select: {
          profileId: true,
          currentLat: true,
          currentLng: true,
          positionUpdatedAt: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { status: { in: [...LIVE_ORDER_STATUSES] } },
        orderBy: { createdAt: "desc" },
        take: LIVE_ORDER_CAP,
        select: { id: true, orderType: true, status: true, riderId: true, pickup: true, dropoff: true },
      }),
    ]);
    const monitor = await this.liveOrders();
    const breachBy = new Map(monitor.rows.map((r) => [r.id, r.breach]));
    const orderByRider = new Map(live.filter((o) => o.riderId).map((o) => [o.riderId as string, o.id]));

    const positions = await Promise.all(riders.map((r) => this.tracking.getLivePosition(r.profileId)));
    const out: FleetRider[] = riders.map((r, i) => {
      const livePos = positions[i];
      let position: FleetRider["position"] = null;
      if (livePos) {
        const at = Number.isFinite(livePos.at) ? livePos.at : null;
        position = { lat: livePos.lat, lng: livePos.lng, at: at ? new Date(at).toISOString() : null, fresh: at != null && now - at <= FLEET_FRESH_MS };
      } else if (r.currentLat != null && r.currentLng != null) {
        const at = r.positionUpdatedAt?.getTime() ?? null;
        position = { lat: r.currentLat, lng: r.currentLng, at: at ? new Date(at).toISOString() : null, fresh: at != null && now - at <= FLEET_FRESH_MS };
      }
      return { riderId: r.profileId, name: nameOf(r.profile, "Biker"), position, orderId: orderByRider.get(r.profileId) ?? null };
    });

    return {
      generatedAt: new Date(now).toISOString(),
      riders: out,
      orders: live.map((o) => ({
        orderId: o.id,
        orderType: o.orderType,
        status: o.status,
        breach: breachBy.get(o.id) ?? null,
        riderId: o.riderId,
        pickup: pointOf(o.pickup),
        dropoff: pointOf(o.dropoff),
      })),
    };
  }

  /** The alert strip's counts, in one call, reused for {@link ALERTS_CACHE_MS} on this instance. */
  async alerts(): Promise<LiveAlerts> {
    const now = Date.now();
    if (this.alertsCache && now - this.alertsCache.at < ALERTS_CACHE_MS) return this.alertsCache.value;
    const today = new Date(`${harareDayKey(new Date(now))}T00:00:00.000Z`);
    const [sosPending, topupAnomalies, kitchenConfirmations, merchantApplications, monitor, fleets, bikersOnline, overdueBills] = await Promise.all([
      this.prisma.sosEvent.count({ where: { acknowledgedAt: null } }),
      this.money.openAnomalyCount(),
      this.kitchen.countToConfirm(),
      this.prisma.merchant.count({ where: applicationsPastSlaWhere(now) }),
      this.liveOrders(),
      this.prisma.ownerFleet.count({ where: { enabled: true } }),
      this.prisma.rider.count({ where: { fleetOwnerProfileId: { not: null }, isOnline: true } }),
      this.prisma.merchantFleetStatement.count({ where: { status: { not: "paid" }, dueOn: { lt: today } } }),
    ]);
    const value: LiveAlerts = {
      sosPending,
      topupAnomalies,
      kitchenConfirmations,
      merchantApplications,
      ordersBreaching: monitor.counts.breach,
      ownBikers: { fleets, bikersOnline, overdueBills },
    };
    this.alertsCache = { at: now, value };
    return value;
  }

  /**
   * The settings the services run with, read-only. An allowlist: every field is named here, so a secret, key or
   * token can never reach the console by being added to the env.
   */
  config() {
    const e = this.env;
    const on = (v: string | undefined) => v === "true";
    return {
      environment: e.NODE_ENV,
      penaltiesSuspended: penaltiesSuspended(),
      commission: {
        ratePct: resolveCommissionRatePct(e.COMMISSION_RATE_PCT),
        freeFirstJobs: COMMISSION.freeFirstJobs,
        minTopUp: COMMISSION.minTopUp,
        maxTopUp: COMMISSION.maxTopUp,
      },
      topUps: {
        paymentRail: e.PAYMENT_RAIL,
        rails: [...e.TOPUP_RAILS],
        feePct: e.TOPUP_FEE_PCT,
        feeMode: e.PAYNOW_FEE_MODE,
      },
      wallet: {
        manualCreditCapUsd: e.WALLET_MANUAL_CREDIT_CAP_USD,
        reversalCapUsd: REVERSAL_CAP_USD,
      },
      kyc: { mode: e.KYC_MODE, provider: e.KYC_PROVIDER },
      verticals: {
        restaurants: on(e.RESTAURANTS_ENABLED),
        shops: on(e.SHOPS_ENABLED),
        pharmacy: on(e.PHARMACY_ENABLED),
        prescriptions: on(e.RX_ENABLED),
        autoDispatch: on(e.MERCHANT_DISPATCH_AUTO_ENABLED),
        merchantWallet: on(e.MERCHANT_WALLET_ENABLED),
        notificationsFeed: on(e.NOTIFICATIONS_FEED_ENABLED),
      },
      gpsRetentionDays: e.GPS_RETENTION_DAYS,
      sla: slaTable(),
    };
  }
}

export type AdminConfig = ReturnType<AdminLiveService["config"]>;
