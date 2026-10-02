import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  type CreateMerchantBranchRequest,
  MERCHANT_BRANCHES_MAX,
  type MerchantBranchesResponse,
  type MerchantProfileResponse,
  merchantWaypoint,
  isInServiceArea,
  type SwitchMerchantBranchRequest,
} from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { ACTIVE_MEMBERSHIP_ORDER, type MerchantAccess, lockMembershipsTx } from "./merchant-access";
import { MerchantService } from "./merchant.service";

export const BRANCH_CREATE_ACTION = "merchant.branch.create";
export const BRANCH_SWITCH_ACTION = "merchant.branch.switch";

/**
 * Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md). A branch is an ordinary business
 * row with its own pin, hours, menu, team, queue and cash; the owner is a member of each and works on one
 * at a time, the row with the latest `merchant_members.active_at`. Every other merchant call already
 * resolves "which business" through `resolveMerchantAccess`, so switching here is all it takes to move the
 * whole app to another branch. Customers see each branch as its own restaurant or shop.
 */
@Injectable()
export class MerchantBranchesService {
  private readonly logger = new Logger(MerchantBranchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    private readonly merchants: MerchantService,
  ) {}

  async list(profileId: string): Promise<MerchantBranchesResponse> {
    const rows = await this.prisma.merchantMember.findMany({
      where: { profileId },
      orderBy: ACTIVE_MEMBERSHIP_ORDER,
      select: { role: true, merchant: { select: { id: true, name: true, location: true, pilotEnabled: true } } },
    });
    return {
      branches: rows.map((r, i) => ({
        id: r.merchant.id,
        name: r.merchant.name,
        landmark: landmarkOf(r.merchant.location),
        role: r.role,
        active: i === 0,
        pilotEnabled: r.merchant.pilotEnabled,
      })),
    };
  }

  async switchTo(access: MerchantAccess, profileId: string, body: SwitchMerchantBranchRequest): Promise<MerchantProfileResponse> {
    if (body.merchantId !== access.merchantId) {
      const moved = await this.prisma.merchantMember.updateMany({
        where: { profileId, merchantId: body.merchantId },
        data: { activeAt: new Date() },
      });
      // A business they're not on reads as missing, never as forbidden: no oracle.
      if (moved.count === 0) throw new NotFoundException("Branch not found");
      await this.prisma.auditLog.create({ data: { actor: profileId, action: BRANCH_SWITCH_ACTION, target: body.merchantId, note: access.merchantId } });
      await this.leaveQueue(profileId, access.merchantId);
    }
    return await this.merchants.getMyMerchant(profileId);
  }

