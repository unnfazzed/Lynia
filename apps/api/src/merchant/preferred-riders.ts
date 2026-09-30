import type { PrismaService } from "../prisma/prisma.service";

/**
 * The rider profile ids a business calls its own (merchant web upgrade L3, plan D10): its preferred
 * numbers matched to rider accounts by phone, at the time of asking — so a biker who signs up after being
 * added becomes the business's rider on their own. Never someone on the business's own team, whatever the
 * list says: they would be delivering their own business's jobs (OV-5, T16).
 *
 * Eligibility is not decided here. Callers only use the answer to order riders who are already eligible
 * (the booking's offers, the dispatch candidates), so "preferred" can never let an ineligible rider in.
 */
export async function preferredRiderIds(prisma: PrismaService, merchantId: string): Promise<string[]> {
  const rows = await prisma.merchantPreferredRider.findMany({ where: { merchantId }, select: { phone: true } });
  if (rows.length === 0) return [];
  const riders = await prisma.profile.findMany({
    where: { phone: { in: rows.map((r) => r.phone) }, rider: { isNot: null } },
    select: { id: true, merchantMemberships: { select: { merchantId: true } } },
  });
  return riders.filter((p) => !p.merchantMemberships.some((m) => m.merchantId === merchantId)).map((p) => p.id);
}
