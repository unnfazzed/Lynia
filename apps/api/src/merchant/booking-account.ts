import { Prisma } from "@prisma/client";
import { businessBookingAccountPhone } from "@lynia/shared";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * A business's **booking account** (merchant web upgrade L2, plan 2026-09-29 D9): the customer profile
 * that stands for the business on the Send rails. Every booking is a Send order whose customer of record
 * is this profile, so bookings are business-wide, Send's re-broadcast keeps them the business's, holding
 * the account pauses the whole business, and riders see the business's name as the sender.
 *
 * Its `phone` is `business:<merchantId>` (the `erased:` convention), which no sign-in can produce, so
 * nobody can log in to it and the customer app never shows its orders.
 */

/** The business's booking account id, or null before its first booking. Reads never create it. */
export async function findBookingAccountId(prisma: PrismaService, merchantId: string): Promise<string | null> {
  const account = await prisma.profile.findUnique({ where: { phone: businessBookingAccountPhone(merchantId) }, select: { id: true } });
  return account?.id ?? null;
}

/**
 * The business's booking account, created on its first booking. Race-safe: two first bookings at once
 * meet on the unique `profiles.phone`, and the loser re-reads the winner's row. The account carries the
 * business's current name, since that's what riders see as the sender.
 */
export async function ensureBookingAccount(prisma: PrismaService, merchant: { id: string; name: string }): Promise<string> {
  const phone = businessBookingAccountPhone(merchant.id);
  const existing = await prisma.profile.findUnique({ where: { phone }, select: { id: true, firstName: true } });
  if (existing) {
    if (existing.firstName !== merchant.name) {
      await prisma.profile.update({ where: { id: existing.id }, data: { firstName: merchant.name } });
    }
    return existing.id;
  }
  try {
    const created = await prisma.profile.create({
      data: { phone, firstName: merchant.name, lastName: "", role: "customer" },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.profile.findUnique({ where: { phone }, select: { id: true } });
      if (winner) return winner.id;
    }
    throw err;
  }
}
