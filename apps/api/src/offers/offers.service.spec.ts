import { Prisma } from "@prisma/client";
import type { MakeOfferRequest } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OffersService } from "./offers.service";

/** Push is fire-and-forget; a no-op stub keeps these unit tests off the notification path. */
const noopNotifications = { notifyNewOffer: async () => {} } as unknown as NotificationsService;

/** Fake WS gateway — the offers-changed signal is best-effort; spy on it, never hit a real socket. */
function fakeGateway() {
  return { emitOffersChanged: vi.fn(), emitBoardNewOrder: vi.fn() };
}

/** Per-test Prisma fake — only the methods makeOffer/listForOrder touch. No DB. */
function svc(prisma: Partial<Record<string, unknown>>, gateway = fakeGateway()) {
  return {
    service: new OffersService(prisma as unknown as PrismaService, noopNotifications, gateway as unknown as TrackingGateway),
    gateway,
  };
}

const offerInput: MakeOfferRequest = {
  orderId: "11111111-1111-1111-1111-111111111111",
  type: "accept",
  offeredFare: 2.5,
  etaMinutes: 10,
};

describe("OffersService.makeOffer", () => {
  it("404s when the order does not exist", async () => {
    const { service, gateway } = svc({ order: { findUnique: async () => null } });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/order not found/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("409s when the order is not open for offers", async () => {
    const { service, gateway } = svc({ order: { findUnique: async () => ({ status: "assigned" }) } });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not open for offers/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the caller is not a rider", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => null },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not a rider/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the rider is not verified", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "pending", isOnline: true }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not verified/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the rider is offline", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: false }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/go online/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("409s on the one-round-per-rider unique violation (P2002)", async () => {
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true }) },
      offer: { create: async () => { throw dup; } },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/already responded/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("creates the offer and serializes the fare to a string", async () => {
    const { service } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true }) },
      offer: {
        create: async () => ({
          id: "o1",
          type: "accept",
          offeredFare: { toString: () => "2.50" },
          etaMinutes: 10,
          status: "pending",
        }),
      },
    });
    const res = await service.makeOffer(offerInput, "rider-1");
    expect(res).toEqual({ id: "o1", type: "accept", offeredFare: "2.50", etaMinutes: 10, status: "pending" });
  });

  it("signals offers:changed for the order room on a successful offer", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", customerId: "cust-1" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true }) },
      offer: {
        create: async () => ({
          id: "o1",
          type: "accept",
          offeredFare: { toString: () => "2.50" },
          etaMinutes: 10,
          status: "pending",
        }),
      },
    });
    await service.makeOffer(offerInput, "rider-1");
    expect(gateway.emitOffersChanged).toHaveBeenCalledWith(offerInput.orderId);
  });

  it("never fails the offer when the offers:changed push throws", async () => {
    const gateway = {
      emitOffersChanged: vi.fn(() => { throw new Error("socket down"); }),
      emitBoardNewOrder: vi.fn(),
    };
    const { service } = svc(
      {
        order: { findUnique: async () => ({ status: "open_for_offers", customerId: "cust-1" }) },
        rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true }) },
        offer: {
          create: async () => ({
            id: "o1",
            type: "accept",
            offeredFare: { toString: () => "2.50" },
            etaMinutes: 10,
            status: "pending",
          }),
        },
      },
      gateway,
    );
    await expect(service.makeOffer(offerInput, "rider-1")).resolves.toMatchObject({ id: "o1" });
    expect(gateway.emitOffersChanged).toHaveBeenCalled();
  });
});

describe("OffersService.listForOrder", () => {
  it("serializes each offer's Decimal fare to a string", async () => {
    const { service } = svc({
      offer: {
        findMany: async () => [
          { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r1" } },
        ],
      },
    });
    const res = await service.listForOrder("order-1");
    expect(res[0]!.offeredFare).toBe("3.00");
  });
});
