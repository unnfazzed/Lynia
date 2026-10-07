import { afterEach, describe, expect, it, vi } from "vitest";
import { MERCHANT_WAIT_CAP_MS, RESTAURANTS_TIMING } from "@lynia/shared";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";
import { withMembershipShim } from "./testing/membership-shim";

/**
 * Owner decision D1 (2026-10-07): every merchant-side wait runs 24 h. Nothing auto-cancels a restaurant,
 * shop or pharmacy order for a merchant wait inside 24 h (the 3:00 ring, the old 60-min unconfirmed
 * auto-accept, an offline tablet); the customer keeps a free cancel until the venue accepts and is pushed
 * "Still waiting for {v}" at 3 and 15 min. Also C1 = MJ-H2 + U31 (the offline "clock pause").
 *
 * The orders live in a tiny in-memory table whose `findMany` / `updateMany` evaluate the service's real
 * `where` clauses (equality, null, lt/lte, not, in, OR), so these tests run the sweeps' own filters
 * against a clock rather than asserting on the filter objects.
 */

const tokens = new TokenService({ JWT_SIGNING_SECRET: "merchant-wait-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = new Date("2026-10-07T08:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

type Row = Record<string, unknown> & { id: string };

const value = (v: unknown): unknown => (v instanceof Date ? v.getTime() : v);

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") {
      if (!(cond as Record<string, unknown>[]).some((w) => matches(row, w))) return false;
      continue;
    }
    if (k === "substitutionRounds") continue; // no rounds in these fixtures
    const v = row[k];
    if (cond === null) {
      if (v != null) return false;
    } else if (cond instanceof Date) {
      if (value(v) !== cond.getTime()) return false;
    } else if (typeof cond === "object") {
      const c = cond as Record<string, unknown>;
      if ("lt" in c && (v == null || (value(v) as number) >= (value(c.lt) as number))) return false;
      if ("lte" in c && (v == null || (value(v) as number) > (value(c.lte) as number))) return false;
      if ("not" in c && (c.not === null ? v == null : value(v) === value(c.not))) return false;
      if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
    } else if (v !== cond) {
      return false;
    }
  }
  return true;
}

function harness(rows: Row[], opts: { isMerchantOnline?: () => Promise<boolean>; beforeClaim?: (where: Record<string, unknown>) => void } = {}) {
  const pushes: Array<{ to: string[]; title: string; body: string; data?: Record<string, string>; collapseKey?: string }> = [];
  const notifications = {
    notifyProfiles: async (to: string[], m: { title: string; body: string; data?: Record<string, string>; collapseKey?: string }) => void pushes.push({ to, ...m }),
  } as unknown as NotificationsService;
  const isMerchantOnline = vi.fn(opts.isMerchantOnline ?? (async () => true));
  const gateway = { emitFoodQueueChanged: () => undefined, emitOrderStatus: () => undefined, isMerchantOnline } as unknown as TrackingGateway;
  const merchant = { name: "Gava’s Kitchen", businessType: "restaurant" };
  const withMerchant = (r: Row) => ({ ...r, merchant, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [], opsNoAnswerAt: [] });
  const prisma = withMembershipShim({
    order: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        rows.filter((r) => matches(r, where)).slice(0, take ?? rows.length).map(withMerchant),
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const r = rows.find((x) => matches(x, where));
        return r ? withMerchant(r) : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const r = rows.find((x) => x.id === where.id);
        return r ? withMerchant(r) : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        opts.beforeClaim?.(where);
        const hit = rows.filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    },
    orderEvent: { create: async () => ({}) },
  } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const svc = new FoodOrderService(
    prisma as unknown as PrismaService,
    tokens,
    notifications,
    { openDebtIfNeeded: async () => {} } as unknown as FoodDebtService,
    gateway,
    { initiate: async () => ({ status: "pending" }) } as unknown as PaymentRail,
  );
  /** One reconciler tick at `now`, the sweeps that can end or nudge a merchant wait. */
  const tick = async (now: Date) => {
    await svc.sweepExpiredAcceptWindows(now);
    await svc.sweepAutoAccepted(now);
    await svc.sweepStillWaiting(now);
  };
  return { svc, pushes, isMerchantOnline, tick };
}

/** A manual order as placeOrder stamps it: ringing, the drawn 3:00 answer window from placement. */
const ringing = (over: Partial<Row> = {}): Row => ({
  id: "o1",
  orderType: "merchant",
  customerId: "c1",
  merchantId: "m1",
  status: "requested",
  merchantPhase: "awaiting_accept",
  acceptDeadlineAt: at(RESTAURANTS_TIMING.acceptWindowMs),
  autoAccepted: false,
  kitchenConfirmedAt: null,
  kitchenEscalatedAt: null,
  prepStartedAt: null,
  merchantWaitNudges: 0,
  createdAt: T0,
  ...over,
});

