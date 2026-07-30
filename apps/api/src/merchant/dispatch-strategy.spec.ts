import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingService } from "../tracking/tracking.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";

function build(
  nearby: Array<{ profileId: string; distanceM: number }>,
  busyIds: string[] = [],
  offeredElsewhereIds: string[] = [],
  owingDebtIds: string[] = [],
) {
  const tracking = { nearbyRiders: async () => nearby } as unknown as TrackingService;
  const prisma = {
    order: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        // Distinguish the three lookups by their WHERE shape: the C4 debt/handshake query is the only
        // one that filters on orderType; of the remaining two, dispatchOfferedRiderId is the "offered
        // elsewhere" lookup and plain riderId is the "busy" (active-ride) lookup.
        if ("orderType" in args.where) return owingDebtIds.map((riderId) => ({ riderId }));
        if ("riderId" in args.where) return busyIds.map((riderId) => ({ riderId }));
        return offeredElsewhereIds.map((dispatchOfferedRiderId) => ({ dispatchOfferedRiderId }));
      },
    },
  } as unknown as PrismaService;
  return new NearestRiderDispatchStrategy(tracking, prisma);
}

describe("NearestRiderDispatchStrategy.pickCandidate", () => {
  it("returns null when nothing is nearby", async () => {
    const strategy = build([]);
    expect(await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] })).toBeNull();
  });

  it("picks the nearest eligible rider (nearbyRiders is already nearest-first)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    const res = await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] });
    expect(res).toEqual({ riderId: "r1", distanceM: 400 });
  });

  it("skips an already-excluded rider (tried this dispatch cycle)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    const res = await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: ["r1"] });
    expect(res).toEqual({ riderId: "r2", distanceM: 900 });
  });

  it("skips a rider currently on an active ride (would fail one_active_ride anyway)", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], ["r1"]);
    const res = await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] });
    expect(res).toEqual({ riderId: "r2", distanceM: 900 });
  });

  it("skips a rider already holding a DIFFERENT live food offer", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], [], ["r1"]);
    const res = await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] });
    expect(res).toEqual({ riderId: "r2", distanceM: 900 });
  });

  it("returns null when every nearby rider is excluded/busy/already-offered", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }], ["r1"]);
    expect(await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] })).toBeNull();
  });

  // C4: a rider owing a merchant a collect-and-return debt, or mid-doorstep handshake, isn't offered a
  // SECOND food job until it settles (N-20/R-05) — same soft-lock shape as the offered-elsewhere check.
  it("skips a rider owing an open merchant debt / mid-handshake", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], [], [], ["r1"]);
    const res = await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] });
    expect(res).toEqual({ riderId: "r2", distanceM: 900 });
  });
});
