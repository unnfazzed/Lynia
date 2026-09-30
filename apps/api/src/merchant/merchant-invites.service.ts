import { ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { JoinMerchantInviteRequest, MerchantProfileResponse, MyMerchantInvitesResponse } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";
import { listMemberships, lockMembershipsTx } from "./merchant-access";
import { MerchantService, splitPersonName } from "./merchant.service";

/** The audit actions the invitee's side writes. */
export const TEAM_JOIN_ACTION = "merchant.team.join";
export const TEAM_DECLINE_ACTION = "merchant.team.decline";

/**
 * Team (merchant web upgrade L4), the invited person's side: the invites waiting for the signed-in
 * number, Join and Not me. Behind RestaurantsEnabledGuard + JwtAuthGuard only, since the caller isn't on
 * a business yet. Every lookup is scoped to the caller's own phone, so an invite id is useless to anyone
 * else (404, never 403).
 *
 * "One business per phone" is settled here and only here, and only the number's owner hears it: the
 * other business is never named (design doc "L4 — Team", R2-21).
 */
@Injectable()
export class MerchantInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantService,
  ) {}

  async mine(profileId: string): Promise<MyMerchantInvitesResponse> {
    const phone = await this.phoneOf(profileId);
    const rows = await this.prisma.merchantInvite.findMany({
      where: { phone, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayName: true,
        expiresAt: true,
        merchant: {
          select: {
            name: true,
            businessType: true,
            ownerProfile: { select: { firstName: true } },
            members: { where: { role: "owner" }, select: { displayName: true } },
          },
        },
      },
    });
    return {
      invites: rows.map((r) => ({
        id: r.id,
        businessName: r.merchant.name,
        businessType: r.merchant.businessType,
        ownerName: ownerFirstName(r.merchant.members[0]?.displayName, r.merchant.ownerProfile?.firstName),
        role: "staff",
        name: r.displayName,
        expiresAt: r.expiresAt.toISOString(),
      })),
    };
  }

  async join(profileId: string, inviteId: string, body: JoinMerchantInviteRequest): Promise<MerchantProfileResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { phone: true, firstName: true, lastName: true, onHold: true, rider: { select: { accountStatus: true } } },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const invite = await this.prisma.merchantInvite.findFirst({
      where: { id: inviteId, phone: profile.phone },
      select: {
        id: true,
        merchantId: true,
        invitedByProfileId: true,
        expiresAt: true,
        merchant: { select: { name: true, ownerProfile: { select: { firstName: true } }, members: { where: { role: "owner" }, select: { displayName: true } } } },
      },
    });
    if (!invite) throw new NotFoundException("Invite not found");
    const owner = ownerFirstName(invite.merchant.members[0]?.displayName, invite.merchant.ownerProfile?.firstName);
    if (invite.expiresAt <= new Date()) {
      throw new GoneException({ reason: "invite_expired", message: `This invite has expired. Ask ${owner} to send a new one.` });
    }
    // Staff book riders, so the same people Send and "Set up your business" refuse can't join (OV-5).
    if (profile.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "This account is on hold. Message LyniaGo on WhatsApp to sort it out." });
    }
    if (profile.rider && profile.rider.accountStatus !== "active") {
      throw new ForbiddenException({ reason: "account_restricted", message: "This number can't join a business. Message LyniaGo on WhatsApp." });
    }

    // Staff work at one business. Only an owner opening branches is on several
    // (docs/plans/2026-09-30-multi-branch-owners.md), and that never goes through an invite.
    const current = await listMemberships(this.prisma, profileId);
    const onThisTeam = current.some((m) => m.merchantId === invite.merchantId);
    if (current.length > 0 && !onThisTeam) throw memberElsewhere(invite.merchant.name);
    if (!onThisTeam) {
      const name = body.name.trim();
      const nameIsEmpty = profile.firstName.trim() === "" && profile.lastName.trim() === "";
      try {
        await this.prisma.$transaction(async (tx) => {
          // Re-checked under the person's lock: a Join elsewhere in the same instant can't land them twice.
          const now = await lockMembershipsTx(tx, profileId);
          if (now.some((m) => m.merchantId !== invite.merchantId)) throw memberElsewhere(invite.merchant.name);
          // Taking the invite is the claim: one the owner cancelled a moment ago can't still be joined.
          const taken = await tx.merchantInvite.deleteMany({ where: { id: invite.id, phone: profile.phone } });
          if (taken.count === 0) throw new NotFoundException("Invite not found");
          await tx.merchantMember.create({
            data: {
              merchantId: invite.merchantId,
              profileId,
              role: "staff",
              displayName: name,
              termsAcceptedAt: new Date(),
              addedByProfileId: invite.invitedByProfileId,
            },
          });
          // Their name fills an empty LyniaGo profile and never overwrites one they chose in the app.
          if (nameIsEmpty) await tx.profile.update({ where: { id: profileId }, data: splitPersonName(name) });
          await tx.auditLog.create({ data: { actor: profileId, action: TEAM_JOIN_ACTION, target: invite.merchantId, note: invite.id } });
        });
      } catch (err) {
        // A double tap won the unique (person, business) row first: they're on this team, which is the ask.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    } else {
      // Already on this team (a second tap, or a second device): the invite has done its job.
      await this.prisma.merchantInvite.deleteMany({ where: { id: invite.id } });
    }
    return await this.merchants.getMyMerchant(profileId);
  }

  /** "Not me": the invite goes, and the business can invite the number again. */
  async decline(profileId: string, inviteId: string): Promise<{ ok: true }> {
    const phone = await this.phoneOf(profileId);
    await this.prisma.$transaction(async (tx) => {
      const invite = await tx.merchantInvite.findFirst({ where: { id: inviteId, phone }, select: { merchantId: true } });
      if (!invite) throw new NotFoundException("Invite not found");
      await tx.merchantInvite.deleteMany({ where: { id: inviteId } });
      await tx.auditLog.create({ data: { actor: profileId, action: TEAM_DECLINE_ACTION, target: invite.merchantId, note: inviteId } });
    });
    return { ok: true };
  }

  private async phoneOf(profileId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { phone: true } });
    if (!profile) throw new NotFoundException("Profile not found");
    return profile.phone;
  }
}

/** The invite line says the owner's first name: their name on the team, else their LyniaGo profile's. */
function ownerFirstName(teamName: string | undefined, profileFirstName: string | undefined): string {
  const first = (teamName ?? "").trim().split(/\s+/)[0] || (profileFirstName ?? "").trim();
  return first || "The owner";
}

function memberElsewhere(businessName: string): ConflictException {
  return new ConflictException({
    reason: "member_elsewhere",
    message: `Your number already works at another business on LyniaGo. Leave it first to join ${businessName}.`,
  });
}
