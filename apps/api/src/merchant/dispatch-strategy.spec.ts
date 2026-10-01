import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingService } from "../tracking/tracking.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";

function build(
  nearby: Array<{ profileId: string; distanceM: number }>,
  busyIds: string[] = [],
  owingDebtIds: string[] = [],
  ratings: Record<string, number> = {},
) {
  const tracking = { nearbyRiders: async () => nearby } as unknown as TrackingService;
  const prisma = {
    order: {
      // Two lookups, told apart by their WHERE shape: the C4 debt/handshake query has an `OR`.
      findMany: async (args: { where: Record<string, unknown> }) =>
        "OR" in args.where ? owingDebtIds.map((riderId) => ({ riderId })) : busyIds.map((riderId) => ({ riderId })),
    },
    rider: {
      findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.map((profileId) => ({ profileId, ratingAvg: ratings[profileId] ?? 0 })),
    },
  } as unknown as PrismaService;
  return new NearestRiderDispatchStrategy(tracking, prisma);
}

const ids = (list: Array<{ riderId: string }>) => list.map((c) => c.riderId);

describe("NearestRiderDispatchStrategy.pickCandidates — the restaurant's own riders (merchant web upgrade L3)", () => {
  const at = { lat: 0, lng: 0, radiusM: 5000, excludeRiderIds: [] as string[], limit: null };

  it("puts one of the restaurant's riders first when they're within 2 km of the nearest", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 2200 },
    ]);
    expect(await strategy.pickCandidates({ ...at, preferredRiderIds: ["mine"] })).toEqual([
      { riderId: "mine", distanceM: 2200, preferred: true },
      { riderId: "near", distanceM: 300 },
    ]);
  });

  it("keeps nearest-first when the restaurant's own is more than 2 km farther (food goes cold)", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 2400 },
    ]);
    expect(ids(await strategy.pickCandidates({ ...at, preferredRiderIds: ["mine"] }))).toEqual(["near", "mine"]);
  });

  it("never lets preferred bend eligibility: a busy, excluded or owing rider of the restaurant's is left out", async () => {
    const nearby = [
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 800 },
    ];
    expect(ids(await build(nearby, ["mine"]).pickCandidates({ ...at, preferredRiderIds: ["mine"] }))).toEqual(["near"]);
    expect(ids(await build(nearby, [], ["mine"]).pickCandidates({ ...at, preferredRiderIds: ["mine"] }))).toEqual(["near"]);
    expect(ids(await build(nearby).pickCandidates({ ...at, excludeRiderIds: ["mine"], preferredRiderIds: ["mine"] }))).toEqual(["near"]);
    // Not nearby at all (offline, unverified, held: nearbyRiders never returns them) — nothing to prefer.
    expect(ids(await build([{ profileId: "near", distanceM: 300 }]).pickCandidates({ ...at, preferredRiderIds: ["mine"] }))).toEqual(["near"]);
  });

  it("orders several of the restaurant's riders by distance, then rating", async () => {
    const nearby = [
      { profileId: "near", distanceM: 200 },
      { profileId: "a", distanceM: 900 },
      { profileId: "b", distanceM: 950 },
      { profileId: "c", distanceM: 1500 },
    ];
    // a and b are about as far (same 100 m band): the better-rated goes first.
    expect(ids(await build(nearby, [], [], { a: 4.2, b: 4.9, c: 5 }).pickCandidates({ ...at, preferredRiderIds: ["a", "b", "c"] }))).toEqual(["b", "a", "c", "near"]);
    // Otherwise the nearer goes first, whatever the rating.
    expect(ids(await build(nearby, [], [], { a: 4.2, c: 5 }).pickCandidates({ ...at, preferredRiderIds: ["a", "c"] }))).toEqual(["a", "c", "near", "b"]);
  });

  it("is exactly nearest-first with no riders of the restaurant's own", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "far", distanceM: 900 },
    ]);
    expect(ids(await strategy.pickCandidates({ ...at, preferredRiderIds: [] }))).toEqual(["near", "far"]);
    expect(ids(await strategy.pickCandidates(at))).toEqual(["near", "far"]);
  });

  it("caps the list at `limit` after ordering, so the restaurant's own riders survive the cut", async () => {
    const nearby = Array.from({ length: 12 }, (_, i) => ({ profileId: `r${i}`, distanceM: 100 + i * 100 }));
    const top = await build(nearby).pickCandidates({ ...at, preferredRiderIds: ["r11"], limit: 10 });
    expect(top).toHaveLength(10);
    expect(top[0]).toEqual({ riderId: "r11", distanceM: 1200, preferred: true });
    expect(ids(top).slice(1)).toEqual(["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"]);
  });
});

describe("NearestRiderDispatchStrategy.pickCandidates", () => {
  const at = { lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] as string[], limit: null };

  it("returns nobody when nothing is nearby", async () => {
    expect(await build([]).pickCandidates(at)).toEqual([]);
  });

  it("lists every eligible rider nearest-first (nearbyRiders is already nearest-first)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    expect(await strategy.pickCandidates(at)).toEqual([
      { riderId: "r1", distanceM: 400 },
      { riderId: "r2", distanceM: 900 },
    ]);
  });

  it("leaves out a rider who passed on or dropped this order (excluded this cycle)", async () => {
    const strategy = build([
      { profileId: "r1", distanceM: 400 },
      { profileId: "r2", distanceM: 900 },
    ]);
    expect(ids(await strategy.pickCandidates({ ...at, excludeRiderIds: ["r1"] }))).toEqual(["r2"]);
  });

  it("leaves out a rider currently on an active ride (would fail one_active_ride anyway)", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], ["r1"]);
    expect(ids(await strategy.pickCandidates(at))).toEqual(["r2"]);
  });

  // C4: a rider owing a merchant a collect-and-return debt, or mid-doorstep handshake, isn't offered a
  // SECOND food job until it settles (N-20/R-05).
  it("leaves out a rider owing an open merchant debt / mid-handshake", async () => {
    const strategy = build([{ profileId: "r1", distanceM: 400 }, { profileId: "r2", distanceM: 900 }], [], ["r1"]);
    expect(ids(await strategy.pickCandidates(at))).toEqual(["r2"]);
  });

  it("returns nobody when every nearby rider is excluded/busy", async () => {
    expect(await build([{ profileId: "r1", distanceM: 400 }], ["r1"]).pickCandidates(at)).toEqual([]);
  });
});
