import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";

// FJ-H5: the rider's offer card (RD1) tells them what to collect at the door — including an earlier owed
// balance this order carries (`previousBalanceUsd` on the order read), or the figure falls short.

const tokens = new TokenService({ JWT_SIGNING_SECRET: "offer-job-info-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);

function build(row: Record<string, unknown> | null) {
  const prisma = { order: { findUnique: async () => row } };
  return new FoodOrderService(
    prisma as unknown as PrismaService,
    tokens,
    {} as NotificationsService,
    {} as FoodDebtService,
    {} as unknown as TrackingGateway,
    {} as PaymentRail,
  );
}

const BASE = { merchant: { businessType: "restaurant", shopKind: null }, schedule: null, prescription: null };

describe("offerJobInfo · the carried balance (FJ-H5)", () => {
  it("sums what the order carries", async () => {
    const svc = build({ ...BASE, carriedBalance: [{ amount: "10.50" }, { amount: 6 }] });
    expect(await svc.offerJobInfo("o1")).toEqual({ businessType: "restaurant", shopKind: null, scheduledFor: null, rx: false, carriedUsd: 16.5 });
  });

  it("leaves it out when nothing is carried", async () => {
    const svc = build({ ...BASE, carriedBalance: [] });
    expect(await svc.offerJobInfo("o1")).toEqual({ businessType: "restaurant", shopKind: null, scheduledFor: null, rx: false });
  });
});
