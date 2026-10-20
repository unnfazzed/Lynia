import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { LiveOrderFacts } from "./live-ops";
import { activeOrderCount, lateCheck, OrderHealthService } from "./order-health";

const NOW = new Date("2026-10-20T10:00:00Z").getTime();
const ago = (min: number) => new Date(NOW - min * 60_000);
const none = { bids: 0, firstBidAt: null, lastEventAt: null, assignedEventAt: null };
const facts = (over: Partial<LiveOrderFacts>): LiveOrderFacts => ({
  orderType: "parcel",
  status: "open_for_offers",
  merchantPhase: null,
  createdAt: ago(0),
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
  ...over,
});

describe("lateCheck (QA-B02: one late rule for every admin screen)", () => {
  it.each([
    // [case, facts, extras, late]
    ["food order with no biker, 10 min into a 6 min stage", facts({ orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", readyAt: ago(10) }), none, true],
    ["food order with no biker, 2 min in", facts({ orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", readyAt: ago(2) }), none, false],
    ["food order waiting on the customer 16 min", facts({ orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment", merchantAcceptedAt: ago(16) }), none, true],
    ["delivery with no event for 21 min", facts({ status: "en_route_dropoff", riderId: "r1", assignedAt: ago(40) }), { ...none, lastEventAt: ago(21) }, true],
    ["delivery with an event 5 min ago", facts({ status: "en_route_dropoff", riderId: "r1", assignedAt: ago(40) }), { ...none, lastEventAt: ago(5) }, false],
    ["parcel with no bid for 3 min", facts({ createdAt: ago(3) }), none, true],
  ])("%s", (_case, o, x, late) => {
    expect(lateCheck(o, x, NOW)?.late).toBe(late);
  });

  it("does not time an ended order", () => {
    expect(lateCheck(facts({ status: "completed" }), none, NOW)).toBeNull();
  });

  it("names the stage and its limit for the console's copy", () => {
    const c = lateCheck(facts({ orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", readyAt: ago(10) }), none, NOW)!;
    expect(c.stageLabel).toBe("No biker yet");
    expect(Math.round(c.limitMs / 60_000)).toBe(6);
    expect(Math.round(c.elapsedMs / 60_000)).toBe(10);
  });
});

describe("activeOrderCount (QA-B03: one active count)", () => {
  it("counts every not-ended status, including delivered and fleet_searching", () => {
    expect(
      activeOrderCount({ open_for_offers: 2, assigned: 1, delivered: 1, fleet_searching: 1, completed: 9, cancelled: 3, expired: 2, undelivered: 1 }),
    ).toBe(5);
  });
});

describe("OrderHealthService", () => {
  const late = {
    id: "food-late",
    orderType: "merchant",
    status: "requested",
    merchantPhase: "ready_for_pickup",
    createdAt: ago(20),
    riderId: null,
    assignedAt: null,
    merchantAcceptedAt: ago(19),
    acceptDeadlineAt: null,
    autoAccepted: false,
    kitchenConfirmedAt: null,
    prepStartedAt: null,
    prepMinutes: null,
    dispatchStartedAt: ago(12),
    readyAt: ago(12),
    collectedAt: null,
    customerId: "c1",
    customer: { firstName: "Tari", lastName: "Q" },
    rider: null,
    merchant: { id: "m1", name: "Sadza Republic" },
  };
  const prisma = {
    order: { findMany: vi.fn(async () => [late]), count: vi.fn(async () => 2) },
    offer: { groupBy: vi.fn(async () => []) },
    orderEvent: { groupBy: vi.fn(async () => []) },
  };

  it("puts a pre-biker food order on the late list the Overview card and the alert strip both read", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const svc = new OrderHealthService(prisma as unknown as PrismaService);
      const live = await svc.liveOrders();
      expect(live.counts).toEqual({ total: 1, breach: 1, warn: 0, active: 2, untimed: 1 });
      expect(await svc.lateSummary()).toEqual({ count: 1, oldest: { id: "food-late", stageLabel: "No biker yet", limitMs: 6 * 60_000 } });
      // The active count excludes only the ended statuses.
      expect(prisma.order.count).toHaveBeenCalledWith({ where: { status: { notIn: ["completed", "cancelled", "expired", "undelivered"] } } });
    } finally {
      vi.useRealTimers();
    }
  });
});
