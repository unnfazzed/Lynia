import { Prisma } from "@prisma/client";
import type { MakeOfferRequest } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { OffersService } from "./offers.service";

/** Per-test Prisma fake — only the methods makeOffer/listForOrder touch. No DB. */
function svc(prisma: Partial<Record<string, unknown>>) {
  return new OffersService(prisma as unknown as PrismaService);
}

const offerInput: MakeOfferRequest = {
  orderId: "11111111-1111-1111-1111-111111111111",
  type: "accept",
  offeredFare: 2.5,
  etaMinutes: 10,
};

describe("OffersService.makeOffer", () => {
  it("404s when the order does not exist", async () => {
    const s = svc({ order: { findUnique: async () => null } });
    await expect(s.makeOffer(offerInput, "rider-1")).rejects.toThrow(/order not found/i);
  });

  it("409s when the order is not open for offers", async () => {
    const s = svc({ order: { findUnique: async () => ({ status: "assigned" }) } });
    await expect(s.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not open for offers/i);
  });

  it("403s when the caller is not a rider", async () => {
    const s = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => null },
    });
    await expect(s.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not a rider/i);
  });

  it("403s when the rider is not verified", async () => {
    const s = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "pending", isOnline: true }) },
    });
    await expect(s.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not verified/i);
  });

  it("409s on the one-round-per-rider unique violation (P2002)", async () => {
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const s = svc({
      order: { findUnique: async () => ({ status: "open_for_offers" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true }) },
      offer: { create: async () => { throw dup; } },
    });
    await expect(s.makeOffer(offerInput, "rider-1")).rejects.toThrow(/already responded/i);
  });

  it("creates the offer and serializes the fare to a string", async () => {
    const s = svc({
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
    const res = await s.makeOffer(offerInput, "rider-1");
    expect(res).toEqual({ id: "o1", type: "accept", offeredFare: "2.50", etaMinutes: 10, status: "pending" });
  });
});

describe("OffersService.listForOrder", () => {
  it("serializes each offer's Decimal fare to a string", async () => {
    const s = svc({
      offer: {
        findMany: async () => [
          { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r1" } },
        ],
      },
    });
    const res = await s.listForOrder("order-1");
    expect(res[0]!.offeredFare).toBe("3.00");
  });
});
