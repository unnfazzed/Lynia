import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { AdminOrdersService } from "./admin-orders.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("AdminOrdersService.listOrders", () => {
  it("filters by status and serializes fares", async () => {
    let where: unknown;
    const prisma = {
      order: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              id: "o1",
              status: "cancelled",
              proposedFare: { toString: () => "2.50" },
              agreedFare: null,
              distanceKm: 1.5,
              customerId: "c1",
              riderId: "r1",
              cancelledBy: "r1",
              cancelReason: "cannot make it",
              createdAt: new Date("2026-06-26T00:00:00Z"),
            },
          ];
        },
      },
    };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const rows = await svc.listOrders("cancelled");
    expect(where).toEqual({ status: "cancelled" });
    expect(rows[0]).toMatchObject({ id: "o1", status: "cancelled", proposedFare: "2.50", agreedFare: null, cancelledByRole: "rider", cancelReason: "cannot make it" });
  });
});

describe("AdminOrdersService.getOrderDetail (D-2)", () => {
  const baseOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    status: "en_route_dropoff",
    proposedFare: dec("5.00"),
    agreedFare: dec("6.00"),
    distanceKm: 3.2,
    pickup: { landmark: "Avondale shops" },
    dropoff: { landmark: "Borrowdale" },
    itemDesc: "Documents",
    items: [{ description: "Envelope", quantity: 2 }],
    cancelledBy: null,
    cancelReason: null,
    customerId: "c1",
    riderId: "r1",
    createdAt: new Date("2026-06-26T10:00:00Z"),
    updatedAt: new Date("2026-06-26T10:30:00Z"),
    customer: { firstName: "Rudo", lastName: "K", phone: "+263771112222" },
    rider: { bikeReg: "ABZ 1", profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" } },
    events: [
      { status: "open_for_offers", createdAt: new Date("2026-06-26T10:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T10:05:00Z") },
      { status: "en_route_dropoff", createdAt: new Date("2026-06-26T10:20:00Z") },
    ],
    ...over,
  });

  it("returns null when the order is not found", async () => {
    const prisma = { order: { findUnique: async () => null } };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    expect(await svc.getOrderDetail("missing")).toBeNull();
  });

  it("builds the timeline, items, fares and REVEALS phones inside the reveal window", async () => {
    // Recent last event so the stuck heuristic (no update > 20m) does not fire → current step is "now".
    const events = [
      { status: "open_for_offers", createdAt: new Date(Date.now() - 20 * 60000) },
      { status: "assigned", createdAt: new Date(Date.now() - 15 * 60000) },
      { status: "en_route_dropoff", createdAt: new Date(Date.now() - 2 * 60000) },
    ];
    const prisma = { order: { findUnique: async () => baseOrder({ events }) } };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.route).toBe("Avondale shops → Borrowdale");
    expect(d.proposed).toBe("5.00");
    expect(d.agreed).toBe("6.00");
    expect(d.km).toBe(3.2);
    expect(d.items).toEqual([{ desc: "Envelope", qty: 2 }]);
    // en_route_dropoff is step 5 → steps 0..4 done, step 5 now, later steps pending.
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline![5]!.state).toBe("now");
    expect(d.timeline![7]!.state).toBeUndefined();
    // en_route_dropoff is a reveal status → full numbers for ops to call.
    expect(d.customerPhone).toBe("+263771112222");
    expect(d.riderPhone).toBe("+263782000001");
  });

  it("MASKS both phones once the order is terminal (outside the reveal window, A-03)", async () => {
    const prisma = { order: { findUnique: async () => baseOrder({ status: "cancelled" }) } };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.customerPhone).toBe("+263•••••2222");
    expect(d.riderPhone).toBe("+263•••••0001");
    // Off-path terminal → only the broadcast step is marked done, no "now".
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline!.some((s) => s.state === "now")).toBe(false);
  });
});

describe("AdminOrdersService mutations (Item 1 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    orderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    orderEvent: { data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  // A tx whose writes are recorded; $transaction runs the service callback against THIS object, so a
  // recorded orderUpdate AND a recorded audit prove both landed inside the same transaction.
  function makeTx(over: { order?: unknown } = {}) {
    const calls: Calls = { orderUpdate: null, orderEvent: null, audit: null };
    const tx = {
      order: {
        findUnique: async () => ("order" in over ? over.order : { id: "o1", status: "assigned", agreedFare: dec("6.00") }),
        update: async (args: Calls["orderUpdate"]) => { calls.orderUpdate = args; return {}; },
      },
      offer: { updateMany: async () => ({ count: 0 }) },
      orderEvent: { create: async (args: Calls["orderEvent"]) => { calls.orderEvent = args; return {}; } },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-9" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("cancelOrder sets cancelled + cancelledBy=admin, appends an OrderEvent, and audits in one tx", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const res = await svc.cancelOrder("admin-1", "o1", { reason: "duplicate order" });
    expect(calls.orderUpdate!.data).toMatchObject({ status: "cancelled", cancelledBy: "admin-1", cancelReason: "duplicate order" });
    expect(calls.orderEvent!.data).toEqual({ orderId: "o1", status: "cancelled" });
    expect(calls.audit!.data).toMatchObject({ action: "order.cancel", target: "o1", reasonCode: "duplicate order" });
    expect(res).toMatchObject({ id: "o1", status: "cancelled", auditId: "audit-9" });
  });

  it("cancelOrder pushes job:cancelled to an assigned rider post-commit (P2-3), with the collected flag", async () => {
    const { prisma } = makeTx({ order: { id: "o1", status: "picked_up", riderId: "r1", collectedAt: new Date() } });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn() };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
    await svc.cancelOrder("admin-1", "o1", { reason: "duplicate order" });
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith("o1", "cancelled");
    // Post-pickup (collectedAt set) → collected=true drives the rider's hand-back path.
    expect(gateway.emitJobCancelled).toHaveBeenCalledWith("o1", true);
  });

  it("cancelOrder does NOT push job:cancelled when no rider is assigned", async () => {
    const { prisma } = makeTx({ order: { id: "o1", status: "open_for_offers", riderId: null, collectedAt: null } });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn() };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
    await svc.cancelOrder("admin-1", "o1", { reason: "spam" });
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith("o1", "cancelled");
    expect(gateway.emitJobCancelled).not.toHaveBeenCalled();
  });

  it("cancelOrder rejects an order already in a terminal state (nothing written)", async () => {
    const { prisma, calls } = makeTx({ order: { id: "o1", status: "completed" } });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.cancelOrder("admin-1", "o1", { reason: "x" })).rejects.toThrow("terminal");
    expect(calls.orderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("adjustFare overwrites agreedFare and audits atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const res = await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "GPS overcharge" });
    expect(calls.orderUpdate!.data).toEqual({ agreedFare: 7.5 });
    expect(calls.audit!.data).toMatchObject({ action: "order.fare_adjust", target: "o1", reasonCode: "GPS overcharge" });
    expect(res).toMatchObject({ id: "o1", agreedFare: "7.50", auditId: "audit-9" });
  });

  it("adjustFare rejects an order that never had an agreed fare (nothing written)", async () => {
    const { prisma, calls } = makeTx({ order: { id: "o1", status: "open_for_offers", agreedFare: null } });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "x" })).rejects.toThrow(/no agreed fare/i);
    expect(calls.orderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });
});
