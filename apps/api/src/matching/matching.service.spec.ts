import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { MetricsService, MatchSelectOutcome } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { MatchingService } from "./matching.service";

/**
 * selectOffer wraps its transaction in a metrics timer. The wrapper MUST classify the failure for the
 * metric and then RE-THROW the original domain exception — a swallowed error would break the
 * "rider just taken" rollback UX. These tests assert both: the metric is recorded with the mapped
 * outcome, and the exception still propagates.
 */

const noopNotifications = { notifyOrderStatus: async () => {} } as unknown as NotificationsService;
const noopTokens = { randomOtp: () => "000000", hash: (s: string) => s } as unknown as TokenService;

function fakeMetrics() {
  return { startTimer: () => () => 7, recordMatchSelect: vi.fn() } as unknown as MetricsService & {
    recordMatchSelect: ReturnType<typeof vi.fn>;
  };
}

/** A Prisma fake whose $transaction runs the passed callback against a per-test `tx` object. */
function svc(tx: Record<string, unknown>) {
  const metrics = fakeMetrics();
  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { service: new MatchingService(prisma, noopTokens, noopNotifications, metrics), metrics };
}

const orderId = "11111111-1111-1111-1111-111111111111";
const offerId = "22222222-2222-2222-2222-222222222222";

describe("MatchingService.selectOffer — metric wrapper re-throws domain errors", () => {
  it("re-throws NotFound when the offer is missing (outcome=error) — not swallowed", async () => {
    const { service, metrics } = svc({ offer: { findFirst: async () => null } });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/offer not found/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "error" satisfies MatchSelectOutcome);
  });

  it("re-throws Forbidden when the caller is not the order's customer (outcome=forbidden)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "someone-else" },
          rider: { isOnline: true, lastHeartbeatAt: new Date() },
        }),
      },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toBeInstanceOf(ForbiddenException);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "forbidden" satisfies MatchSelectOutcome);
  });

  it("re-throws Conflict when the order is no longer open (outcome=not_open)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "assigned", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date() },
        }),
      },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/no longer open/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "not_open" satisfies MatchSelectOutcome);
  });

  it("re-throws Conflict when the offer is no longer available (outcome=unavailable)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "declined",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date() },
        }),
      },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/no longer available/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "unavailable" satisfies MatchSelectOutcome);
  });

  it("records outcome=assigned on the happy path and returns the delivery code", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date() },
        }),
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
      order: { updateMany: async () => ({ count: 1 }) },
      orderEvent: { create: async () => ({}) },
    });
    const res = await service.selectOffer(orderId, offerId, "cust");
    expect(res).toMatchObject({ orderId, riderId: "r1", status: "assigned", deliveryCode: "000000" });
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "assigned" satisfies MatchSelectOutcome);
  });
});
