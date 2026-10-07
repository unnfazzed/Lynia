import { describe, expect, it } from "vitest";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { OrderLifecycleService } from "../orders/order-lifecycle.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { FoodDebtService } from "./food-debt.service";
import { editOrderItems } from "./food-order-ops";
import { FoodOrderService } from "./food-order.service";

/**
 * C9 (reviewed list 2026-10-07: U13, U35, U37): one server-computed amount due on a merchant order. The
 * order read (`amountDueUsd`, `total`), the doorstep handshake and the "updated your order" push all quote
 * the agreed total plus any carried owed balance — the same figure, never three different ones.
 */

const tokens = new TokenService({ JWT_SIGNING_SECRET: "amount-due-test-secret-0123456789abcdef", ACCESS_TTL_SECONDS: 900 } as Env);

/** A delivered-in-progress cash merchant order: $6.50 goods + $1.50 delivery = $8.00 agreed. */
function orderRow(over: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    merchantId: "m1",
    customerId: "c1",
    riderId: "r1",
    status: "en_route_dropoff",
    merchantPhase: null,
    merchantPaymentMethod: "cash",
    merchantItems: [{ id: "i1", dishId: "d1", nameSnapshot: "Sadza", priceUsd: 6.5, quantity: 1, note: null, available: true, rxRequired: false, replacesItemId: null }],
    merchantGoodsTotal: 6.5,
    deliveryFee: 1.5,
    merchantDeliveryShare: null,
    agreedFare: 8,
    customerCashConfirmedAt: null,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    carriedBalance: [],
    ...over,
  };
}

function orderService(row: Record<string, unknown>) {
  const prisma = { order: { findFirst: async () => row, findUnique: async () => row } };
  return new FoodOrderService(
    prisma as unknown as PrismaService,
    tokens,
    {} as NotificationsService,
    {} as FoodDebtService,
    {} as unknown as TrackingGateway,
    {} as PaymentRail,
  );
}

/** What the doorstep handshake records for the same row. */
async function handshakeAmount(row: Record<string, unknown>): Promise<number> {
  let amount: number | undefined;
  const prisma = {
    order: {
      findFirst: async () => row,
      updateMany: async (a: { data: { cashHandshakeAmount: number } }) => {
        amount = a.data.cashHandshakeAmount;
        return { count: 1 };
      },
    },
  };
  const debt = new FoodDebtService(prisma as unknown as PrismaService, { notifyProfiles: async () => undefined } as unknown as NotificationsService, {} as OrderLifecycleService);
  await debt.confirmCustomerCash(String(row.id), "c1");
  return amount!;
}

describe("C9 — one amount due on a merchant order", () => {
  it("without a carried balance: amountDueUsd = total = the agreed fare = the handshake", async () => {
    const row = orderRow();
    const res = await orderService(row).getMyOrder(String(row.id), "c1");
    expect(res.amountDueUsd).toBe(8);
    expect(res.total).toBe(8);
    expect(res.previousBalanceUsd).toBeUndefined();
    expect(await handshakeAmount(row)).toBe(8);
  });

  it("with a carried balance: the order read, its total and the handshake all add it once", async () => {
    const row = orderRow({ carriedBalance: [{ amount: "10.00" }] });
    const res = await orderService(row).getMyOrder(String(row.id), "c1");
    expect(res.previousBalanceUsd).toBe(10);
    expect(res.amountDueUsd).toBe(18);
    expect(res.total).toBe(18);
    expect(await handshakeAmount(row)).toBe(18);
  });

  it("U37: the read's total follows agreedFare (what the handshake collects), not a rebuilt goods + fee", async () => {
    // An order whose agreedFare was corrected before merchant adjustFare was refused: goods + fee still say
    // $8.00 but the handshake collects $7.00 (+ the carried $2.00). The screen must say the same.
    const row = orderRow({ agreedFare: 7, carriedBalance: [{ amount: 2 }] });
    const res = await orderService(row).getMyOrder(String(row.id), "c1");
    expect(res.amountDueUsd).toBe(9);
    expect(res.total).toBe(9);
    expect(await handshakeAmount(row)).toBe(9);
  });

  it("U13: the 'updated your order' push quotes the new agreed total plus the carried balance", async () => {
    const sent: Array<{ title: string; body: string }> = [];
    const row = orderRow({
      status: "requested",
      merchantPhase: "preparing",
      merchantItems: [
        { id: "i1", priceUsd: 6.5, quantity: 2, available: true },
        { id: "i2", priceUsd: 3, quantity: 1, available: true },
      ],
      merchant: { name: "Gava’s Kitchen" },
      substitutionRounds: [],
      carriedBalance: [{ amount: "10.00" }],
    });
    const prisma = {
      order: { findFirst: async () => row, updateMany: async () => ({ count: 1 }) },
      merchantOrderItem: { update: async () => ({}) },
      $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
    };
    const notifications = {
      notifyProfiles: async (_ids: string[], msg: { title: string; body: string }) => {
        sent.push(msg);
      },
    } as unknown as NotificationsService;
    const gateway = { emitFoodQueueChanged: () => undefined } as unknown as TrackingGateway;
    // Take the $3.00 line off: goods $13.00 + $1.50 delivery = $14.50 agreed, + $10.00 carried.
    await editOrderItems(prisma as unknown as PrismaService, notifications, gateway, String(row.id), { lines: [{ itemId: "i2", quantity: 0 }] });
    expect(sent).toEqual([expect.objectContaining({ body: "New total $24.50, cash at the door." })]);
  });
});
