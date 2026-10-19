import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { assertRiderInFleetScope, inFleetScope, isFleetScopeViolation, ridersInFleetScope, rethrowFleetScope } from "./fleet-scope";

/** Riders keyed by id → their fleet owner; branches keyed by id → their owner. */
function fakeDb(riders: Record<string, string | null>, branches: Record<string, string | null>): PrismaService {
  return {
    rider: {
      findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.filter((id) => id in riders).map((id) => ({ profileId: id, fleetOwnerProfileId: riders[id] })),
    },
    merchant: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id in branches ? { ownerProfileId: branches[where.id] } : null),
    },
  } as unknown as PrismaService;
}

describe("fleet scope (Own bikers, D-117)", () => {
  it("public serves public, an owner's biker serves that owner's jobs, and nothing crosses", () => {
    expect(inFleetScope(null, null)).toBe(true);
    expect(inFleetScope("owner-a", "owner-a")).toBe(true);
    expect(inFleetScope("owner-a", null)).toBe(false);
    expect(inFleetScope(null, "owner-a")).toBe(false);
    expect(inFleetScope("owner-a", "owner-b")).toBe(false);
  });

  it("keeps only the riders in scope of a job, at any of the owner's branches", async () => {
    const db = fakeDb({ pub: null, a1: "owner-a", b1: "owner-b" }, { avondale: "owner-a", borrowdale: "owner-a" });
    expect(await ridersInFleetScope(db, ["pub", "a1", "b1", "ghost"], null)).toEqual(new Set(["pub"]));
    expect(await ridersInFleetScope(db, ["pub", "a1", "b1"], "borrowdale")).toEqual(new Set(["a1"]));
  });

  it("refuses an out-of-scope rider with the fleet_scope reason", async () => {
    const db = fakeDb({ a1: "owner-a" }, {});
    await expect(assertRiderInFleetScope(db, "a1", null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(assertRiderInFleetScope(db, "a1", null)).rejects.toMatchObject({ response: { reason: "fleet_scope" } });
  });

  it("recognises the database guard's refusals and maps them to 409, leaving other errors alone", () => {
    expect(isFleetScopeViolation(new Error("fleet_scope: rider x is outside the scope of order y"))).toBe(true);
    expect(isFleetScopeViolation(new Error("fleet_link: rider x has a live job outside the new scope"))).toBe(true);
    expect(isFleetScopeViolation(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(() => rethrowFleetScope(new Error("fleet_scope: nope"))).toThrow(ConflictException);
    const other = new Error("boom");
    expect(() => rethrowFleetScope(other)).toThrow(other);
  });
});