/** An auto-accepted order the kitchen hasn't confirmed: cooking on paper since placement. */
const unconfirmedAuto = (over: Partial<Row> = {}): Row =>
  ringing({ merchantPhase: "preparing", acceptDeadlineAt: null, autoAccepted: true, prepStartedAt: T0, prepMinutes: 20, ...over });

afterEach(() => vi.useRealTimers());

describe("D1 — no auto-cancel for a merchant wait inside 24 h", () => {
  it("a ringing order is still open at 3:00 (the drawn countdown's 0:00), at 60 min and at 23 h 59", async () => {
    const order = ringing();
    const { tick } = harness([order]);
    for (const t of [3 * MIN, 3 * MIN + 20_000, 60 * MIN, 23 * HOUR + 59 * MIN]) {
      await tick(at(t));
      expect(order.status).toBe("requested");
      expect(order.merchantPhase).toBe("awaiting_accept");
    }
  });

  it("an unconfirmed auto-accepted order is no longer cancelled at 60 min — still open at 23 h 59", async () => {
    const order = unconfirmedAuto();
    const { tick } = harness([order]);
    for (const t of [60 * MIN, 61 * MIN, 23 * HOUR + 59 * MIN]) {
      await tick(at(t));
      expect(order.status).toBe("requested");
      expect(order.rejectionReason).toBeUndefined();
    }
  });

  it("cancels a never-answered ringing order `shop_closed` at 24 h and tells the customer nothing was charged", async () => {
    const order = ringing();
    const { tick, pushes } = harness([order]);
    await tick(at(MERCHANT_WAIT_CAP_MS - 1000));
    expect(order.status).toBe("requested");
    await tick(at(MERCHANT_WAIT_CAP_MS + 1000));
    expect(order).toMatchObject({ status: "cancelled", rejectionReason: "shop_closed", merchantPhase: null });
    expect(pushes.at(-1)).toMatchObject({ to: ["c1"], title: "Gava’s Kitchen couldn’t take your order" });
  });

  it("cancels a never-confirmed auto-accepted order `kitchen_unconfirmed` at 24 h", async () => {
    const order = unconfirmedAuto();
    const { tick } = harness([order]);
    await tick(at(MERCHANT_WAIT_CAP_MS + 1000));
    expect(order).toMatchObject({ status: "cancelled", rejectionReason: "kitchen_unconfirmed" });
  });

  it("a scheduled order's 24 h runs from its ring, not its placement", async () => {
    // Placed now for tomorrow; rung 20 h later (OrderScheduleService stamps acceptDeadlineAt then).
    const ringAt = 20 * HOUR;
    const order = ringing({ acceptDeadlineAt: at(ringAt + RESTAURANTS_TIMING.acceptWindowMs) });
    const { tick } = harness([order]);
    await tick(at(ringAt + 23 * HOUR));
    expect(order.status).toBe("requested");
    await tick(at(ringAt + MERCHANT_WAIT_CAP_MS + 1000));
    expect(order.status).toBe("cancelled");
  });

  it("C1 (MJ-H2 + U31): an OFFLINE merchant gets the same 24 h — the deadline is never pushed forward, so the customer's countdown can't loop", async () => {
    const order = ringing();
    const stamped = (order.acceptDeadlineAt as Date).getTime();
    const { tick, isMerchantOnline } = harness([order], { isMerchantOnline: async () => false });
    for (const t of [3 * MIN + 1000, 3 * MIN + 21_000, 10 * MIN, 5 * HOUR]) {
      await tick(at(t));
      expect(order.status).toBe("requested");
      // The old pause rewrote this to now + 20 s every tick (the 0:20 → 0:00 loop).
      expect((order.acceptDeadlineAt as Date).getTime()).toBe(stamped);
    }
    // Back online after 5 h: the merchant still has the rest of the 24 h, not 20 s.
    await tick(at(5 * HOUR + 30_000));
    expect(order.status).toBe("requested");
    await tick(at(MERCHANT_WAIT_CAP_MS + 1000));
    expect(order.status).toBe("cancelled");
    expect(isMerchantOnline).not.toHaveBeenCalled();
  });
});

