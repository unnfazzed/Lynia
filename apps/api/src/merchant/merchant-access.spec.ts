import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { resolveMerchantAccess } from "./merchant-access";

const p2002 = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });

function prismaWith(overrides: { member?: unknown[]; legacy?: unknown; create?: (args: unknown) => Promise<unknown> }) {
  const members = [...(overrides.member ?? [])];
  const findUnique = vi.fn(async () => (members.length ? members.shift() : null));
  const findFirst = vi.fn(async () => overrides.legacy ?? null);
  const create = vi.fn(overrides.create ?? (async () => ({})));
  const prisma = { merchantMember: { findUnique, create }, merchant: { findFirst } };
  return { prisma: prisma as unknown as PrismaService, findUnique, findFirst, create };
}

describe("resolveMerchantAccess (merchant web upgrade L1, plan D2)", () => {
  it("a member row decides: business, role and type — the legacy owner column is never consulted", async () => {
    const { prisma, findFirst } = prismaWith({ member: [{ merchantId: "m1", role: "staff", merchant: { businessType: "shop" } }] });
    expect(await resolveMerchantAccess(prisma, "p1")).toEqual({ merchantId: "m1", role: "staff", businessType: "shop" });
    expect(findFirst).not.toHaveBeenCalled();
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
