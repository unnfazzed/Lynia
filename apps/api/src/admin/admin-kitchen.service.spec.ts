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
  it("counts the call list with the list's own filter (console v2 §7 alert strip)", async () => {
    let where: Record<string, unknown> | undefined;
    const prisma = {
      order: {
        count: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return 4;
        },
      },
    } as unknown as PrismaService;
    expect(await new AdminKitchenService(prisma, gateway).countToConfirm()).toBe(4);
    expect(where).toMatchObject({ orderType: "merchant", autoAccepted: true, kitchenConfirmedAt: null });
  });

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

  it("D1 (24 h backlog): reads the newest rows so a fresh order never falls off, newest first among the urgent", async () => {
    let args: { orderBy?: unknown; take?: number } | undefined;
    const prisma = {
      order: {
        findMany: async (a: { orderBy?: unknown; take?: number }) => {
          args = a;
          return [row("fresh-urgent", 7, true), row("calm-b", 4, false), row("day-old", 20 * 60, true), row("calm-a", 2, false)];
        },
      },
    } as unknown as PrismaService;
    const res = await new AdminKitchenService(prisma, gateway).listToConfirm();
    // The DB cap must drop the stalest rows, not the newest (it used to be createdAt asc, take 100).
    expect(args!.orderBy).toEqual({ createdAt: "desc" });
    expect(args!.take).toBeGreaterThan(100);
    expect(res.orders.map((o) => o.orderId)).toEqual(["fresh-urgent", "day-old", "calm-b", "calm-a"]);
  });

  /** A fake whose `$transaction(cb)` runs on itself and records which writes ran inside it. */
  function withTx<T extends Record<string, unknown>>(fake: T) {
    const inTx: string[] = [];
    let open = false;
    const tracked = Object.fromEntries(
      Object.entries(fake).map(([model, methods]) => [
        model,
        Object.fromEntries(
          Object.entries(methods as Record<string, (...a: unknown[]) => unknown>).map(([m, fn]) => [
            m,
            (...a: unknown[]) => {
              if (open) inTx.push(`${model}.${m}`);
              return fn(...a);
            },
          ]),
        ),
      ]),
    );
    const prisma = {
      ...tracked,
      $transaction: async (cb: (tx: unknown) => unknown) => {
        open = true;
        try {
          return await cb(prisma);
        } finally {
          open = false;
        }
      },
    };
    return { prisma: prisma as unknown as PrismaService, inTx };
  }

  it("confirm is audited in the confirm's own transaction, and 409s (with no audit row) when there is nothing left to confirm", async () => {
    let audited: Record<string, unknown> | undefined;
    const { prisma, inTx } = withTx({
      order: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ merchantId: "m1" }) },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => ((audited = data), { id: "a1" }) },
    });
    const svc = new AdminKitchenService(prisma, gateway);
    expect(await svc.confirm("ops@lynia", "o1")).toMatchObject({ confirmed: true, auditId: "a1" });
    expect(audited).toMatchObject({ action: "order.kitchen_confirm", target: "o1", targetType: "order" });
    expect(inTx).toEqual(["order.updateMany", "auditLog.create"]);

    let wrote = false;
    const done = withTx({ order: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => ((wrote = true), { id: "x" }) } });
    await expect(new AdminKitchenService(done.prisma, gateway).confirm("ops@lynia", "o1")).rejects.toMatchObject({ response: { reason: "nothing_to_confirm" } });
    expect(wrote).toBe(false);
  });

  it("no answer appends a call to the order's log, audited in the same transaction", async () => {
    let data: Record<string, unknown> | undefined;
    const { prisma, inTx } = withTx({
      order: { updateMany: async (args: { data: Record<string, unknown> }) => ((data = args.data), { count: 1 }) },
      auditLog: { create: async () => ({ id: "a2" }) },
    });
    await new AdminKitchenService(prisma, gateway).logNoAnswer("ops@lynia", "o1");
    expect(data).toEqual({ opsNoAnswerAt: { push: expect.any(Date) } });
    expect(inTx).toEqual(["order.updateMany", "auditLog.create"]);
  });

  it("says when the call list is capped (the oldest orders are the ones left out)", async () => {
    const many = Array.from({ length: 300 }, (_, i) => row(`o${i}`, i, false));
    const prisma = { order: { findMany: async () => many } } as unknown as PrismaService;
    expect(await new AdminKitchenService(prisma, gateway).listToConfirm()).toMatchObject({ capped: true, cap: 300 });
    const few = { order: { findMany: async () => many.slice(0, 150) } } as unknown as PrismaService;
    expect(await new AdminKitchenService(few, gateway).listToConfirm()).toMatchObject({ capped: false });
  });

  it("order settings: audited with before and after, and auto-accept is refused for a shop", async () => {
    let audited: Record<string, unknown> | undefined;
    const merchant = { id: "m1", businessType: "restaurant", autoAccept: false, showPhoneToCustomers: false, freeDelivery: false };
    const fake = (m: typeof merchant) => {
      const p = {
        merchant: { findUnique: async () => m, update: async ({ data }: { data: Record<string, unknown> }) => ({ autoAccept: false, showPhoneToCustomers: false, freeDelivery: false, ...data }) },
        auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => ((audited = data), { id: "a3" }) },
        $transaction: async (cb: (tx: unknown) => unknown) => cb(p),
      };
      return p as unknown as PrismaService;
    };
    await new AdminKitchenService(fake(merchant), gateway).setOrderSettings("ops", "m1", { autoAccept: true });
    expect(audited).toMatchObject({ targetType: "merchant", before: { autoAccept: false }, after: { autoAccept: true } });
    await expect(new AdminKitchenService(fake({ ...merchant, businessType: "shop" }), gateway).setOrderSettings("ops", "m1", { autoAccept: true })).rejects.toMatchObject({
      response: { reason: "shop_no_auto_accept" },
    });
  });
});