describe("D1 — \"Still waiting for {v}\" at 3 and 15 min, once each", () => {
  const still = (p: { title: string }) => p.title.startsWith("Still waiting");

  it("pushes once at 3 min and once at 15 min while the venue hasn't answered, never again", async () => {
    const order = ringing();
    const { tick, pushes } = harness([order]);
    await tick(at(2 * MIN + 59_000));
    expect(pushes.filter(still)).toHaveLength(0);
    for (const t of [3 * MIN, 3 * MIN + 20_000, 5 * MIN, 14 * MIN]) await tick(at(t));
    expect(pushes.filter(still)).toHaveLength(1);
    for (const t of [15 * MIN, 15 * MIN + 20_000, 40 * MIN, 6 * HOUR]) await tick(at(t));
    expect(pushes.filter(still)).toHaveLength(2);
    expect(pushes[0]).toEqual({
      to: ["c1"],
      title: "Still waiting for Gava’s Kitchen",
      body: "They haven’t accepted your order yet. You can cancel free until they do.",
      data: { orderId: "o1", status: "requested", to: "customer", orderType: "merchant", kind: "food_still_waiting" },
      collapseKey: "order:o1:still_waiting",
    });
    expect(order.merchantWaitNudges).toBe(2);
  });

  it("pushes an unconfirmed auto-accepted order too (the venue hasn't said yes)", async () => {
    const order = unconfirmedAuto();
    const { tick, pushes } = harness([order]);
    for (const t of [3 * MIN, 15 * MIN, 30 * MIN]) await tick(at(t));
    expect(pushes.filter(still)).toHaveLength(2);
  });

  it("pushes nothing once the venue accepted (or the kitchen confirmed)", async () => {
    const manual = ringing({ id: "manual" });
    const auto = unconfirmedAuto({ id: "auto" });
    const { tick, pushes } = harness([manual, auto]);
    await tick(at(3 * MIN));
    expect(pushes.filter(still)).toHaveLength(2);
    // Accepted at 4 min / confirmed at 4 min.
    Object.assign(manual, { merchantPhase: "preparing", prepStartedAt: at(4 * MIN), acceptDeadlineAt: manual.acceptDeadlineAt });
    Object.assign(auto, { kitchenConfirmedAt: at(4 * MIN) });
    for (const t of [15 * MIN, 30 * MIN]) await tick(at(t));
    expect(pushes.filter(still)).toHaveLength(2);
  });

  it("an accept racing the push wins: the guarded claim misses and nothing is sent", async () => {
    const order = ringing();
    const { tick, pushes } = harness([order], {
      beforeClaim: (where) => {
        if ("merchantWaitNudges" in where) order.merchantPhase = "preparing";
      },
    });
    await tick(at(3 * MIN));
    expect(pushes.filter(still)).toHaveLength(0);
    expect(order.merchantWaitNudges).toBe(0);
  });

  it("an order first seen past 15 min (sweeps were down) gets only the 15-min push", async () => {
    const order = ringing();
    const { tick, pushes } = harness([order]);
    await tick(at(20 * MIN));
    await tick(at(21 * MIN));
    expect(pushes.filter(still)).toHaveLength(1);
    expect(order.merchantWaitNudges).toBe(2);
  });

  it("a scheduled order that hasn't rung is never 'late'", async () => {
    const order = ringing({ acceptDeadlineAt: null });
    const { tick, pushes } = harness([order]);
    for (const t of [3 * MIN, 15 * MIN, 5 * HOUR]) await tick(at(t));
    expect(pushes).toHaveLength(0);
    expect(order.status).toBe("requested");
  });
});

describe("D1 — the customer's free cancel holds for every pre-acceptance state", () => {
  it.each([
    ["ringing, inside the 3:00 window", () => ringing(), 1 * MIN],
    ["ringing, past the drawn 3:00", () => ringing(), 10 * MIN],
    ["ringing for hours", () => ringing(), 20 * HOUR],
    ["scheduled, not rung yet", () => ringing({ acceptDeadlineAt: null }), 1 * HOUR],
    ["auto-accepted, kitchen not confirmed, past the old 60 min", () => unconfirmedAuto(), 90 * MIN],
  ])("%s", async (_label, make, ms) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(ms));
    const order = make();
    const { svc, tick } = harness([order]);
    await tick(at(ms));
    await svc.cancelUnpaid("o1", "c1");
    expect(order).toMatchObject({ status: "cancelled", cancelledBy: "c1", merchantPhase: null });
  });

  it("refuses once the venue accepted and is cooking (no longer a merchant wait)", async () => {
    const order = ringing({ merchantPhase: "preparing", prepStartedAt: at(4 * MIN) });
    const { svc } = harness([order]);
    await expect(svc.cancelUnpaid("o1", "c1")).rejects.toThrow(/kitchen has started/);
    expect(order.status).toBe("requested");
  });
});
