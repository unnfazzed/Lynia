import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  type CreateMerchantInviteRequest,
  MERCHANT_INVITE_TTL_DAYS,
  MERCHANT_INVITES_PER_DAY,
  type MerchantTeamInviteResponse,
  type MerchantTeamResponse,
  normalizePhone,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import type { MerchantAccess } from "./merchant-access";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The audit actions the team writes; the daily invite limit counts the first. */
export const TEAM_INVITE_ACTION = "merchant.team.invite";
export const TEAM_INVITE_CANCEL_ACTION = "merchant.team.invite_cancel";
export const TEAM_REMOVE_ACTION = "merchant.team.remove";
export const TEAM_LEAVE_ACTION = "merchant.team.leave";

/**
 * Team (merchant web upgrade L4, design doc "L4 — Team"), the owner's side and a staff member's Leave.
 * People join by consent: the owner invites a name and a number, and the person chooses Join or Not me
 * when they sign in (MerchantInvitesService). An invite never reveals whether the number already works
 * at another business: the owner always gets "Invite ready", and only the number's owner learns of a
 * conflict, at Join. Exactly one owner per business, who can't be removed or leave (support transfers a
 * business: `POST /admin/merchants/:id/owner`).
 *
 * Access ends on the removed person's next request (MerchantGuard reads `merchant_members` every time),
 * and their devices leave the kitchen's live queue right away.
 */
@Injectable()
export class MerchantTeamService {
  private readonly logger = new Logger(MerchantTeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
  ) {}

  async team(access: MerchantAccess, profileId: string): Promise<MerchantTeamResponse> {
    const [members, invites] = await Promise.all([
      this.prisma.merchantMember.findMany({
        where: { merchantId: access.merchantId },
        orderBy: { createdAt: "asc" },
        select: { profileId: true, role: true, displayName: true, createdAt: true, profile: { select: { phone: true } } },
      }),
      this.prisma.merchantInvite.findMany({
        where: { merchantId: access.merchantId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    // The owner first, then everyone in the order they joined.
    const ordered = [...members.filter((m) => m.role === "owner"), ...members.filter((m) => m.role !== "owner")];
    return {
      members: ordered.map((m) => ({
        profileId: m.profileId,
        name: m.displayName,
        phoneMasked: maskPhone(m.profile.phone),
        role: m.role,
        you: m.profileId === profileId,
        joinedAt: m.createdAt.toISOString(),
      })),
      invites: invites.map(toInvite),
    };
  }

  async invite(access: MerchantAccess, profileId: string, body: CreateMerchantInviteRequest): Promise<MerchantTeamInviteResponse> {
    const phone = normalizePhone(body.phone);
    if (!phone) throw new BadRequestException({ reason: "bad_phone", message: "Enter their phone number, like 0771234567." });
    // Only this business's own team is said: whether the number works anywhere else never is.
    const onTeam = await this.prisma.merchantMember.count({ where: { merchantId: access.merchantId, profile: { phone } } });
    if (onTeam > 0) throw new ConflictException({ reason: "already_on_team", message: "That number is already on your team." });

    const expiresAt = new Date(Date.now() + MERCHANT_INVITE_TTL_DAYS * DAY_MS);
    const invite = await this.prisma.$transaction(async (tx) => {
      // One invite at a time per business, so two at once can't both slip under the daily limit.
      await tx.$executeRaw`SELECT 1 FROM merchants WHERE id = ${access.merchantId}::uuid FOR UPDATE`;
      const sentToday = await tx.auditLog.count({
        where: { action: TEAM_INVITE_ACTION, target: access.merchantId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      });
      if (sentToday >= MERCHANT_INVITES_PER_DAY) {
        throw new HttpException(
          { statusCode: 429, reason: "too_many_invites", message: `You've sent ${MERCHANT_INVITES_PER_DAY} invites today. Send more tomorrow.` },
          429,
        );
      }
      // A re-invite refreshes the same invite: the name, who sent it and its 14 days.
      const row = await tx.merchantInvite.upsert({
        where: { merchantId_phone: { merchantId: access.merchantId, phone } },
        create: { merchantId: access.merchantId, phone, displayName: body.name, invitedByProfileId: profileId, expiresAt },
        update: { displayName: body.name, invitedByProfileId: profileId, expiresAt },
      });
      await tx.auditLog.create({ data: { actor: profileId, action: TEAM_INVITE_ACTION, target: access.merchantId, note: row.id } });
      return row;
    });
    return toInvite(invite);
  }

  async cancelInvite(access: MerchantAccess, profileId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.merchantInvite.deleteMany({ where: { id, merchantId: access.merchantId } });
      if (gone.count === 0) throw new NotFoundException("Invite not found");
      await tx.auditLog.create({ data: { actor: profileId, action: TEAM_INVITE_CANCEL_ACTION, target: access.merchantId, note: id } });
    });
    return { ok: true };
  }

  async removeMember(access: MerchantAccess, profileId: string, memberProfileId: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.merchantMember.findFirst({ where: { merchantId: access.merchantId, profileId: memberProfileId }, select: { role: true } });
      // Someone on another team reads as missing, never as forbidden: no oracle.
      if (!member) throw new NotFoundException("Team member not found");
      if (member.role === "owner") {
        throw new ConflictException({
          reason: "owner_stays",
          message: "The owner can't be removed. LyniaGo support can hand the business to someone else.",
        });
      }
      // Only ever a Staff row, even if a handover promoted them since the read above.
      const gone = await tx.merchantMember.deleteMany({ where: { merchantId: access.merchantId, profileId: memberProfileId, role: "staff" } });
      if (gone.count === 0) throw new NotFoundException("Team member not found");
      await tx.auditLog.create({ data: { actor: profileId, action: TEAM_REMOVE_ACTION, target: access.merchantId, note: memberProfileId } });
    });
    await this.evict(memberProfileId, access.merchantId);
    return { ok: true };
  }

  /** "Leave this business" (Staff). The owner can't leave: support hands the business over first. */
  async leave(access: MerchantAccess, profileId: string): Promise<{ ok: true }> {
    if (access.role === "owner") {
      throw new ConflictException({
        reason: "owner_stays",
        message: "The owner can't leave the business. Message LyniaGo support to hand it to someone else first.",
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.merchantMember.deleteMany({ where: { merchantId: access.merchantId, profileId, role: "staff" } });
      if (gone.count === 0) throw new NotFoundException("Team member not found");
      await tx.auditLog.create({ data: { actor: profileId, action: TEAM_LEAVE_ACTION, target: access.merchantId, note: profileId } });
    });
    await this.evict(profileId, access.merchantId);
    return { ok: true };
  }

  /** Best effort, after the commit: the person's devices stop receiving the kitchen's live queue now. */
  private async evict(profileId: string, merchantId: string): Promise<void> {
    try {
      await this.gateway.evictFromMerchantQueue(profileId, merchantId);
    } catch (err) {
      this.logger.warn(`merchant queue eviction failed for ${profileId}: ${(err as Error).message}`);
    }
  }
}

function toInvite(row: { id: string; phone: string; displayName: string; createdAt: Date; expiresAt: Date }): MerchantTeamInviteResponse {
  return {
    id: row.id,
    name: row.displayName,
    phoneMasked: maskPhone(row.phone),
    invitePhone: row.phone.replace(/^\+/, ""),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}
