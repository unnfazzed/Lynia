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
import { LIVE_ORDER_STATUSES, type LiveBreach, slaTable } from "./live-ops";
import { LIVE_ORDER_CAP, type LiveOrders, OrderHealthService } from "./order-health";

export type { LiveOrderRow, LiveOrders } from "./order-health";
/** The fleet read's cap on online bikers. */
const FLEET_RIDER_CAP = 500;
/** A position older than this is drawn as stale (the live-position key's own TTL). */
export const FLEET_FRESH_MS = 2 * 60_000;
/** How long one instance reuses the alert counts. The strip renders on every page. */
export const ALERTS_CACHE_MS = 15_000;

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
  /** Own bikers (OB-A4 tile, D-117): switched-on fleets with bikers, their bikers online now, and bills past their due day. */
  ownBikers: { fleets: number; bikersOnline: number; overdueBills: number; overdueFleets: number };
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
    private readonly health: OrderHealthService,
  ) {}

  /** The order monitor (QA-B02: owned by OrderHealthService so the Overview card reads the same rule). */
  liveOrders(): Promise<LiveOrders> {
    return this.health.liveOrders();
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
    const [sosPending, topupAnomalies, kitchenConfirmations, merchantApplications, monitor, fleetsWithBikers, bikersOnline, overdueBills] = await Promise.all([
      this.prisma.sosEvent.count({ where: { acknowledgedAt: null } }),
      this.money.openAnomalyCount(),
      this.kitchen.countToConfirm(),
      this.prisma.merchant.count({ where: applicationsPastSlaWhere(now) }),
      this.liveOrders(),
      // Every business has Own bikers since the launch (2026-10-20), so a "fleet" here is one with bikers in it.
      this.prisma.rider.groupBy({ by: ["fleetOwnerProfileId"], where: { fleetOwnerProfileId: { not: null }, fleetOwner: { enabled: true } } }),
      this.prisma.rider.count({ where: { fleetOwnerProfileId: { not: null }, isOnline: true } }),
      this.prisma.merchantFleetStatement.groupBy({ by: ["ownerProfileId"], where: { status: { not: "paid" }, dueOn: { lt: today } }, _count: { _all: true } }),
    ]);
    const value: LiveAlerts = {
      sosPending,
      topupAnomalies,
      kitchenConfirmations,
      merchantApplications,
      ordersBreaching: monitor.counts.breach,
      ownBikers: {
        fleets: fleetsWithBikers.length,
        bikersOnline,
        overdueBills: overdueBills.reduce((n, g) => n + g._count._all, 0),
        // OB-A4 "2 overdue": fleets with a bill past its due day (the table's Overdue chip counts the same).
        overdueFleets: overdueBills.length,
      },
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
