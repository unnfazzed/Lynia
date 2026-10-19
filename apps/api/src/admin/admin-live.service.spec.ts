import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingService } from "../tracking/tracking.service";
import type { AdminKitchenService } from "./admin-kitchen.service";
import type { AdminMoneyService } from "./admin-money.service";
import { ALERTS_CACHE_MS, AdminLiveService } from "./admin-live.service";

const NOW = new Date("2026-10-13T08:30:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

const baseOrder = {
  merchantPhase: null,
  riderId: null,
  assignedAt: null,
  merchantAcceptedAt: null,
  acceptDeadlineAt: null,
  autoAccepted: false,
  kitchenConfirmedAt: null,
  prepStartedAt: null,
  prepMinutes: null,
  dispatchStartedAt: null,
  readyAt: null,
  collectedAt: null,
  customer: { firstName: "Rudo", lastName: "N" },
  rider: null,
  merchant: null,
  pickup: { point: { lat: -17.8, lng: 31.05 } },
  dropoff: { point: { lat: -17.82, lng: 31.07 } },
};

function build(over: { orders?: unknown[]; riders?: unknown[]; live?: Record<string, unknown>; env?: Partial<Env> } = {}) {
  const orders = over.orders ?? [
    // On time: a parcel 1 minute old with no bid.
    { ...baseOrder, id: "o-fresh", orderType: "parcel", status: "open_for_offers", createdAt: ago(1), customerId: "c-1" },
    // Breach: a delivery with no event for 30 minutes.
    {
      ...baseOrder,
      id: "o-quiet",
      orderType: "parcel",
      status: "en_route_dropoff",
      createdAt: ago(60),
      customerId: "c-2",
      riderId: "r-1",
      assignedAt: ago(50),
      rider: { profile: { firstName: "Tendai", lastName: "M" } },
    },
    // Warn: a venue 2.5 minutes into its 3-minute window.
    {
      ...baseOrder,
      id: "o-ring",
      orderType: "merchant",
      status: "requested",
      merchantPhase: "awaiting_accept",
      acceptDeadlineAt: new Date(NOW.getTime() + 30_000),
      createdAt: ago(3),
      customerId: "c-3",
      merchant: { id: "m-1", name: "Mama's Kitchen" },
    },
    // Not timed: a scheduled order that hasn't rung.
    { ...baseOrder, id: "o-later", orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept", createdAt: ago(5), customerId: "c-4" },
  ];
  const prisma = {
    order: { findMany: vi.fn(async () => orders) },
    offer: { groupBy: vi.fn(async () => []) },
    orderEvent: {
      groupBy: vi.fn(async (args: { where: { status?: string } }) =>
        args.where.status ? [{ orderId: "o-quiet", _max: { createdAt: ago(45) } }] : [{ orderId: "o-quiet", _max: { createdAt: ago(30) } }],
      ),
    },
    rider: { findMany: vi.fn(async () => over.riders ?? []), count: vi.fn(async () => 14) },
    sosEvent: { count: vi.fn(async () => 2) },
    merchant: { count: vi.fn(async () => 1) },
    ownerFleet: { count: vi.fn(async () => 3) },
    merchantFleetStatement: { count: vi.fn(async () => 2) },
  };
  const tracking = { getLivePosition: vi.fn(async (id: string) => (over.live?.[id] as never) ?? null) };
  const kitchen = { countToConfirm: vi.fn(async () => 3) };
  const money = { openAnomalyCount: vi.fn(async () => 4) };
  const env = {
    NODE_ENV: "production",
    COMMISSION_RATE_PCT: 10,
    PAYMENT_RAIL: "paynow",
    TOPUP_RAILS: ["ecocash"],
    TOPUP_FEE_PCT: 2.5,
    PAYNOW_FEE_MODE: "paynow",
    PAYNOW_INTEGRATION_KEY: "secret-key-value",
    DIDIT_API_KEY: "didit-secret",
    JWT_SECRET: "jwt-secret",
    WALLET_MANUAL_CREDIT_CAP_USD: 50,
    KYC_MODE: "auto",
    KYC_PROVIDER: "didit",
    RESTAURANTS_ENABLED: "true",
    SHOPS_ENABLED: "false",
    PHARMACY_ENABLED: "true",
    RX_ENABLED: "true",
    MERCHANT_DISPATCH_AUTO_ENABLED: "false",
    MERCHANT_WALLET_ENABLED: "false",
    NOTIFICATIONS_FEED_ENABLED: "true",
    GPS_RETENTION_DAYS: 90,
    ...over.env,
  } as unknown as Env;
  const svc = new AdminLiveService(
    prisma as unknown as PrismaService,
    env,
    tracking as unknown as TrackingService,
    kitchen as unknown as AdminKitchenService,
    money as unknown as AdminMoneyService,
  );
  return { svc, prisma, tracking, kitchen, money };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AdminLiveService.liveOrders", () => {
  it("times each order in its stage and sorts breach, then warn, then on time", async () => {
    const { svc } = build();
    const out = await svc.liveOrders();
    expect(out.rows.map((r) => [r.id, r.stage, r.breach])).toEqual([
      ["o-quiet", "delivery", "breach"],
      ["o-ring", "merchant_accept", "warn"],
      ["o-fresh", "no_bid", "ok"],
    ]);
    expect(out.counts).toEqual({ total: 3, breach: 1, warn: 1 });
    const quiet = out.rows[0];
    expect(quiet.stageStartedAt).toBe(ago(30).toISOString());
    expect(quiet.elapsedMs).toBe(30 * 60_000);
    expect(quiet.rider).toEqual({ id: "r-1", name: "Tendai M" });
    expect(out.rows[1].merchant).toEqual({ id: "m-1", name: "Mama's Kitchen" });
  });

  it("reads no bids or events when nothing is live", async () => {
    const { svc, prisma } = build({ orders: [] });
    expect((await svc.liveOrders()).rows).toEqual([]);
    expect(prisma.orderEvent.groupBy).not.toHaveBeenCalled();
  });
});

describe("AdminLiveService.fleet", () => {
  it("prefers the live position, falls back to the saved one, and says how fresh each is", async () => {
    const { svc } = build({
      riders: [
        { profileId: "r-1", currentLat: -17.7, currentLng: 31.0, positionUpdatedAt: ago(30), profile: { firstName: "Tendai", lastName: "M" } },
        { profileId: "r-2", currentLat: -17.9, currentLng: 31.1, positionUpdatedAt: ago(10), profile: { firstName: "Farai", lastName: "C" } },
        { profileId: "r-3", currentLat: null, currentLng: null, positionUpdatedAt: null, profile: { firstName: "Nyasha", lastName: "" } },
      ],
      live: { "r-1": { lat: -17.81, lng: 31.06, at: NOW.getTime() - 20_000 } },
    });
    const out = await svc.fleet();
    expect(out.riders).toEqual([
      { riderId: "r-1", name: "Tendai M", position: { lat: -17.81, lng: 31.06, at: new Date(NOW.getTime() - 20_000).toISOString(), fresh: true }, orderId: "o-quiet" },
      { riderId: "r-2", name: "Farai C", position: { lat: -17.9, lng: 31.1, at: ago(10).toISOString(), fresh: false }, orderId: null },
      { riderId: "r-3", name: "Nyasha", position: null, orderId: null },
    ]);
    const quiet = out.orders.find((o) => o.orderId === "o-quiet");
    expect(quiet).toEqual({
      orderId: "o-quiet",
      orderType: "parcel",
      status: "en_route_dropoff",
      breach: "breach",
      riderId: "r-1",
      pickup: { lat: -17.8, lng: 31.05 },
      dropoff: { lat: -17.82, lng: 31.07 },
    });
    // The untimed scheduled order still gets its pins, with no breach.
    expect(out.orders.find((o) => o.orderId === "o-later")?.breach).toBeNull();
  });

  it("reads only bikers online with a fresh heartbeat", async () => {
    const { svc, prisma } = build();
    await svc.fleet();
    const where = (prisma.rider.findMany.mock.calls[0] as unknown as [{ where: { isOnline: boolean; lastHeartbeatAt: { gte: Date } } }])[0].where;
    expect(where.isOnline).toBe(true);
    expect(where.lastHeartbeatAt.gte.getTime()).toBeLessThan(NOW.getTime());
  });
});

describe("AdminLiveService.alerts", () => {
  it("counts every alert in one call and reuses it briefly", async () => {
    const { svc, prisma } = build();
    expect(await svc.alerts()).toEqual({
      sosPending: 2,
      topupAnomalies: 4,
      kitchenConfirmations: 3,
      merchantApplications: 1,
      ordersBreaching: 1,
      // OB-A4: "Own bikers live: 3 fleets · 14 bikers online · 2 overdue".
      ownBikers: { fleets: 3, bikersOnline: 14, overdueBills: 2 },
    });
    await svc.alerts();
    expect(prisma.sosEvent.count).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(NOW.getTime() + ALERTS_CACHE_MS + 1));
    await svc.alerts();
    expect(prisma.sosEvent.count).toHaveBeenCalledTimes(2);
  });
});

describe("AdminLiveService.config", () => {
  it("shows the switches the services run with", () => {
    const { svc } = build();
    const c = svc.config();
    expect(c.commission).toMatchObject({ ratePct: 10, freeFirstJobs: 10 });
    expect(c.topUps).toEqual({ paymentRail: "paynow", rails: ["ecocash"], feePct: 2.5, feeMode: "paynow" });
    expect(c.kyc).toEqual({ mode: "auto", provider: "didit" });
    expect(c.verticals).toMatchObject({ restaurants: true, shops: false, pharmacy: true });
    expect(c.wallet.reversalCapUsd).toBe(50);
    expect(typeof c.penaltiesSuspended).toBe("boolean");
    expect(c.sla.length).toBeGreaterThan(0);
  });

  it("never carries a secret, key or token", () => {
    const { svc } = build();
    const json = JSON.stringify(svc.config());
    for (const secret of ["secret-key-value", "didit-secret", "jwt-secret"]) expect(json).not.toContain(secret);
    expect(json).not.toMatch(/key"|token|secret|password/i);
  });
});
