import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { hasOpenMerchantObligation } from "./merchant-debt-lock";

/** The where-clause is the rule, so the test reads it back (the DB-backed check is launch-flip.int). */
function capture() {
  let where: Record<string, unknown> | undefined;
  const prisma = { order: { findFirst: async (a: { where: Record<string, unknown> }) => ((where = a.where), null) } };
  return { prisma: prisma as unknown as PrismaService, where: () => where! };
}

describe("hasOpenMerchantObligation (C4 soft-lock)", () => {
  it("releases a rider once the merchant closed its side with nothing owed (D-48 'No cash on this one')", async () => {
    const c = capture();
    await hasOpenMerchantObligation(c.prisma, "r1");
    const or = c.where().OR as Array<Record<string, unknown>>;
    for (const branch of or.filter((b) => b.debtStatus === "open")) expect(branch.merchantClosedAt).toBeNull();
  });

  it("also holds a rider who owes a shop booking's cash on delivery back (D-48 PR 4b)", async () => {
    const c = capture();
    await hasOpenMerchantObligation(c.prisma, "r1");
    expect(c.where().OR).toContainEqual({ orderType: "parcel", debtStatus: "open", merchantClosedAt: null });
    expect(c.where().riderId).toBe("r1");
  });
});