  /** Owner only (the route's `@OwnerOnly()`): opens a branch from the active business and switches to it. */
  async create(access: MerchantAccess, profileId: string, body: CreateMerchantBranchRequest): Promise<MerchantProfileResponse> {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { onHold: true } });
    if (!profile) throw new NotFoundException("Profile not found");
    if (profile.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "This account is on hold. Message LyniaGo on WhatsApp to sort it out." });
    }
    if (!isInServiceArea(body.location.point)) {
      throw new BadRequestException({ reason: "outside_service_area", message: "That address is outside the area LyniaGo covers for now." });
    }

    const name = body.name.trim();
    await this.prisma.$transaction(async (tx) => {
      const memberships = await lockMembershipsTx(tx, profileId);
      // Re-read under the lock: a handover since the guard ran must not let an ex-owner open branches.
      if (!memberships.some((m) => m.merchantId === access.merchantId && m.role === "owner")) {
        throw new ForbiddenException({ reason: "owner_only", message: "Only the owner can change this." });
      }
      const owned = memberships.filter((m) => m.role === "owner").map((m) => m.merchantId);
      if (owned.length >= MERCHANT_BRANCHES_MAX) {
        throw new ConflictException({ reason: "branch_limit", message: `You can have up to ${MERCHANT_BRANCHES_MAX} branches. Message LyniaGo on WhatsApp for more.` });
      }
      // The name tells branches apart in the switcher and for customers, and it makes a double tap harmless.
      const taken = await tx.merchant.count({ where: { id: { in: owned }, name: { equals: name, mode: "insensitive" } } });
      if (taken > 0) {
        throw new ConflictException({ reason: "branch_name_taken", message: "You already have a branch with that name. Add the area, like “Mama's Kitchen · Avondale”." });
      }

      const source = await tx.merchant.findUniqueOrThrow({
        where: { id: access.merchantId },
        select: {
          description: true,
          coverPhotoUrl: true,
          logoUrl: true,
          cuisineTags: true,
          priceLevel: true,
          hours: true,
          cashRule: true,
          prepBaselineMinutes: true,
          businessType: true,
          shopKind: true,
          members: { where: { profileId }, select: { displayName: true, termsAcceptedAt: true } },
        },
      });
      const branch = await tx.merchant.create({
        data: {
          name,
          ownerProfileId: profileId,
          description: source.description,
          coverPhotoUrl: source.coverPhotoUrl,
          logoUrl: source.logoUrl,
          cuisineTags: source.cuisineTags,
          priceLevel: source.priceLevel,
          hours: source.hours ?? Prisma.DbNull,
          cashRule: source.cashRule,
          prepBaselineMinutes: source.prepBaselineMinutes,
          businessType: source.businessType,
          shopKind: source.shopKind,
          location: merchantWaypoint(body.location, name) as Prisma.InputJsonValue,
          // pilotEnabled stays false: ops switch each branch on after their go-live call.
        },
        select: { id: true },
      });
      const me = source.members[0];
      await tx.merchantMember.create({
        data: {
          merchantId: branch.id,
          profileId,
          role: "owner",
          displayName: me?.displayName ?? name,
          // The owner accepted the merchant terms once, for their business; a branch is more of it.
          termsAcceptedAt: me?.termsAcceptedAt ?? null,
          addedByProfileId: profileId,
          activeAt: new Date(),
        },
      });
      if (body.copyMenu) await copyMenuTx(tx, access.merchantId, branch.id);
      await tx.auditLog.create({ data: { actor: profileId, action: BRANCH_CREATE_ACTION, target: branch.id, note: access.merchantId } });
    });
    await this.leaveQueue(profileId, access.merchantId);
    return await this.merchants.getMyMerchant(profileId);
  }

  /** Best effort, after the commit: the person's devices stop receiving the old branch's live queue. */
  private async leaveQueue(profileId: string, merchantId: string): Promise<void> {
    try {
      await this.gateway.evictFromMerchantQueue(profileId, merchantId);
    } catch (err) {
      this.logger.warn(`merchant queue eviction failed for ${profileId}: ${(err as Error).message}`);
    }
  }
}

/** Categories and items as they stand, every item back in stock. Photos are shared, not duplicated: the
 *  storage sweeper only deletes an object no row references. */
async function copyMenuTx(tx: Prisma.TransactionClient, fromId: string, toId: string): Promise<void> {
  const categories = await tx.merchantCategory.findMany({
    where: { merchantId: fromId },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      availableFrom: true,
      availableTo: true,
      hidden: true,
      dishes: { select: { name: true, description: true, priceUsd: true, photoUrl: true, isDraft: true, sortOrder: true } },
    },
  });
  if (categories.length === 0) return;
  const ids = new Map(categories.map((c) => [c.id, randomUUID()]));
  await tx.merchantCategory.createMany({
    data: categories.map((c) => ({
      id: ids.get(c.id)!,
      merchantId: toId,
      name: c.name,
      sortOrder: c.sortOrder,
      availableFrom: c.availableFrom,
      availableTo: c.availableTo,
      hidden: c.hidden,
    })),
  });
  const dishes = categories.flatMap((c) => c.dishes.map((d) => ({ ...d, categoryId: ids.get(c.id)!, merchantId: toId })));
  if (dishes.length > 0) await tx.merchantDish.createMany({ data: dishes });
}

function landmarkOf(location: Prisma.JsonValue | null): string | null {
  const landmark = (location as { landmark?: unknown } | null)?.landmark;
  return typeof landmark === "string" && landmark.trim() !== "" ? landmark : null;
}
