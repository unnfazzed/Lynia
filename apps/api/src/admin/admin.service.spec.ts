import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService, computeFunnel } from "./admin.service";

describe("computeFunnel (pilot metrics §8)", () => {
  it("computes the offer-loop funnel", () => {
    const f = computeFunnel({ totalBroadcasts: 10, totalOffers: 25, ordersWithOffer: 8, expired: 2 });
    expect(f.offersPerBroadcast).toBe(2.5);
    expect(f.pctBroadcastsWithOffer).toBe(80);
    expect(f.expiryRatePct).toBe(20);
  });

  it("is zero-safe with no broadcasts", () => {
    const f = computeFunnel({ totalBroadcasts: 0, totalOffers: 0, ordersWithOffer: 0, expired: 0 });
    expect(f).toEqual({ totalBroadcasts: 0, offersPerBroadcast: 0, pctBroadcastsWithOffer: 0, expiryRatePct: 0 });
  });
});

describe("AdminService.listRiders", () => {
  it("filters by kyc status and shapes the row for the queue", async () => {
    let where: unknown;
    const prisma = {
      rider: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              profileId: "r1",
              bikeReg: "ABZ 1",
              kycStatus: "pending",
              kycRef: "sess_1",
              idVerified: false,
              isOnline: false,
              ratingAvg: 0,
              ratingCount: 0,
              tripsCount: 0,
              cancelStrikes: 0,
              cooldownUntil: null,
              profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" },
            },
          ];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listRiders("pending");
    expect(where).toEqual({ kycStatus: "pending" });
    expect(rows[0]).toMatchObject({ profileId: "r1", name: "Tendai M", phone: "+263782000001", kycStatus: "pending" });
  });

  it("returns all riders when no filter is given", async () => {
    let where: unknown = "unset";
    const prisma = { rider: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } } };
    const svc = new AdminService(prisma as unknown as PrismaService);
    await svc.listRiders();
    expect(where).toEqual({});
  });
});

describe("AdminService.listOrders", () => {
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
              riderId: "r1",
              cancelledBy: "r1",
              cancelReason: "cannot make it",
              createdAt: new Date("2026-06-26T00:00:00Z"),
            },
          ];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listOrders("cancelled");
    expect(where).toEqual({ status: "cancelled" });
    expect(rows[0]).toMatchObject({ id: "o1", status: "cancelled", proposedFare: "2.50", agreedFare: null, cancelReason: "cannot make it" });
  });
});
