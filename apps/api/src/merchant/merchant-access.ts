import { Prisma } from "@prisma/client";
import type { MerchantBusinessType, MerchantMemberRole } from "@lynia/shared";
import type { PrismaService } from "../prisma/prisma.service";

/** Which business the caller works at, and as what — the ONLY answer merchant access reads
 *  (docs/plans/2026-09-29-merchant-web-upgrade-plan.md D2). */
export interface MerchantAccess {
  merchantId: string;
  role: MerchantMemberRole;
  businessType: MerchantBusinessType;
}

/**
 * Resolves the caller's merchant access from `merchant_members` — never from the JWT `role` claim, which
 * stays stale for up to 15 minutes and was one of the RCA's two sources of truth (C-1/C-2).
 *
 * A pure function over the (global) PrismaService, not an injectable service, so MerchantGuard (also
 * mounted by UploadsModule), the lookup util and every merchant service share it without new module
 * edges (plan §11 OV-7).
 *
 *   1. A member row for this profile → that business and role.
 *   2. Otherwise, a business this profile still OWNS by `merchants.owner_profile_id` — but only when that
 *      business has NO owner member yet (a merchant created before migration 0053's backfill, or by an
 *      old pod during the rollout). The owner row is backfilled and used. The "no owner member" condition
 *      matters: after an owner transfer the column may lag, and it must never re-admit an ex-owner (OV-4).
 *   3. Otherwise null — the caller isn't on any business.
 */
export async function resolveMerchantAccess(prisma: PrismaService, profileId: string): Promise<MerchantAccess | null> {
  const member = await prisma.merchantMember.findUnique({
    where: { profileId },
    select: { merchantId: true, role: true, merchant: { select: { businessType: true } } },
  });
  if (member) return { merchantId: member.merchantId, role: member.role, businessType: member.merchant.businessType };

  const legacy = await prisma.merchant.findFirst({
    where: { ownerProfileId: profileId, members: { none: { role: "owner" } } },
    select: { id: true, name: true, businessType: true, ownerProfile: { select: { firstName: true, lastName: true } } },
  });
  if (!legacy) return null;

  const displayName = `${legacy.ownerProfile?.firstName ?? ""} ${legacy.ownerProfile?.lastName ?? ""}`.trim() || legacy.name;
  try {
    await prisma.merchantMember.create({
      data: { merchantId: legacy.id, profileId, role: "owner", displayName },
    });
  } catch (err) {
    // A concurrent request backfilled the same row first (unique profile_id / one owner per business).
    // Re-read rather than guess: whatever row won is the truth.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    const winner = await prisma.merchantMember.findUnique({
      where: { profileId },
      select: { merchantId: true, role: true, merchant: { select: { businessType: true } } },
    });
    return winner ? { merchantId: winner.merchantId, role: winner.role, businessType: winner.merchant.businessType } : null;
  }
  return { merchantId: legacy.id, role: "owner", businessType: legacy.businessType };
}
