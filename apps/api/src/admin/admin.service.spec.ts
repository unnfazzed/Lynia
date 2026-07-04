import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
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
  const riderRow = (over: Record<string, unknown> = {}) => ({
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
    ...over,
  });

  it("filters by kyc status and MASKS the phone when the rider isn't on a live order (A-03)", async () => {
    let where: unknown;
    const prisma = {
      rider: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [riderRow()];
        },
      },
      // No order in a reveal-status window ⇒ the phone must be masked.
      order: { findMany: async () => [] },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listRiders("pending");
    expect(where).toEqual({ kycStatus: "pending" });
    expect(rows[0]).toMatchObject({ profileId: "r1", name: "Tendai M", kycStatus: "pending" });
    // Masked: country code + last 4 kept, middle bulleted — never the full number.
    expect(rows[0]!.phone).toBe("+263•••••0001");
    expect(rows[0]!.phone).not.toContain("78200");
  });

  it("REVEALS the full phone when the rider is a party on a LIVE order right now", async () => {
    let orderWhere: { status?: { in: string[] } } = {};
    const prisma = {
      rider: { findMany: async () => [riderRow()] },
      // The rider is currently on a live order → reveal the real number for ops to call them.
      order: {
        findMany: async (args: { where: { status?: { in: string[] } } }) => {
          orderWhere = args.where;
          return [{ riderId: "r1" }];
        },
      },
    };
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listRiders();
    expect(rows[0]!.phone).toBe("+263782000001");
    // The reveal set MUST be live-only (ACTIVE_RIDE_STATUSES) — NOT the terminal-inclusive
    // PHONE_REVEAL_STATUSES, which would unmask any rider who ever completed one order forever (A-03).
    expect(orderWhere.status?.in).toEqual(ACTIVE_RIDE_STATUSES);
    for (const terminal of ["completed", "delivered", "undelivered"]) {
      expect(orderWhere.status?.in).not.toContain(terminal);
    }
  });

  it("returns all riders when no filter is given", async () => {
    let where: unknown = "unset";
    const prisma = {
      rider: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
      order: { findMany: async () => [] },
    };
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
    const svc = new AdminService(prisma as unknown as PrismaService);
    const rows = await svc.listOrders("cancelled");
    expect(where).toEqual({ status: "cancelled" });
    expect(rows[0]).toMatchObject({ id: "o1", status: "cancelled", proposedFare: "2.50", agreedFare: null, cancelledByRole: "rider", cancelReason: "cannot make it" });
  });
});
