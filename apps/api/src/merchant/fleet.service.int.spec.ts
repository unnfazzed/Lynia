/**
 * Own bikers T3a (D-117): invites, Join, Leave and Remove on a real Postgres (needs DATABASE_URL), so the
 * locks, the partial unique "one live invite per phone" and the migration-0108 guards are the real ones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FLEET_INVITE_LINK_BASE } from "@lynia/shared";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { MerchantAccess } from "./merchant-access";
import { FleetService } from "./fleet.service";
import { MerchantInvitesService } from "./merchant-invites.service";
import type { MerchantService } from "./merchant.service";

const prisma = new PrismaService();
const gateway = { kickRiderFromBoard: vi.fn(async () => {}), emitOffersChanged: vi.fn() };
const notifications = { notifyProfiles: vi.fn(async () => new Set<string>()) };
const fleet = new FleetService(prisma, gateway as unknown as TrackingGateway, notifications as unknown as NotificationsService);

const WAYPOINT = { lat: -17.82, lng: 31.05, landmark: "CBD", contactPhone: "+263770000000" };
let seq = 0;
const nextPhone = () => `+26377${String(1_000_000 + ++seq).slice(-7)}`;

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "merchant.fleet." } } });
  await prisma.fleetInvite.deleteMany({});
  await prisma.merchantInvite.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.merchantPreferredRider.deleteMany({});
  await prisma.merchantMember.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.ownerFleet.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function person(firstName: string, phone = nextPhone()): Promise<{ id: string; phone: string }> {
  const p = await prisma.profile.create({ data: { role: "rider", firstName, lastName: "T", phone }, select: { id: true, phone: true } });
  return p;
}

async function owner(opts: { enabled?: boolean } = {}): Promise<{ ownerId: string; branchId: string; access: MerchantAccess }> {
  const o = await person("Owner");
  await prisma.ownerFleet.create({ data: { ownerProfileId: o.id, enabled: opts.enabled ?? true, rideFee: 1.5 } });
  const m = await prisma.merchant.create({ data: { name: "Chicken Inn Avondale", ownerProfileId: o.id }, select: { id: true } });
  await prisma.merchantMember.create({ data: { merchantId: m.id, profileId: o.id, role: "owner", displayName: "Owner" } });
  return { ownerId: o.id, branchId: m.id, access: { merchantId: m.id, role: "owner", businessType: "restaurant" } as MerchantAccess };
}

async function biker(firstName: string, kyc: "verified" | "pending" = "verified"): Promise<{ id: string; phone: string }> {
  const p = await person(firstName);
  await prisma.rider.create({ data: { profileId: p.id, bikeReg: "ABZ 0000", kycStatus: kyc, isOnline: true } });
  return p;
}

beforeAll(async () => {
  await prisma.$connect();
});
beforeEach(async () => {
  await clean();
  vi.clearAllMocks();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("invites (owner)", () => {
  it("makes a phone-bound link, returns the same link on a re-invite, and lists it as not opened", async () => {
    const o = await owner();
    const first = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: "0771234567" });
    expect(first.link.startsWith(FLEET_INVITE_LINK_BASE)).toBe(true);
    expect(first.alreadyInvited).toBe(false);
    expect(first.phone).toBe("263771234567");
    const again = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: "+263 77 123 4567" });
    expect(again).toMatchObject({ link: first.link, alreadyInvited: true });
    const roster = await fleet.roster(o.access);
    expect(roster.invites).toHaveLength(1);
    expect(roster.invites[0]).toMatchObject({ name: "Kuda", state: "not_opened", homeBranch: "Chicken Inn Avondale" });
  });

  it("replaces a lapsed link with a new one", async () => {
    const o = await owner();
    const first = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: "0771234567" });
    await prisma.fleetInvite.update({ where: { id: first.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await fleet.roster(o.access)).invites[0].state).toBe("expired");
    const fresh = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: "0771234567" });
    expect(fresh.alreadyInvited).toBe(false);
    expect(fresh.link).not.toBe(first.link);
  });

  it("refuses a business whose Own bikers is off, and a number that is already one of the owner's bikers", async () => {
    const off = await owner({ enabled: false });
    await expect(fleet.invite(off.access, off.ownerId, { name: "Kuda", phone: "0771234567" })).rejects.toMatchObject({ response: { reason: "fleet_off" } });
    expect((await fleet.roster(off.access)).enabled).toBe(false);

    const o = await owner();
    const b = await biker("Tendai");
    await prisma.rider.update({ where: { profileId: b.id }, data: { fleetOwnerProfileId: o.ownerId, fleetHomeMerchantId: o.branchId, fleetJoinedAt: new Date() } });
    await expect(fleet.invite(o.access, o.ownerId, { name: "Tendai", phone: b.phone })).rejects.toMatchObject({ response: { reason: "already_biker" } });
  });

  it("revoke ends the link: the biker can no longer join with it", async () => {
    const o = await owner();
    const b = await biker("Kuda");
    const inv = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: b.phone });
    await fleet.revokeInvite(o.access, o.ownerId, inv.invite.id);
    await expect(fleet.join(b.id, inv.invite.id)).rejects.toMatchObject({ response: { reason: "invite_ended" } });
    expect((await fleet.roster(o.access)).invites).toHaveLength(0);
  });
});

describe("the biker's side", () => {
  it("only the invited number can open the link; opening it moves the owner's row on and shows the invite", async () => {
    const o = await owner();
    const kuda = await biker("Kuda", "pending");
    const stranger = await biker("Stranger");
    const inv = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: kuda.phone });
    const code = inv.link.slice(FLEET_INVITE_LINK_BASE.length);
    await expect(fleet.open(stranger.id, code)).rejects.toMatchObject({ response: { reason: "not_your_link" } });
    const mine = await fleet.open(kuda.id, code.toLowerCase());
    expect(mine.invites).toEqual([expect.objectContaining({ id: inv.invite.id, shop: "Chicken Inn Avondale", canJoin: false })]);
    expect((await fleet.roster(o.access)).invites[0].state).toBe("waiting_id_check");
  });

  it("refuses Join until the ID check passes, then joins, withdraws public bids and tells the owner", async () => {
    const o = await owner();
    const kuda = await biker("Kuda", "pending");
    const inv = await fleet.invite(o.access, o.ownerId, { name: "Kuda", phone: kuda.phone });
    await expect(fleet.join(kuda.id, inv.invite.id)).rejects.toMatchObject({ response: { reason: "id_check_pending" } });
    await prisma.rider.update({ where: { profileId: kuda.id }, data: { kycStatus: "verified" } });

    // A pending bid on a public parcel, placed before joining.
    const customer = await person("Customer");
    const order = await prisma.order.create({
      data: { customerId: customer.id, pickup: WAYPOINT, dropoff: WAYPOINT, itemDesc: "docs", suggestedFare: 2.5, proposedFare: 2.5, status: "open_for_offers" },
      select: { id: true },
    });
    await prisma.offer.create({ data: { orderId: order.id, riderId: kuda.id, type: "accept", offeredFare: 2.5, etaMinutes: 5 } });

    const mine = await fleet.join(kuda.id, inv.invite.id);
    expect(mine.fleet).toMatchObject({ shop: "Chicken Inn Avondale", paused: false });
    expect(mine.invites).toEqual([]);
    expect(await prisma.offer.count({ where: { riderId: kuda.id, status: "pending" } })).toBe(0);
    expect(gateway.kickRiderFromBoard).toHaveBeenCalledWith(kuda.id);
    expect(gateway.emitOffersChanged).toHaveBeenCalledWith(order.id);
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([o.ownerId], expect.objectContaining({ title: "Kuda joined your bikers" }));
    const roster = await fleet.roster(o.access);
    expect(roster.bikers).toEqual([expect.objectContaining({ riderId: kuda.id, state: "online", homeBranch: "Chicken Inn Avondale" })]);
    expect(roster.invites).toEqual([]);
    // A second tap is a no-op, not an error.
    await expect(fleet.join(kuda.id, inv.invite.id)).resolves.toMatchObject({ fleet: expect.anything() });
  });

  it("refuses staff of the owner (OV-F8), and a biker already in another fleet", async () => {
    const o = await owner();
    const cashier = await biker("Cashier");
    await prisma.merchantMember.create({ data: { merchantId: o.branchId, profileId: cashier.id, role: "staff", displayName: "Cashier" } });
    const staffInv = await fleet.invite(o.access, o.ownerId, { name: "Cashier", phone: cashier.phone });
    await expect(fleet.join(cashier.id, staffInv.invite.id)).rejects.toMatchObject({ response: { reason: "works_at_shop" } });

    const other = await owner();
    await prisma.merchant.update({ where: { id: other.branchId }, data: { name: "Pizza Inn" } });
    const b = await biker("Blessing");
    await prisma.rider.update({ where: { profileId: b.id }, data: { fleetOwnerProfileId: other.ownerId, fleetHomeMerchantId: other.branchId, fleetJoinedAt: new Date() } });
    const inv = await fleet.invite(o.access, o.ownerId, { name: "Blessing", phone: b.phone });
    await expect(fleet.join(b.id, inv.invite.id)).rejects.toMatchObject({ response: { reason: "in_another_fleet", message: "Leave Pizza Inn first." } });
  });

  it("Leave and Remove are refused during one of the owner's jobs, and work once it is done", async () => {
    const o = await owner();
    const b = await biker("Tendai");
    await prisma.rider.update({ where: { profileId: b.id }, data: { fleetOwnerProfileId: o.ownerId, fleetHomeMerchantId: o.branchId, fleetJoinedAt: new Date() } });
    const customer = await person("Customer");
    const job = await prisma.order.create({
      data: {
        customerId: customer.id,
        merchantId: o.branchId,
        orderType: "merchant",
        pickup: WAYPOINT,
        dropoff: WAYPOINT,
        itemDesc: "chicken",
        suggestedFare: 2.5,
        proposedFare: 2.5,
        status: "open_for_offers",
        fleetMerchantId: o.branchId,
        fleetFee: 1.5,
      },
      select: { id: true },
    });
    await prisma.order.update({ where: { id: job.id }, data: { riderId: b.id, status: "assigned" } });
    expect((await fleet.roster(o.access)).bikers[0].state).toBe("on_a_job");

    await expect(fleet.leave(b.id)).rejects.toMatchObject({ response: { reason: "on_a_job", message: "You can leave after this delivery." } });
    await expect(fleet.removeBiker(o.access, o.ownerId, b.id)).rejects.toMatchObject({ response: { reason: "on_a_job" } });
    await prisma.order.update({ where: { id: job.id }, data: { status: "delivered" } });
    await expect(fleet.leave(b.id)).resolves.toEqual({ ok: true });
    expect((await fleet.mine(b.id)).fleet).toBeNull();
  });
});

describe("staff or biker, not both (OV-F8), from the team side", () => {
  it("one of the owner's Own bikers can't join the owner's team as staff", async () => {
    const o = await owner();
    const b = await biker("Tendai");
    await prisma.rider.update({ where: { profileId: b.id }, data: { fleetOwnerProfileId: o.ownerId, fleetHomeMerchantId: o.branchId, fleetJoinedAt: new Date() } });
    const invite = await prisma.merchantInvite.create({
      data: { merchantId: o.branchId, phone: b.phone, displayName: "Tendai", invitedByProfileId: o.ownerId, expiresAt: new Date(Date.now() + 864e5) },
    });
    const team = new MerchantInvitesService(prisma, {} as MerchantService);
    await expect(team.join(b.id, invite.id, { name: "Tendai", termsAccepted: true })).rejects.toMatchObject({ response: { reason: "fleet_biker" } });
    expect(await prisma.merchantMember.count({ where: { profileId: b.id } })).toBe(0);
  });
});

describe("roster", () => {
  it("staff see bikers read-only with masked numbers and no suggestions; the owner sees Preferred riders once", async () => {
    const o = await owner();
    const b = await biker("Tendai");
    await prisma.rider.update({ where: { profileId: b.id }, data: { fleetOwnerProfileId: o.ownerId, fleetHomeMerchantId: o.branchId, fleetJoinedAt: new Date() } });
    await prisma.merchantPreferredRider.create({ data: { merchantId: o.branchId, phone: "+263779999999", label: "Farai", addedByProfileId: o.ownerId } });
    await prisma.merchantPreferredRider.create({ data: { merchantId: o.branchId, phone: b.phone, label: "Tendai", addedByProfileId: o.ownerId } });

    const asOwner = await fleet.roster(o.access);
    expect(asOwner.bikers[0].phone).toBe(b.phone);
    expect(asOwner.suggestions).toEqual([{ name: "Farai", phone: "+263779999999" }]);

    const asStaff = await fleet.roster({ ...o.access, role: "staff" } as MerchantAccess);
    expect(asStaff.role).toBe("staff");
    expect(asStaff.bikers[0].phone).not.toBe(b.phone);
    expect(asStaff.suggestions).toEqual([]);

    await fleet.dismissSuggestions(o.access);
    expect((await fleet.roster(o.access)).suggestions).toEqual([]);
  });
});

describe("E4: one owner can't reach another owner's fleet", () => {
  it("another owner's biker, invite and link all read as not found, and change nothing", async () => {
    const a = await owner();
    const b = await owner();
    const tendai = await biker("Tendai");
    await prisma.rider.update({ where: { profileId: tendai.id }, data: { fleetOwnerProfileId: a.ownerId, fleetHomeMerchantId: a.branchId, fleetJoinedAt: new Date() } });
    const inv = await fleet.invite(a.access, a.ownerId, { name: "Kuda", phone: "0771234567" });

    await expect(fleet.removeBiker(b.access, b.ownerId, tendai.id)).rejects.toMatchObject({ status: 404 });
    await expect(fleet.revokeInvite(b.access, b.ownerId, inv.invite.id)).rejects.toMatchObject({ status: 404 });
    await expect(fleet.inviteLink(b.access, inv.invite.id)).rejects.toMatchObject({ status: 404 });

    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: tendai.id } })).fleetOwnerProfileId).toBe(a.ownerId);
    expect((await prisma.fleetInvite.findUniqueOrThrow({ where: { id: inv.invite.id } })).revokedAt).toBeNull();
    const roster = await fleet.roster(b.access);
    expect(roster.bikers).toEqual([]);
    expect(roster.invites).toEqual([]);
  });
});
