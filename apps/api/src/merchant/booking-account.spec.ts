import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ensureBookingAccount, findBookingAccountId } from "./booking-account";

describe("a business's booking account (merchant web upgrade L2, D9)", () => {
  it("is created on the first booking as a customer profile nobody can sign in to", async () => {
    const create = vi.fn(async () => ({ id: "acct-1" }));
    const prisma = { profile: { findUnique: async () => null, create } };
    await expect(ensureBookingAccount(prisma as unknown as PrismaService, { id: "m1", name: "Mbare Auto Spares" })).resolves.toBe("acct-1");
    expect(create).toHaveBeenCalledWith({
      data: { phone: "business:m1", firstName: "Mbare Auto Spares", lastName: "", role: "customer" },
      select: { id: true },
    });
  });

  it("two first bookings at once: the loser of the unique-phone race re-reads the winner's account", async () => {
    let reads = 0;
    const prisma = {
      profile: {
        findUnique: async () => (reads++ === 0 ? null : { id: "acct-winner" }),
        create: async () => {
          throw new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });
        },
      },
    };
    await expect(ensureBookingAccount(prisma as unknown as PrismaService, { id: "m1", name: "Mbare Auto Spares" })).resolves.toBe("acct-winner");
  });

  it("follows a renamed business, since riders see the account's name as the sender", async () => {
    const update = vi.fn(async () => ({}));
    const prisma = { profile: { findUnique: async () => ({ id: "acct-1", firstName: "Old Name" }), update } };
    await ensureBookingAccount(prisma as unknown as PrismaService, { id: "m1", name: "New Name" });
    expect(update).toHaveBeenCalledWith({ where: { id: "acct-1" }, data: { firstName: "New Name" } });
  });

  it("reading never creates one", async () => {
    const create = vi.fn();
    const prisma = { profile: { findUnique: async () => null, create } };
    await expect(findBookingAccountId(prisma as unknown as PrismaService, "m1")).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
