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
 * The member rows a person works from, the one they're working on FIRST: latest `activeAt` (the business
 * they last switched to), then oldest. A person is usually on one business; an owner with branches
 * (docs/plans/2026-09-30-multi-branch-owners.md) has a row per branch and works on one at a time.
 */
export const ACTIVE_MEMBERSHIP_ORDER = [{ activeAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }] satisfies Prisma.MerchantMemberOrderByWithRelationInput[];

const ACCESS_SELECT = { merchantId: true, role: true, merchant: { select: { businessType: true } } } satisfies Prisma.MerchantMemberSelect;

async function activeMembership(prisma: PrismaService, profileId: string): Promise<MerchantAccess | null> {
  const member = await prisma.merchantMember.findFirst({ where: { profileId }, orderBy: ACTIVE_MEMBERSHIP_ORDER, select: ACCESS_SELECT });
  return member ? { merchantId: member.merchantId, role: member.role, businessType: member.merchant.businessType } : null;
}

/**
 * Resolves the caller's merchant access from `merchant_members` — never from the JWT `role` claim, which
 * stays stale for up to 15 minutes and was one of the RCA's two sources of truth (C-1/C-2).
 *
 * A pure function over the (global) PrismaService, not an injectable service, so MerchantGuard (also
 * mounted by UploadsModule), the lookup util and every merchant service share it without new module
 * edges (plan §11 OV-7).
 *
 *   1. The caller's active member row (see {@link ACTIVE_MEMBERSHIP_ORDER}) → that business and role.
 *   2. Otherwise, a business this profile still OWNS by `merchants.owner_profile_id` — but only when that
 *      business has NO owner member yet (a merchant created before migration 0053's backfill, or by an
 *      old pod during the rollout). The owner row is backfilled and used. The "no owner member" condition
 *      matters: after an owner transfer the column may lag, and it must never re-admit an ex-owner (OV-4).
 *   3. Otherwise null — the caller isn't on any business.
 */
export async function resolveMerchantAccess(prisma: PrismaService, profileId: string): Promise<MerchantAccess | null> {
  const member = await activeMembership(prisma, profileId);
  if (member) return member;

  const legacy = await prisma.merchant.findFirst({
    where: { ownerProfileId: profileId, members: { none: { role: "owner" } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, businessType: true, ownerProfile: { select: { firstName: true, lastName: true } } },
  });
  if (!legacy) return null;

  const displayName = `${legacy.ownerProfile?.firstName ?? ""} ${legacy.ownerProfile?.lastName ?? ""}`.trim() || legacy.name;
  try {
    await prisma.merchantMember.create({
      data: { merchantId: legacy.id, profileId, role: "owner", displayName },
    });
  } catch (err) {
    // A concurrent request backfilled the same row first (unique person-per-business / one owner per
    // business). Re-read rather than guess: whatever row won is the truth.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    return await activeMembership(prisma, profileId);
  }
  return { merchantId: legacy.id, role: "owner", businessType: legacy.businessType };
}

/** Every business the person is on, the active one first (multi-branch owners). */
export async function listMemberships(prisma: PrismaService, profileId: string): Promise<{ merchantId: string; role: MerchantMemberRole }[]> {
  return prisma.merchantMember.findMany({ where: { profileId }, orderBy: ACTIVE_MEMBERSHIP_ORDER, select: { merchantId: true, role: true } });
}

/**
 * Inside a transaction, serialises every "put this person on a business" write for one person (join,
 * sign-up, a new branch) and returns the businesses they're on as of the lock. Since multi-branch owners
 * the database no longer holds one row per person, so this row lock is what stops a double submit from
 * landing someone on two businesses at once.
 */
export async function lockMembershipsTx(tx: Prisma.TransactionClient, profileId: string): Promise<{ merchantId: string; role: MerchantMemberRole }[]> {
  await tx.$executeRaw`SELECT 1 FROM profiles WHERE id = ${profileId}::uuid FOR UPDATE`;
  return tx.merchantMember.findMany({ where: { profileId }, orderBy: ACTIVE_MEMBERSHIP_ORDER, select: { merchantId: true, role: true } });
}
