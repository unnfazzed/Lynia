import { describe, expect, it } from "vitest";
import { LIVE_FOOD_DISPATCH_OFFER_WHERE } from "../common/food-dispatch-lock";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingService } from "../tracking/tracking.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";

function build(
  nearby: Array<{ profileId: string; distanceM: number }>,
  busyIds: string[] = [],
  offeredElsewhereIds: string[] = [],
  owingDebtIds: string[] = [],
  ratings: Record<string, number> = {},
) {
  const tracking = { nearbyRiders: async () => nearby } as unknown as TrackingService;
  const prisma = {
    order: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        // Distinguish the three lookups by their WHERE shape. Both the "offered elsewhere" and C4
        // debt/handshake queries now spread LIVE_FOOD_DISPATCH_OFFER_WHERE (X2-OBS-2 fix — they used
        // to diverge on orderType/status), so `orderType` alone no longer uniquely identifies the debt
        // query: check `dispatchOfferedRiderId` (unique to "offered elsewhere") and `OR` (unique to the
        // debt query, its two-way cash/handshake condition) before falling back to "busy".
        if ("dispatchOfferedRiderId" in args.where) return offeredElsewhereIds.map((dispatchOfferedRiderId) => ({ dispatchOfferedRiderId }));
        if ("OR" in args.where) return owingDebtIds.map((riderId) => ({ riderId }));
        return busyIds.map((riderId) => ({ riderId }));
      },
    },
    rider: {
      findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.map((profileId) => ({ profileId, ratingAvg: ratings[profileId] ?? 0 })),
    },
  } as unknown as PrismaService;
  return new NearestRiderDispatchStrategy(tracking, prisma);
}

describe("NearestRiderDispatchStrategy.pickCandidate — the restaurant's own riders (merchant web upgrade L3)", () => {
  const at = { lat: 0, lng: 0, radiusM: 5000, excludeRiderIds: [] as string[] };

  it("offers one of the restaurant's riders first when they're within 2 km of the nearest", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 2200 },
    ]);
    expect(await strategy.pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "mine", distanceM: 2200, preferred: true });
  });

  it("offers the nearest rider when the restaurant's own is more than 2 km farther (food goes cold)", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 2400 },
    ]);
    expect(await strategy.pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
  });

  it("never lets preferred bend eligibility: a busy, excluded, already-offered or owing rider of the restaurant's is skipped", async () => {
    const nearby = [
      { profileId: "near", distanceM: 300 },
      { profileId: "mine", distanceM: 800 },
    ];
    expect(await build(nearby, ["mine"]).pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
    expect(await build(nearby, [], ["mine"]).pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
    expect(await build(nearby, [], [], ["mine"]).pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
    expect(await build(nearby).pickCandidate({ ...at, excludeRiderIds: ["mine"], preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
    // Not nearby at all (offline, unverified, held: nearbyRiders never returns them) — nothing to prefer.
    expect(await build([{ profileId: "near", distanceM: 300 }]).pickCandidate({ ...at, preferredRiderIds: ["mine"] })).toEqual({ riderId: "near", distanceM: 300 });
  });

  it("orders several of the restaurant's riders by distance, then rating", async () => {
    const nearby = [
      { profileId: "near", distanceM: 200 },
      { profileId: "a", distanceM: 900 },
      { profileId: "b", distanceM: 950 },
      { profileId: "c", distanceM: 1500 },
    ];
    // a and b are about as far (same 100 m band): the better-rated goes first.
    expect(await build(nearby, [], [], [], { a: 4.2, b: 4.9, c: 5 }).pickCandidate({ ...at, preferredRiderIds: ["a", "b", "c"] })).toEqual({
      riderId: "b",
      distanceM: 950,
      preferred: true,
    });
    // Otherwise the nearer goes first, whatever the rating.
    expect(await build(nearby, [], [], [], { a: 4.2, c: 5 }).pickCandidate({ ...at, preferredRiderIds: ["a", "c"] })).toEqual({
      riderId: "a",
      distanceM: 900,
      preferred: true,
    });
  });

  it("is exactly nearest-first with no riders of the restaurant's own", async () => {
    const strategy = build([
      { profileId: "near", distanceM: 300 },
      { profileId: "far", distanceM: 900 },
    ]);
    expect(await strategy.pickCandidate({ ...at, preferredRiderIds: [] })).toEqual({ riderId: "near", distanceM: 300 });
    expect(await strategy.pickCandidate(at)).toEqual({ riderId: "near", distanceM: 300 });
  });
});

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

  // LM-01 (order-assignment audit, X2-OBS-2 fix): the "offered elsewhere" query used to omit the
  // orderType/status half of the live-offer definition that common/food-dispatch-lock.ts's own
  // single-rider check always applied — harmless only because nothing but food dispatch currently
  // ever sets dispatchOfferedRiderId, but a latent drift the moment that stops being true. Pin that
  // the query now spreads the SAME shared predicate as hasLiveFoodDispatchOffer.
  it("scopes the offered-elsewhere query to LIVE_FOOD_DISPATCH_OFFER_WHERE (orderType=merchant, status=open_for_offers)", async () => {
    const tracking = { nearbyRiders: async () => [{ profileId: "r1", distanceM: 400 }] } as unknown as TrackingService;
    let offeredElsewhereWhere: Record<string, unknown> | undefined;
    const prisma = {
      order: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          if ("dispatchOfferedRiderId" in args.where) {
            offeredElsewhereWhere = args.where;
            return [];
          }
          return [];
        },
      },
    } as unknown as PrismaService;
    const strategy = new NearestRiderDispatchStrategy(tracking, prisma);
    await strategy.pickCandidate({ lat: 0, lng: 0, radiusM: 1000, excludeRiderIds: [] });
    expect(offeredElsewhereWhere).toMatchObject(LIVE_FOOD_DISPATCH_OFFER_WHERE);
  });
});
