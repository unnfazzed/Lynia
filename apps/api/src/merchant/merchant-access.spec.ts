import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ACTIVE_MEMBERSHIP_ORDER, lockMembershipsTx, resolveMerchantAccess } from "./merchant-access";

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

function prismaWith(overrides: { member?: unknown[]; legacy?: unknown; create?: (args: unknown) => Promise<unknown> }) {
  const members = [...(overrides.member ?? [])];
  const memberFindFirst = vi.fn(async () => (members.length ? members.shift() : null));
  const findFirst = vi.fn(async () => overrides.legacy ?? null);
  const create = vi.fn(overrides.create ?? (async () => ({})));
  const prisma = { merchantMember: { findFirst: memberFindFirst, create }, merchant: { findFirst } };
  return { prisma: prisma as unknown as PrismaService, memberFindFirst, findFirst, create };
}

describe("resolveMerchantAccess (merchant web upgrade L1, plan D2)", () => {
  it("a member row decides: business, role and type — the legacy owner column is never consulted", async () => {
    const { prisma, findFirst } = prismaWith({ member: [{ merchantId: "m1", role: "staff", merchant: { businessType: "shop" } }] });
    expect(await resolveMerchantAccess(prisma, "p1")).toEqual({ merchantId: "m1", role: "staff", businessType: "shop" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("an owner with branches works on the one they last switched to (multi-branch owners)", async () => {
    const { prisma, memberFindFirst } = prismaWith({ member: [{ merchantId: "branch-2", role: "owner", merchant: { businessType: "restaurant" } }] });
    expect(await resolveMerchantAccess(prisma, "p1")).toEqual({ merchantId: "branch-2", role: "owner", businessType: "restaurant" });
    expect(memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { profileId: "p1" }, orderBy: ACTIVE_MEMBERSHIP_ORDER }));
    // Latest switch first (never-switched rows last), then the oldest row: one person on one business
    // resolves exactly as before.
    expect(ACTIVE_MEMBERSHIP_ORDER).toEqual([{ activeAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }]);
  });

  it("no member row and no legacy business → null (not on any team)", async () => {
    const { prisma, create } = prismaWith({});
    expect(await resolveMerchantAccess(prisma, "p1")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("a pre-0053 owner (owner_profile_id set, no owner member yet) is backfilled as the owner and let in", async () => {
    const legacy = { id: "m9", name: "Mama's Kitchen", businessType: "restaurant", ownerProfile: { firstName: "Mai", lastName: "M" } };
    const { prisma, create, findFirst } = prismaWith({ legacy });
    expect(await resolveMerchantAccess(prisma, "owner-1")).toEqual({ merchantId: "m9", role: "owner", businessType: "restaurant" });
    expect(create).toHaveBeenCalledWith({ data: { merchantId: "m9", profileId: "owner-1", role: "owner", displayName: "Mai M" } });
    // OV-4: only a business with NO owner member yet can fall back — a transferred-out ex-owner whose
    // column lags is never re-admitted.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerProfileId: "owner-1", members: { none: { role: "owner" } } } }),
    );
  });

  it("the backfilled name falls back to the business name when the profile has none", async () => {
    const legacy = { id: "m9", name: "Mama's Kitchen", businessType: "restaurant", ownerProfile: { firstName: "", lastName: "" } };
    const { prisma, create } = prismaWith({ legacy });
    await resolveMerchantAccess(prisma, "owner-1");
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ displayName: "Mama's Kitchen" }) });
  });

  it("a concurrent backfill (P2002) re-reads the winning row instead of failing the request", async () => {
    const legacy = { id: "m9", name: "K", businessType: "restaurant", ownerProfile: { firstName: "Mai", lastName: "" } };
    const { prisma } = prismaWith({
      member: [null, { merchantId: "m9", role: "owner", merchant: { businessType: "restaurant" } }],
      legacy,
      create: async () => {
        throw p2002();
      },
    });
    expect(await resolveMerchantAccess(prisma, "owner-1")).toEqual({ merchantId: "m9", role: "owner", businessType: "restaurant" });
  });

  it("any other database error propagates (fail closed, never a silent null)", async () => {
    const legacy = { id: "m9", name: "K", businessType: "restaurant", ownerProfile: null };
    const { prisma } = prismaWith({
      legacy,
      create: async () => {
        throw new Error("db down");
      },
    });
    await expect(resolveMerchantAccess(prisma, "owner-1")).rejects.toThrow("db down");
  });
});

describe("lockMembershipsTx (multi-branch owners)", () => {
  it("locks the person's profile row before reading the businesses they're on", async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => (order.push("lock"), 1)),
      merchantMember: { findMany: vi.fn(async () => (order.push("read"), [{ merchantId: "m1", role: "owner" }])) },
    };
    expect(await lockMembershipsTx(tx as never, "p1")).toEqual([{ merchantId: "m1", role: "owner" }]);
    expect(order).toEqual(["lock", "read"]);
    expect(tx.merchantMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { profileId: "p1" }, orderBy: ACTIVE_MEMBERSHIP_ORDER }));
  });
});
