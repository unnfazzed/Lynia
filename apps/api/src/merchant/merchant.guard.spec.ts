import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { type MerchantAccessRequest, MerchantGuard, OwnerOnly } from "./merchant.guard";

class Handlers {
  open() {}
  @OwnerOnly()
  ownerOnly() {}
}

/** A fake Prisma where `members` maps a profile id to its membership (no legacy owners). */
function guardWith(members: Record<string, { merchantId: string; role: "owner" | "staff"; businessType: "restaurant" | "shop" }>) {
  const prisma = {
    merchantMember: {
      findFirst: async ({ where }: { where: { profileId: string } }) => {
        const m = members[where.profileId];
        return m ? { merchantId: m.merchantId, role: m.role, merchant: { businessType: m.businessType } } : null;
      },
    },
    merchant: { findFirst: async () => null },
  };
  return new MerchantGuard(prisma as unknown as PrismaService, new Reflector());
}

function ctx(user: MerchantAccessRequest["user"], handler: keyof Handlers = "open") {
  const req: MerchantAccessRequest = { user };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => Handlers.prototype[handler],
    getClass: () => Handlers,
  } as unknown as Parameters<MerchantGuard["canActivate"]>[0];
  return { context, req };
}

const members = {
  owner1: { merchantId: "m1", role: "owner" as const, businessType: "restaurant" as const },
  staff1: { merchantId: "m1", role: "staff" as const, businessType: "restaurant" as const },
};

describe("MerchantGuard (DB-backed membership, plan 2026-09-29 D2)", () => {
  it("lets a member in and leaves the resolved access on the request", async () => {
    const { context, req } = ctx({ sub: "owner1", role: "customer" });
    await expect(guardWith(members).canActivate(context)).resolves.toBe(true);
    expect(req.merchantAccess).toEqual({ merchantId: "m1", role: "owner", businessType: "restaurant" });
  });

  it("ignores the JWT role claim: a stale merchant claim with no membership is refused", async () => {
    const { context } = ctx({ sub: "nobody", role: "merchant" });
    await expect(guardWith(members).canActivate(context)).rejects.toMatchObject({ status: 403, response: { reason: "not_a_member" } });
  });

  it("refuses a request with no user at all (fail closed)", async () => {
    const { context } = ctx(undefined);
    await expect(guardWith(members).canActivate(context)).rejects.toMatchObject({ response: { reason: "not_a_member" } });
  });

  it("@OwnerOnly: staff get 403 owner_only, the owner passes", async () => {
    const staff = ctx({ sub: "staff1" }, "ownerOnly");
    await expect(guardWith(members).canActivate(staff.context)).rejects.toMatchObject({ status: 403, response: { reason: "owner_only" } });
    const owner = ctx({ sub: "owner1" }, "ownerOnly");
    await expect(guardWith(members).canActivate(owner.context)).resolves.toBe(true);
  });

  it("staff pass routes that aren't owner-only (orders, busy mode, stock toggles)", async () => {
    const { context, req } = ctx({ sub: "staff1" }, "open");
    await expect(guardWith(members).canActivate(context)).resolves.toBe(true);
    expect(req.merchantAccess?.role).toBe("staff");
  });
});
