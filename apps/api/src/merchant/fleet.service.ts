import { randomInt } from "node:crypto";
import { ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ACTIVE_RIDE_STATUSES,
  addMoney,
  type CreateFleetInviteRequest,
  FLEET_INVITE_CODE_LENGTH,
  FLEET_INVITE_LINK_BASE,
  FLEET_INVITE_TTL_DAYS,
  FLEET_INVITES_PER_DAY,
  type FleetBikerRow,
  type FleetBikerState,
  type FleetInviteLinkResponse,
  type FleetInviteRow,
  type FleetInviteState,
  type FleetJoinRefusal,
  type FleetSuggestion,
  type MyFleetResponse,
  normalizePhone,
  type OwnerFleetResponse,
  REFERRAL_CODE_ALPHABET,
} from "@lynia/shared";
import { FLEET_DROP_ACTION, isFleetScopeViolation, reportFleetScopeViolation } from "../common/fleet-scope";
import { maskPhone } from "../common/phone-mask";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { onlineRefusalReason } from "../riders/online-gate";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { harareWeekStart } from "./harare-clock";
import type { MerchantAccess } from "./merchant-access";

const DAY_MS = 24 * 60 * 60 * 1000;


/** Audit actions. The daily invite limit counts the first, per owner. */
export const FLEET_INVITE_ACTION = "merchant.fleet.invite";
export const FLEET_INVITE_REVOKE_ACTION = "merchant.fleet.invite_revoke";
export const FLEET_JOIN_ACTION = "merchant.fleet.join";
export const FLEET_LEAVE_ACTION = "merchant.fleet.leave";
export const FLEET_REMOVE_ACTION = "merchant.fleet.remove";

type Tx = Prisma.TransactionClient;

function refuse(status: 403 | 409 | 410, reason: FleetJoinRefusal, message: string): HttpException {
  return new HttpException({ statusCode: status, reason, message }, status);
}

/** A fresh invite code from the referral alphabet (no 0/O/1/I/L). */
function newCode(): string {
  let code = "";
  for (let i = 0; i < FLEET_INVITE_CODE_LENGTH; i++) code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  return code;
}

