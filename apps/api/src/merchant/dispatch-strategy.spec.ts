import { afterEach, describe, expect, it, vi } from "vitest";
import { BROADCAST } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingService } from "../tracking/tracking.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";

function build(
  nearby: Array<{ profileId: string; distanceM: number }>,
  busyIds: string[] = [],
  owingDebtIds: string[] = [],
) {
  const tracking = { nearbyRiders: vi.fn(async () => nearby) } as unknown as TrackingService;
  const prisma = {
    order: {
      // Two lookups, told apart by their WHERE shape: the C4 debt/handshake query has an `OR`.
      findMany: async (args: { where: Record<string, unknown> }) =>
        "OR" in args.where ? owingDebtIds.map((riderId) => ({ riderId })) : busyIds.map((riderId) => ({ riderId })),
    },
  } as unknown as PrismaService;
  return Object.assign(new NearestRiderDispatchStrategy(tracking, prisma), { geo: tracking as unknown as { nearbyRiders: ReturnType<typeof vi.fn> } });
}

const ids = (list: Array<{ riderId: string }>) => list.map((c) => c.riderId);

describe("NearestRiderDispatchStrategy.pickCandidates", () => {
  const at = { lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] as string[], limit: null };

  it("returns nobody when nothing is nearby", async () => {
    expect(await build([]).pickCandidates(at)).toEqual([]);
  });

  it("lists every eligible biker nearest-first (nearbyRiders is already nearest-first)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    expect(await strategy.pickCandidates(at)).toEqual([
      { riderId: "r1", distanceM: 400 },
      { riderId: "r2", distanceM: 900 },
    ]);
  });

  it("leaves out a biker who passed on or dropped this order (excluded this cycle)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    expect(ids(await strategy.pickCandidates({ ...at, excludeRiderIds: ["r1"] }))).toEqual(["r2"]);
  });

  it("leaves out a biker currently on an active ride (would fail one_active_ride anyway)", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], ["r1"]);
    expect(ids(await strategy.pickCandidates(at))).toEqual(["r2"]);
  });

  // C4: a rider owing a merchant a collect-and-return debt, or mid-doorstep handshake, isn't offered a
  // SECOND food job until it settles (N-20/R-05).
  it("leaves out a biker owing an open merchant debt / mid-handshake", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], [], ["r1"]);
    expect(ids(await strategy.pickCandidates(at))).toEqual(["r2"]);
  });

  it("caps the list at `limit`, nearest first", async () => {
    const nearby = Array.from({ length: 12 }, (_, i) => ({ profileId: `r${i}`, distanceM: 100 + i * 100 }));
    expect(ids(await build(nearby).pickCandidates({ ...at, limit: 10 }))).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9"]);
  });

  it("returns nobody when every nearby biker is excluded/busy", async () => {
    expect(await build([{ profileId: "r1", distanceM: 400 }], ["r1"]).pickCandidates(at)).toEqual([]);
  });

  // Owner 2026-10-12: a rider with the app in their pocket stops heartbeating ~2 min after backgrounding
  // but is still online, and the offer's push wakes the phone — so food uses the parcel push cutoff, not
  // the strict ~120 s one, and the rest of nearbyRiders' filter (online, standing, KYC) still applies.
  describe("heartbeat cutoff", () => {
    afterEach(() => {
      delete process.env[BROADCAST.heartbeatMaxAgeForPushEnv];
    });

    it("asks nearbyRiders with the permissive push cutoff, within the round's radius", async () => {
      const strategy = build([{ profileId: "r1", distanceM: 400 }]);
      await strategy.pickCandidates(at);
      expect(strategy.geo.nearbyRiders).toHaveBeenCalledWith(0, 0, 1000, BROADCAST.heartbeatMaxAgeMsForPush);
      expect(BROADCAST.heartbeatMaxAgeMsForPush).toBeGreaterThan(BROADCAST.heartbeatMaxAgeMs);
    });

    it("follows the push cutoff's env override, like the parcel broadcast", async () => {
      process.env[BROADCAST.heartbeatMaxAgeForPushEnv] = "600000";
      const strategy = build([{ profileId: "r1", distanceM: 400 }]);
      await strategy.pickCandidates(at);
      expect(strategy.geo.nearbyRiders).toHaveBeenCalledWith(0, 0, 1000, 600_000);
    });
  });
});
