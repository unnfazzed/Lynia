import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { AdminKitchenService } from "./admin-kitchen.service";

// Auto-accept: the ops call list (docs/plans/2026-09-30-restaurant-auto-accept.md).

const gateway = { emitFoodQueueChanged: vi.fn() } as unknown as TrackingGateway;
const row = (id: string, minutesAgo: number, urgent: boolean) => ({
  id,
  createdAt: new Date(Date.now() - minutesAgo * 60_000),
  dropoff: { point: { lat: 0, lng: 0 }, landmark: "Blue gate", contactPhone: "+263779999999" },
  prepMinutes: 20,
  merchantGoodsTotal: 10,
  deliveryFee: 2.5,
  kitchenEscalatedAt: urgent ? new Date() : null,
  opsNoAnswerAt: [],
  itemsEditedAt: null,
  merchant: { id: "m1", name: "Mama's Kitchen", location: { point: { lat: 0, lng: 0 }, contactPhone: "+263771234567" }, ownerProfile: null },
  customer: { firstName: "Tendai", lastName: "M" },
  merchantItems: [{ id: "i1", nameSnapshot: "Sadza", priceUsd: 5, quantity: 2, note: null, available: true }],
});

describe("AdminKitchenService", () => {
  it("lists unconfirmed auto-accepted orders, urgent first, with both phone numbers", async () => {
    let where: Record<string, unknown> | undefined;
    const prisma = {
      order: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return [row("old-calm", 3, false), row("urgent", 6, true)];
        },
      },
    } as unknown as PrismaService;
    const res = await new AdminKitchenService(prisma, gateway).listToConfirm();
    expect(where).toMatchObject({ autoAccepted: true, kitchenConfirmedAt: null });
    expect(res.orders.map((o) => o.orderId)).toEqual(["urgent", "old-calm"]);
    expect(res.orders[0]).toMatchObject({
      restaurant: { name: "Mama's Kitchen", phone: "+263771234567" },
      customer: { name: "Tendai M", phone: "+263779999999" },
      total: 12.5,
      urgent: true,
    });
  });

  it("confirm is audited, and 409s when there is nothing left to confirm", async () => {
    let audited: Record<string, unknown> | undefined;
    const prisma = {
      order: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ merchantId: "m1" }) },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => ((audited = data), { id: "a1" }) },
    } as unknown as PrismaService;
    const svc = new AdminKitchenService(prisma, gateway);
    expect(await svc.confirm("ops@lynia", "o1")).toMatchObject({ confirmed: true, auditId: "a1" });
    expect(audited).toMatchObject({ action: "order.kitchen_confirm", target: "o1" });

    const done = { order: { updateMany: async () => ({ count: 0 }) } } as unknown as PrismaService;
    await expect(new AdminKitchenService(done, gateway).confirm("ops@lynia", "o1")).rejects.toMatchObject({ response: { reason: "nothing_to_confirm" } });
  });

  it("no answer appends a call to the order's log", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      order: { updateMany: async (args: { data: Record<string, unknown> }) => ((data = args.data), { count: 1 }) },
      auditLog: { create: async () => ({ id: "a2" }) },
    } as unknown as PrismaService;
    await new AdminKitchenService(prisma, gateway).logNoAnswer("ops@lynia", "o1");
    expect(data).toEqual({ opsNoAnswerAt: { push: expect.any(Date) } });
  });
});
