import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OrderScheduleService } from "./order-schedule.service";

/** Admin console v2 §5 + review 2026-10-24: what a due scheduled order does at a venue customers can't see. */
function world(merchant: Record<string, unknown>, env: Record<string, string> = { RESTAURANTS_ENABLED: "true" }) {
  const orderUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const events: unknown[] = [];
  const prisma = {
    orderSchedule: {
      findMany: async () => [
        {
          orderId: "o1",
          scheduledFor: new Date("2026-10-24T12:00:00Z"),
          order: {
            status: "requested",
            merchantPhase: "awaiting_accept",
            customerId: "c1",
            merchantId: "m1",
            merchantPaymentMethod: "cash",
            merchant: { name: "Mama's Kitchen", businessType: "restaurant", autoAccept: true, busyMode: false, prepBaselineMinutes: 20, pilotEnabled: true, applicationStatus: "live", ...merchant },
          },
        },
      ],
      updateMany: async () => ({ count: 1 }),
    },
    order: {
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => (orderUpdates.push(args), { count: 1 }),
    },
    merchantOrderItem: { updateMany: async () => ({ count: 1 }) },
    orderEvent: { create: async (args: unknown) => events.push(args) },
  };
  const notifyProfiles = vi.fn(async () => new Set<string>());
  const gateway = new Proxy({}, { get: () => vi.fn() });
  const svc = new OrderScheduleService(
    prisma as unknown as PrismaService,
    { notifyProfiles } as unknown as NotificationsService,
    gateway as unknown as TrackingGateway,
    env as never,
  );
  return { svc, orderUpdates, events, notifyProfiles };
}

describe("OrderScheduleService.sweepDueRings — a venue that is no longer live", () => {
  it("a suspended venue doesn't start the order: it is cancelled as the venue couldn't take it, and the customer told", async () => {
    const w = world({ pilotEnabled: false, applicationStatus: "suspended" });
    expect(await w.svc.sweepDueRings(new Date("2026-10-24T11:40:00Z"))).toEqual({ rung: 0 });
    expect(w.orderUpdates).toHaveLength(1);
    expect(w.orderUpdates[0]!.data).toMatchObject({ status: "cancelled", rejectionReason: "shop_closed", merchantPhase: null, cancelledByRole: "system" });
    expect(w.orderUpdates[0]!.data).not.toHaveProperty("autoAccepted");
    expect(w.events).toEqual([{ data: { orderId: "o1", status: "cancelled" } }]);
    expect(w.notifyProfiles).toHaveBeenCalledWith(["c1"], expect.objectContaining({ title: "Mama's Kitchen couldn’t take your order" }));
  });

  it("a live venue still starts it (auto-accept cooks it)", async () => {
    const w = world({});
    expect(await w.svc.sweepDueRings(new Date("2026-10-24T11:40:00Z"))).toEqual({ rung: 1 });
    expect(w.orderUpdates[0]!.data).toMatchObject({ merchantPhase: "preparing", autoAccepted: true });
  });

  it("with the restaurants kill switch off, it rings for the venue to accept by hand instead of cooking on its own", async () => {
    const w = world({}, { RESTAURANTS_ENABLED: "false" });
    expect(await w.svc.sweepDueRings(new Date("2026-10-24T11:40:00Z"))).toEqual({ rung: 1 });
    expect(w.orderUpdates[0]!.data).toMatchObject({ acceptDeadlineAt: expect.any(Date) });
    expect(w.orderUpdates[0]!.data).not.toHaveProperty("autoAccepted");
  });
});