/**
 * Own bikers (docs/designs/own-bikers.md, ledger D-117, handoff own-bikers-v1), T3a: invites, Join, Leave and
 * Remove. A fleet belongs to the merchant OWNER (all their branches, OV-F4); a biker's home branch only orders who
 * is rung first.
 *
 * Invites are links bound to one phone number that the owner shares on WhatsApp or copies (D-117: LyniaGo sends
 * nothing). Only the account with that number can use the link; the code alone is useless. A re-invite of a live
 * invite returns the same link; a lapsed one is replaced by a new one.
 *
 * The database is the guarantee (migration 0108): the riders trigger refuses a link change while the biker is on a
 * live job outside the new scope, and the orders trigger refuses an out-of-scope assignment. Join and Leave lock the
 * rider row FOR UPDATE, which orders them against a concurrent accept (OV1).
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    private readonly notifications: NotificationsService,
  ) {}

  // ── The owner's side (merchant app) ───────────────────────────────────────────────────────────────────────

  /** OB-M1–M5: the roster. Staff see it read-only: masked numbers, no suggestions (E6). */
  async roster(access: MerchantAccess): Promise<OwnerFleetResponse> {
    const role = access.role === "owner" ? "owner" : "staff";
    const owner = await this.ownerOf(access.merchantId);
    const fleet = owner ? await this.prisma.ownerFleet.findUnique({ where: { ownerProfileId: owner } }) : null;
    if (!owner || !fleet?.enabled) return { enabled: false, paused: false, role, bikers: [], invites: [], suggestions: [] };

    const now = new Date();
    const [bikers, invites] = await Promise.all([this.bikerRows(owner, role === "owner"), this.inviteRows(owner, now)]);
    const suggestions = role === "owner" && !fleet.suggestionsDismissedAt ? await this.suggestions(owner, bikers) : [];
    return { enabled: true, paused: fleet.pausedAt !== null, role, bikers, invites, suggestions };
  }

  /** `POST /merchant/fleet/invites` (owner): the link for this number. The home branch is the branch they invite from. */
  async invite(access: MerchantAccess, profileId: string, body: CreateFleetInviteRequest): Promise<FleetInviteLinkResponse> {
    const owner = await this.enabledOwner(access.merchantId);
    const phone = normalizePhone(body.phone);
    if (!phone) throw new HttpException({ statusCode: 400, reason: "bad_phone", message: "Enter their phone number, like 0771234567." }, 400);
    const already = await this.prisma.rider.count({ where: { fleetOwnerProfileId: owner, profile: { phone } } });
    if (already > 0) throw new ConflictException({ reason: "already_biker", message: "That number is already one of your bikers." });

    const now = new Date();
    const { row, alreadyInvited } = await this.prisma.$transaction(async (tx) => {
      // One invite at a time per owner, so two at once can't both slip under the daily limit or both mint a link.
      await tx.$executeRaw`SELECT 1 FROM owner_fleets WHERE owner_profile_id = ${owner}::uuid FOR UPDATE`;
      const live = await tx.fleetInvite.findFirst({ where: { ownerProfileId: owner, phone, revokedAt: null, joinedAt: null } });
      if (live && live.expiresAt > now) return { row: live, alreadyInvited: true };
      const sentToday = await tx.auditLog.count({
        where: { action: FLEET_INVITE_ACTION, target: owner, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
      });
      if (sentToday >= FLEET_INVITES_PER_DAY) {
        throw new HttpException(
          { statusCode: 429, reason: "too_many_invites", message: `You've made ${FLEET_INVITES_PER_DAY} invite links today. Make more tomorrow.` },
          429,
        );
      }
      // A lapsed link ends here, so the number can get a new one (one live invite per owner and phone).
      if (live) await tx.fleetInvite.update({ where: { id: live.id }, data: { revokedAt: now } });
      const created = await this.createInviteRow(tx, {
        ownerProfileId: owner,
        homeMerchantId: access.merchantId,
        phone,
        displayName: body.name,
        invitedByProfileId: profileId,
        expiresAt: new Date(now.getTime() + FLEET_INVITE_TTL_DAYS * DAY_MS),
      });
      await tx.auditLog.create({ data: { actor: profileId, action: FLEET_INVITE_ACTION, target: owner, note: created.id } });
      return { row: created, alreadyInvited: false };
    });
    return this.linkResponse(row, alreadyInvited, now);
  }

  /** "Share again": the same link for a live invite (owner). */
  async inviteLink(access: MerchantAccess, inviteId: string): Promise<FleetInviteLinkResponse> {
    const owner = await this.enabledOwner(access.merchantId);
    const row = await this.prisma.fleetInvite.findFirst({ where: { id: inviteId, ownerProfileId: owner, revokedAt: null, joinedAt: null } });
    if (!row) throw new NotFoundException("Invite not found");
    return this.linkResponse(row, true, new Date());
  }

  /** "Revoke": the link stops working at once. */
  async revokeInvite(access: MerchantAccess, profileId: string, inviteId: string): Promise<{ ok: true }> {
    const owner = await this.enabledOwner(access.merchantId);
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.fleetInvite.updateMany({
        where: { id: inviteId, ownerProfileId: owner, revokedAt: null, joinedAt: null },
        data: { revokedAt: new Date() },
      });
      if (gone.count === 0) throw new NotFoundException("Invite not found");
      await tx.auditLog.create({ data: { actor: profileId, action: FLEET_INVITE_REVOKE_ACTION, target: owner, note: inviteId } });
    });
    return { ok: true };
  }

  /** "Remove from my bikers" (owner). Refused mid-job: the database guard won't let the link change then. */
  async removeBiker(access: MerchantAccess, profileId: string, riderId: string): Promise<{ ok: true }> {
    const owner = await this.enabledOwner(access.merchantId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRider(tx, riderId);
        const rider = await tx.rider.findUnique({ where: { profileId: riderId }, select: { fleetOwnerProfileId: true } });
        if (rider?.fleetOwnerProfileId !== owner) throw new NotFoundException("Not one of your bikers");
        await tx.rider.update({ where: { profileId: riderId }, data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null, fleetJoinedAt: null } });
        await tx.auditLog.create({ data: { actor: profileId, action: FLEET_REMOVE_ACTION, target: owner, note: riderId } });
      });
    } catch (err) {
      if (isFleetScopeViolation(err)) {
        reportFleetScopeViolation(err, { path: "fleet.remove", riderId });
        throw refuse(409, "on_a_job", "You can remove them after this delivery.");
      }
      throw err;
    }
    return { ok: true };
  }

  /** OB-M5's ✕: the Preferred-rider suggestions are gone for good. */
  async dismissSuggestions(access: MerchantAccess): Promise<{ ok: true }> {
    const owner = await this.enabledOwner(access.merchantId);
    await this.prisma.ownerFleet.update({ where: { ownerProfileId: owner }, data: { suggestionsDismissedAt: new Date() } });
    return { ok: true };
  }

  // ── The biker's side (biker app) ──────────────────────────────────────────────────────────────────────────

  /** `GET /fleet/me`: the fleet they ride for, and live invites to their number (OB-R1/R2). */
  async mine(profileId: string): Promise<MyFleetResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        phone: true,
        rider: {
          select: {
            kycStatus: true,
            fleetOwnerProfileId: true,
            fleetJoinedAt: true,
            fleetHomeMerchant: { select: { name: true } },
            fleetOwner: { select: { pausedAt: true } },
          },
        },
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const rider = profile.rider;
    const fleet =
      rider?.fleetOwnerProfileId && rider.fleetJoinedAt
        ? { shop: rider.fleetHomeMerchant?.name ?? "", paused: rider.fleetOwner?.pausedAt != null, joinedAt: rider.fleetJoinedAt.toISOString() }
        : null;
    const invites = await this.prisma.fleetInvite.findMany({
      where: { phone: profile.phone, revokedAt: null, joinedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, homeMerchantId: true, expiresAt: true },
    });
    const shops = await this.branchNames(invites.map((i) => i.homeMerchantId));
    return {
      fleet,
      invites: invites.map((i) => ({
        id: i.id,
        shop: shops.get(i.homeMerchantId) ?? "",
        canJoin: rider?.kycStatus === "verified",
        expiresAt: i.expiresAt.toISOString(),
      })),
    };
  }

  /** The app opened `lyniago.com/j/<code>`: mark it opened. Only the invited number sees it (404 otherwise). */
  async open(profileId: string, rawCode: string): Promise<MyFleetResponse> {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const profile = await this.prisma.profile.findUnique({ where: { id: profileId }, select: { phone: true } });
    if (!profile) throw new NotFoundException("Profile not found");
    const invite = await this.prisma.fleetInvite.findUnique({ where: { token: code }, select: { id: true, phone: true } });
    // Another number's link, or no link: the same answer, so a code reveals nothing.
    if (!invite || invite.phone !== profile.phone) throw new NotFoundException({ reason: "not_your_link", message: "This link is for another number." });
    await this.prisma.fleetInvite.updateMany({ where: { id: invite.id, openedAt: null }, data: { openedAt: new Date() } });
    return this.mine(profileId);
  }

  /** "Join" (OB-R2), with the refusals OB-R3 draws. */
  async join(profileId: string, inviteId: string): Promise<MyFleetResponse> {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        firstName: true,
        phone: true,
        rider: { select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true, fleetOwnerProfileId: true, fleetHomeMerchant: { select: { name: true } } } },
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const invite = await this.prisma.fleetInvite.findFirst({ where: { id: inviteId, phone: profile.phone } });
    if (!invite) throw new NotFoundException("Invite not found");
    const home = await this.prisma.merchant.findUnique({ where: { id: invite.homeMerchantId }, select: { name: true, ownerProfileId: true } });
    const shop = home?.name ?? "the shop";
    const now = new Date();
    const fleet = await this.prisma.ownerFleet.findUnique({ where: { ownerProfileId: invite.ownerProfileId } });
    const ended = invite.revokedAt !== null || invite.expiresAt <= now || home?.ownerProfileId !== invite.ownerProfileId || !fleet?.enabled;
    const rider = profile.rider;
    if (rider?.fleetOwnerProfileId === invite.ownerProfileId) return this.mine(profileId); // a second tap
    if (invite.joinedAt !== null || ended) throw refuse(410, "invite_ended", `This invite has ended. Ask ${shop} for a new one.`);
    if (!rider || rider.kycStatus !== "verified") throw refuse(403, "id_check_pending", "Finish your ID check to join.");
    if (onlineRefusalReason(rider) !== null) {
      throw new ForbiddenException({ reason: "account_restricted", message: "This account can't join right now. Message LyniaGo on WhatsApp." });
    }
    if (rider.fleetOwnerProfileId) throw refuse(409, "in_another_fleet", `Leave ${rider.fleetHomeMerchant?.name ?? "your other shop"} first.`);
    // OV-F8: staff or biker, not both. Someone on any of this owner's teams can't also be one of their bikers.
    const staff = await this.prisma.merchantMember.count({ where: { profileId, merchant: { ownerProfileId: invite.ownerProfileId } } });
    if (staff > 0) throw refuse(409, "works_at_shop", `You work at ${shop}. Ask them to add you as a biker from a different account.`);

    let withdrawn: string[] = [];
    try {
      withdrawn = await this.prisma.$transaction(async (tx) => {
        await this.lockRider(tx, profileId);
        const locked = await tx.rider.findUnique({ where: { profileId }, select: { fleetOwnerProfileId: true } });
        if (locked?.fleetOwnerProfileId) throw refuse(409, "in_another_fleet", `Leave ${shop} first.`);
        // Taking the invite is the claim: one revoked a moment ago can't still be joined.
        const claimed = await tx.fleetInvite.updateMany({
          where: { id: invite.id, revokedAt: null, joinedAt: null, expiresAt: { gt: now } },
          data: { joinedAt: now, openedAt: invite.openedAt ?? now },
        });
        if (claimed.count === 0) throw refuse(410, "invite_ended", `This invite has ended. Ask ${shop} for a new one.`);
        await tx.rider.update({
          where: { profileId },
          data: { fleetOwnerProfileId: invite.ownerProfileId, fleetHomeMerchantId: invite.homeMerchantId, fleetJoinedAt: now },
        });
        // Their bids on public parcels can't be picked any more: they leave every customer's list.
        const pending = await tx.offer.findMany({ where: { riderId: profileId, status: "pending" }, select: { orderId: true } });
        if (pending.length > 0) await tx.offer.updateMany({ where: { riderId: profileId, status: "pending" }, data: { status: "declined" } });
        await tx.auditLog.create({ data: { actor: profileId, action: FLEET_JOIN_ACTION, target: invite.ownerProfileId, note: invite.id } });
        return pending.map((p) => p.orderId);
      });
    } catch (err) {
      // The database guard: they took a public job between the checks above and this commit.
      if (isFleetScopeViolation(err)) {
        reportFleetScopeViolation(err, { path: "fleet.join", riderId: profileId });
        throw refuse(409, "on_a_job", "Finish this delivery, then join.");
      }
      throw err;
    }

    // Post-commit, best-effort: off the public board now, customers' offer lists refresh, the owner hears.
    void this.gateway.kickRiderFromBoard(profileId);
    for (const orderId of new Set(withdrawn)) this.gateway.emitOffersChanged(orderId);
    const name = profile.firstName.trim() || "A biker";
    void this.notifications.notifyProfiles([invite.ownerProfileId], {
      title: `${name} joined your bikers`,
      body: `${name} is ready. Book your first delivery.`,
      data: { kind: "fleet_joined", riderId: profileId },
    });
    return this.mine(profileId);
  }

  /** "Leave" (OB-R12). Refused during one of the owner's jobs: "You can leave after this delivery." */
  async leave(profileId: string): Promise<{ ok: true }> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockRider(tx, profileId);
        const rider = await tx.rider.findUnique({ where: { profileId }, select: { fleetOwnerProfileId: true } });
        if (!rider?.fleetOwnerProfileId) return; // already public
        await tx.rider.update({ where: { profileId }, data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null, fleetJoinedAt: null } });
        await tx.auditLog.create({ data: { actor: profileId, action: FLEET_LEAVE_ACTION, target: rider.fleetOwnerProfileId, note: profileId } });
      });
    } catch (err) {
      if (isFleetScopeViolation(err)) {
        reportFleetScopeViolation(err, { path: "fleet.leave", riderId: profileId });
        throw refuse(409, "on_a_job", "You can leave after this delivery.");
      }
      throw err;
    }
    return { ok: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────────────────────

  private async ownerOf(merchantId: string): Promise<string | null> {
    const m = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { ownerProfileId: true } });
    return m?.ownerProfileId ?? null;
  }

  /** The owner of this branch, whose fleet must be switched on (admin, T7). */
  private async enabledOwner(merchantId: string): Promise<string> {
    const owner = await this.ownerOf(merchantId);
    const fleet = owner ? await this.prisma.ownerFleet.findUnique({ where: { ownerProfileId: owner }, select: { enabled: true } }) : null;
    if (!owner || !fleet?.enabled) throw new ConflictException({ reason: "fleet_off", message: "Own bikers isn't on for this business." });
    return owner;
  }

  /** The rider row lock Join, Leave and Remove share (OV1: orders them against an accept's FOR SHARE). */
  private async lockRider(tx: Tx, riderId: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${riderId}::uuid FOR UPDATE`;
  }

  private async createInviteRow(
    tx: Tx,
    data: Omit<Prisma.FleetInviteUncheckedCreateInput, "token">,
  ): Promise<Prisma.FleetInviteGetPayload<object>> {
    // A code collision is ~1 in 10^15 per draw; retry a few times rather than fail the owner.
    for (let attempt = 0; ; attempt++) {
      try {
        return await tx.fleetInvite.create({ data: { ...data, token: newCode() } });
      } catch (err) {
        const tokenClash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("token");
        if (!tokenClash || attempt >= 4) throw err;
      }
    }
  }

  private async linkResponse(row: Prisma.FleetInviteGetPayload<object>, alreadyInvited: boolean, now: Date): Promise<FleetInviteLinkResponse> {
    const [invite] = await this.toInviteRows([row], now);
    return { invite, link: `${FLEET_INVITE_LINK_BASE}${row.token}`, phone: row.phone.replace(/\D/g, ""), alreadyInvited };
  }

  private async inviteRows(owner: string, now: Date): Promise<FleetInviteRow[]> {
    const rows = await this.prisma.fleetInvite.findMany({
      where: { ownerProfileId: owner, revokedAt: null, joinedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return this.toInviteRows(rows, now);
  }

  private async toInviteRows(rows: Prisma.FleetInviteGetPayload<object>[], now: Date): Promise<FleetInviteRow[]> {
    if (rows.length === 0) return [];
    const [branches, people] = await Promise.all([
      this.branchNames(rows.map((r) => r.homeMerchantId)),
      this.prisma.profile.findMany({ where: { phone: { in: rows.map((r) => r.phone) } }, select: { phone: true, rider: { select: { kycStatus: true } } } }),
    ]);
    const byPhone = new Map(people.map((p) => [p.phone, p]));
    return rows.map((r) => {
      const person = byPhone.get(r.phone);
      const state: FleetInviteState =
        r.expiresAt <= now ? "expired" : !r.openedAt ? "not_opened" : person?.rider && person.rider.kycStatus !== "verified" ? "waiting_id_check" : "signing_up";
      return {
        id: r.id,
        name: r.displayName,
        phoneMasked: maskPhone(r.phone),
        state,
        homeBranch: branches.get(r.homeMerchantId) ?? "",
        sharedAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      };
    });
  }

  private async bikerRows(owner: string, fullPhone: boolean): Promise<FleetBikerRow[]> {
    const riders = await this.prisma.rider.findMany({
      where: { fleetOwnerProfileId: owner },
      select: {
        profileId: true,
        isOnline: true,
        fleetJoinedAt: true,
        fleetHomeMerchant: { select: { name: true } },
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
    if (riders.length === 0) return [];
    const ids = riders.map((r) => r.profileId);
    const weekStart = harareWeekStart(new Date());
    const [busy, owed, drops] = await Promise.all([
      this.prisma.order.findMany({ where: { riderId: { in: ids }, status: { in: ACTIVE_RIDE_STATUSES } }, select: { riderId: true } }),
      // OV-F3: open cash debts owed to THIS owner's branches (a venue order's, or a booking's cash on delivery).
      this.prisma.order.findMany({
        where: {
          riderId: { in: ids },
          debtStatus: "open",
          merchantClosedAt: null,
          OR: [{ merchant: { is: { ownerProfileId: owner } } }, { merchantBooking: { is: { merchant: { ownerProfileId: owner } } } }],
        },
        select: { riderId: true, debtAmount: true },
      }),
      // OV-F2: a fleet drop adds no strike; the owner sees it here instead.
      this.prisma.auditLog.groupBy({ by: ["actor"], where: { action: FLEET_DROP_ACTION, actor: { in: ids }, createdAt: { gte: weekStart } }, _count: { _all: true } }),
    ]);
    const onJob = new Set(busy.map((b) => b.riderId));
    const cash = new Map<string, number>();
    for (const o of owed) if (o.riderId) cash.set(o.riderId, addMoney(cash.get(o.riderId) ?? 0, Number(o.debtAmount ?? 0)));
    const cancels = new Map(drops.map((d) => [d.actor, d._count._all]));
    const rank: Record<FleetBikerState, number> = { on_a_job: 0, online: 1, offline: 2 };
    return riders
      .map((r) => {
        const state: FleetBikerState = onJob.has(r.profileId) ? "on_a_job" : r.isOnline ? "online" : "offline";
        return {
          riderId: r.profileId,
          name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
          phone: fullPhone ? r.profile.phone : maskPhone(r.profile.phone),
          homeBranch: r.fleetHomeMerchant?.name ?? "",
          state,
          joinedAt: (r.fleetJoinedAt ?? new Date(0)).toISOString(),
          cashHeld: (cash.get(r.profileId) ?? 0) > 0 ? cash.get(r.profileId)!.toFixed(2) : null,
          cancelsThisWeek: cancels.get(r.profileId) ?? 0,
        };
      })
      .sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name));
  }

  /** OB-M5: the owner's old Preferred riders (any branch), less anyone already a biker or invited. */
  private async suggestions(owner: string, bikers: FleetBikerRow[]): Promise<FleetSuggestion[]> {
    const preferred = await this.prisma.merchantPreferredRider.findMany({
      where: { merchant: { ownerProfileId: owner } },
      orderBy: { createdAt: "asc" },
      select: { phone: true, label: true },
    });
    if (preferred.length === 0) return [];
    const [bikerPhones, invitedPhones] = await Promise.all([
      this.prisma.profile.findMany({ where: { id: { in: bikers.map((b) => b.riderId) } }, select: { phone: true } }),
      this.prisma.fleetInvite.findMany({ where: { ownerProfileId: owner, revokedAt: null, joinedAt: null }, select: { phone: true } }),
    ]);
    const taken = new Set([...bikerPhones.map((p) => p.phone), ...invitedPhones.map((p) => p.phone)]);
    const seen = new Set<string>();
    return preferred.filter((p) => !taken.has(p.phone) && !seen.has(p.phone) && seen.add(p.phone)).map((p) => ({ name: p.label, phone: p.phone }));
  }

  private async branchNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.merchant.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
