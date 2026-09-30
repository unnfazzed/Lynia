import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { MerchantAccess } from "./merchant-access";
import { MerchantInvitesService, TEAM_DECLINE_ACTION, TEAM_JOIN_ACTION } from "./merchant-invites.service";
import {
  MerchantTeamService,
  TEAM_INVITE_ACTION,
  TEAM_INVITE_CANCEL_ACTION,
  TEAM_LEAVE_ACTION,
  TEAM_REMOVE_ACTION,
} from "./merchant-team.service";
import type { MerchantService } from "./merchant.service";

/* ── An in-memory slice of the tables Team touches ─────────────────────────────────────────────── */

interface Person {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  onHold: boolean;
  rider: { accountStatus: string } | null;
}
interface Member {
  id: string;
  merchantId: string;
  profileId: string;
  role: "owner" | "staff";
  displayName: string;
  termsAcceptedAt: Date | null;
  addedByProfileId: string | null;
  createdAt: Date;
}
interface Invite { id: string; merchantId: string; phone: string; displayName: string; invitedByProfileId: string; createdAt: Date; expiresAt: Date }
interface Audit { actor: string; action: string; target: string; note: string | null; createdAt: Date }

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const unique = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });

function makeWorld() {
  const people = new Map<string, Person>();
  const merchants = new Map<string, { id: string; name: string; businessType: "restaurant" | "shop"; ownerProfileId: string | null }>();
  const members: Member[] = [];
  const invites: Invite[] = [];
  const audit: Audit[] = [];
  /** Set to make a Join lose a race to a Join elsewhere, committed just before it takes the person's lock. */
  let raceWinner: Omit<Member, "id" | "createdAt"> | null = null;

  const merchantView = (merchantId: string) => {
    const m = merchants.get(merchantId)!;
    const owner = members.find((x) => x.merchantId === merchantId && x.role === "owner");
    const ownerProfile = m.ownerProfileId ? people.get(m.ownerProfileId) : undefined;
    return {
      name: m.name,
      businessType: m.businessType,
      ownerProfile: ownerProfile ? { firstName: ownerProfile.firstName } : null,
      members: owner ? [{ displayName: owner.displayName }] : [],
    };
  };
  const inviteView = (i: Invite) => ({ ...i, merchant: merchantView(i.merchantId) });

  const prisma = {
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) => people.get(where.id) ?? null,
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Person> }) => Object.assign(people.get(where.id)!, data)),
    },
    merchant: {
      // resolveMerchantAccess's legacy fallback: nobody here predates the owner backfill.
      findFirst: async () => null,
    },
    merchantMember: {
      // A business's team, or (listMemberships / the Join lock) the businesses one person is on.
      findMany: async ({ where }: { where: { merchantId?: string; profileId?: string } }) =>
        members
          .filter((m) => (where.merchantId === undefined || m.merchantId === where.merchantId) && (where.profileId === undefined || m.profileId === where.profileId))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((m) => ({ ...m, profile: { phone: people.get(m.profileId)!.phone } })),
      // The resolver's active-row read ({ profileId }), or one person on one team.
      findFirst: async ({ where }: { where: { merchantId?: string; profileId: string } }) => {
        const m = members.find((x) => x.profileId === where.profileId && (where.merchantId === undefined || x.merchantId === where.merchantId));
        return m ? { ...m, merchant: { businessType: merchants.get(m.merchantId)!.businessType } } : null;
      },
      count: async ({ where }: { where: { merchantId: string; profile: { phone: string } } }) =>
        members.filter((m) => m.merchantId === where.merchantId && people.get(m.profileId)?.phone === where.profile.phone).length,
      create: vi.fn(async ({ data }: { data: Omit<Member, "id" | "createdAt"> }) => {
        // Unique per (person, business) since multi-branch owners.
        if (members.some((m) => m.profileId === data.profileId && m.merchantId === data.merchantId)) throw unique();
        const row = { ...data, id: uuid(), createdAt: new Date() };
        members.push(row);
        return row;
      }),
      deleteMany: async ({ where }: { where: { merchantId: string; profileId: string; role?: string } }) => {
        const before = members.length;
        for (let i = members.length - 1; i >= 0; i--) {
          const m = members[i]!;
          if (m.merchantId === where.merchantId && m.profileId === where.profileId && (where.role === undefined || m.role === where.role)) members.splice(i, 1);
        }
        return { count: before - members.length };
      },
    },
    merchantInvite: {
      findMany: async ({ where }: { where: { merchantId?: string; phone?: string; expiresAt: { gt: Date } } }) =>
        invites
          .filter((i) => (where.merchantId === undefined || i.merchantId === where.merchantId) && (where.phone === undefined || i.phone === where.phone))
          .filter((i) => i.expiresAt > where.expiresAt.gt)
          .sort((a, b) => (where.phone ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()))
          .map(inviteView),
      findFirst: async ({ where }: { where: { id: string; phone: string } }) => {
        const i = invites.find((x) => x.id === where.id && x.phone === where.phone);
        return i ? inviteView(i) : null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { merchantId_phone: { merchantId: string; phone: string } };
        create: Omit<Invite, "id" | "createdAt">;
        update: Partial<Invite>;
      }) => {
        const found = invites.find((i) => i.merchantId === where.merchantId_phone.merchantId && i.phone === where.merchantId_phone.phone);
        if (found) return Object.assign(found, update);
        const row = { ...create, id: uuid(), createdAt: new Date() };
        invites.push(row);
        return row;
      },
      deleteMany: async ({ where }: { where: { id: string; merchantId?: string; phone?: string } }) => {
        const i = invites.findIndex(
          (x) => x.id === where.id && (where.merchantId === undefined || x.merchantId === where.merchantId) && (where.phone === undefined || x.phone === where.phone),
        );
        if (i < 0) return { count: 0 };
        invites.splice(i, 1);
        return { count: 1 };
      },
    },
    auditLog: {
      count: async ({ where }: { where: { action: string; target: string; createdAt: { gte: Date } } }) =>
        audit.filter((a) => a.action === where.action && a.target === where.target && a.createdAt >= where.createdAt.gte).length,
      create: vi.fn(async ({ data }: { data: Omit<Audit, "createdAt"> }) => {
        audit.push({ ...data, createdAt: new Date() });
        return data;
      }),
    },
    // The Join's profile lock: a racing Join elsewhere commits just before we get it.
    $executeRaw: vi.fn(async () => {
      if (raceWinner) {
        members.push({ ...raceWinner, id: uuid(), createdAt: new Date() });
        raceWinner = null;
      }
      return 1;
    }),
    $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
  };

  const gateway = { evictFromMerchantQueue: vi.fn(async () => {}) };
  const merchantService = { getMyMerchant: vi.fn(async (profileId: string) => ({ id: members.find((m) => m.profileId === profileId)?.merchantId })) };
  const team = new MerchantTeamService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
  const invitesSvc = new MerchantInvitesService(prisma as unknown as PrismaService, merchantService as unknown as MerchantService);

  const person = (id: string, phone: string, over: Partial<Person> = {}) => {
    const p = { id, phone, firstName: "", lastName: "", onHold: false, rider: null, ...over };
    people.set(id, p);
    return p;
  };
  const member = (merchantId: string, profileId: string, role: Member["role"], displayName: string, ageMs = 0) => {
    members.push({ id: uuid(), merchantId, profileId, role, displayName, termsAcceptedAt: new Date(), addedByProfileId: null, createdAt: new Date(Date.now() - ageMs) });
  };
  const invite = (merchantId: string, phone: string, displayName: string, over: Partial<Invite> = {}) => {
    const row = { id: uuid(), merchantId, phone, displayName, invitedByProfileId: "owner-1", createdAt: new Date(), expiresAt: new Date(Date.now() + 14 * DAY), ...over };
    invites.push(row);
    return row;
  };
  const raceTo = (row: Omit<Member, "id" | "createdAt">) => {
    raceWinner = row;
  };
  return { team, invitesSvc, prisma, gateway, merchantService, people, merchants, members, invites, audit, person, member, invite, raceTo };
}

const OWNER: MerchantAccess = { merchantId: "m1", role: "owner", businessType: "shop" };
const STAFF: MerchantAccess = { merchantId: "m1", role: "staff", businessType: "shop" };

let w: ReturnType<typeof makeWorld>;
beforeEach(() => {
  w = makeWorld();
  w.merchants.set("m1", { id: "m1", name: "Mbare Auto Spares", businessType: "shop", ownerProfileId: "owner-1" });
  w.merchants.set("m2", { id: "m2", name: "Sadza Republic", businessType: "restaurant", ownerProfileId: "owner-2" });
  w.person("owner-1", "+263771000001", { firstName: "Farai", lastName: "Chari" });
  w.person("owner-2", "+263772000002", { firstName: "Rudo", lastName: "Dube" });
  w.member("m1", "owner-1", "owner", "Farai Chari", 60_000);
  w.member("m2", "owner-2", "owner", "Rudo Dube", 60_000);
});

describe("MerchantTeamService.team (merchant web upgrade L4)", () => {
  it("lists the owner first, then everyone in the order they joined, with masked numbers and live invites only", async () => {
    w.person("staff-1", "+263773000003");
    w.person("staff-2", "+263774000004");
    w.member("m1", "staff-2", "staff", "Tendai", 10_000);
    w.member("m1", "staff-1", "staff", "Chipo", 30_000);
    w.invite("m1", "+263775000005", "Nyasha");
    w.invite("m1", "+263776000006", "Old invite", { expiresAt: new Date(Date.now() - 1000) });
    w.invite("m2", "+263777000007", "Another business's");

    const res = await w.team.team(OWNER, "owner-1");

    expect(res.members.map((m) => [m.name, m.role, m.you])).toEqual([
      ["Farai Chari", "owner", true],
      ["Chipo", "staff", false],
      ["Tendai", "staff", false],
    ]);
    expect(res.members[1]!.phoneMasked).not.toContain("3000003");
    expect(res.invites.map((i) => [i.name, i.invitePhone])).toEqual([["Nyasha", "263775000005"]]);
  });
});

describe("MerchantTeamService.invite", () => {
  it("creates a 14-day invite and audit-logs it", async () => {
    const res = await w.team.invite(OWNER, "owner-1", { name: "Chipo", phone: "0773 000 003" });

    expect(res).toMatchObject({ name: "Chipo", invitePhone: "263773000003" });
    expect(new Date(res.expiresAt).getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(w.invites).toHaveLength(1);
    expect(w.audit).toEqual([expect.objectContaining({ actor: "owner-1", action: TEAM_INVITE_ACTION, target: "m1", note: res.id })]);
    // One invite at a time per business, so the daily limit can't be raced.
    expect(w.prisma.$executeRaw).toHaveBeenCalled();
  });

  it("never reveals whether the number works at another business", async () => {
    w.person("elsewhere", "+263778000008");
    w.member("m2", "elsewhere", "staff", "Kuda");
    await expect(w.team.invite(OWNER, "owner-1", { name: "Kuda", phone: "0778000008" })).resolves.toMatchObject({ name: "Kuda" });
  });

  it("says so when the number is already on this team", async () => {
    w.person("staff-1", "+263773000003");
    w.member("m1", "staff-1", "staff", "Chipo");
    await expect(w.team.invite(OWNER, "owner-1", { name: "Chipo", phone: "0773000003" })).rejects.toMatchObject({
      status: 409,
      response: { reason: "already_on_team" },
    });
  });

  it("refreshes a re-invite instead of making a second one", async () => {
    const old = w.invite("m1", "+263773000003", "Chip", { expiresAt: new Date(Date.now() + DAY) });
    const res = await w.team.invite(OWNER, "owner-1", { name: "Chipo", phone: "+263773000003" });
    expect(res.id).toBe(old.id);
    expect(w.invites).toHaveLength(1);
    expect(w.invites[0]!.displayName).toBe("Chipo");
    expect(w.invites[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
  });

  it("stops at 10 invites a day per business", async () => {
    for (let i = 0; i < 10; i++) w.audit.push({ actor: "owner-1", action: TEAM_INVITE_ACTION, target: "m1", note: null, createdAt: new Date() });
    await expect(w.team.invite(OWNER, "owner-1", { name: "Chipo", phone: "0773000003" })).rejects.toMatchObject({
      status: 429,
      response: { reason: "too_many_invites", message: "You've sent 10 invites today. Send more tomorrow." },
    });
    expect(w.invites).toHaveLength(0);
  });

  it("refuses a number that isn't one", async () => {
    await expect(w.team.invite(OWNER, "owner-1", { name: "Chipo", phone: "12345" })).rejects.toMatchObject({ status: 400, response: { reason: "bad_phone" } });
  });
});

describe("MerchantTeamService.cancelInvite / removeMember / leave", () => {
  it("cancels only this business's invite", async () => {
    const mine = w.invite("m1", "+263773000003", "Chipo");
    const theirs = w.invite("m2", "+263773000003", "Chipo");
    await expect(w.team.cancelInvite(OWNER, "owner-1", theirs.id)).rejects.toMatchObject({ status: 404 });
    await expect(w.team.cancelInvite(OWNER, "owner-1", mine.id)).resolves.toEqual({ ok: true });
    expect(w.invites.map((i) => i.id)).toEqual([theirs.id]);
    expect(w.audit.at(-1)).toMatchObject({ action: TEAM_INVITE_CANCEL_ACTION, target: "m1", note: mine.id });
  });

  it("removes a staff member, audit-logs it and takes their devices off the live queue", async () => {
    w.person("staff-1", "+263773000003");
    w.member("m1", "staff-1", "staff", "Chipo");
    await expect(w.team.removeMember(OWNER, "owner-1", "staff-1")).resolves.toEqual({ ok: true });
    expect(w.members.some((m) => m.profileId === "staff-1")).toBe(false);
    expect(w.audit.at(-1)).toMatchObject({ action: TEAM_REMOVE_ACTION, target: "m1", note: "staff-1" });
    expect(w.gateway.evictFromMerchantQueue).toHaveBeenCalledWith("staff-1", "m1");
  });

  it("never removes the owner, and treats someone on another team as missing", async () => {
    await expect(w.team.removeMember(OWNER, "owner-1", "owner-1")).rejects.toMatchObject({ status: 409, response: { reason: "owner_stays" } });
    await expect(w.team.removeMember(OWNER, "owner-1", "owner-2")).rejects.toMatchObject({ status: 404 });
    expect(w.members).toHaveLength(2);
    expect(w.gateway.evictFromMerchantQueue).not.toHaveBeenCalled();
  });

  it("keeps the removal when the eviction fails", async () => {
    w.person("staff-1", "+263773000003");
    w.member("m1", "staff-1", "staff", "Chipo");
    w.gateway.evictFromMerchantQueue.mockRejectedValueOnce(new Error("adapter down"));
    await expect(w.team.removeMember(OWNER, "owner-1", "staff-1")).resolves.toEqual({ ok: true });
    expect(w.members.some((m) => m.profileId === "staff-1")).toBe(false);
  });

  it("lets staff leave, and never the owner", async () => {
    w.person("staff-1", "+263773000003");
    w.member("m1", "staff-1", "staff", "Chipo");
    await expect(w.team.leave(OWNER, "owner-1")).rejects.toMatchObject({ status: 409, response: { reason: "owner_stays" } });
    await expect(w.team.leave(STAFF, "staff-1")).resolves.toEqual({ ok: true });
    expect(w.members.some((m) => m.profileId === "staff-1")).toBe(false);
    expect(w.audit.at(-1)).toMatchObject({ actor: "staff-1", action: TEAM_LEAVE_ACTION, target: "m1" });
    expect(w.gateway.evictFromMerchantQueue).toHaveBeenCalledWith("staff-1", "m1");
  });
});

describe("MerchantInvitesService (the invited person's side)", () => {
  beforeEach(() => {
    w.person("chipo", "+263773000003");
  });

  it("lists the invites waiting for the signed-in number, newest first, naming the owner by first name", async () => {
    w.invite("m1", "+263773000003", "Chipo", { createdAt: new Date(Date.now() - DAY) });
    w.invite("m2", "+263773000003", "Chipo M", { createdAt: new Date() });
    w.invite("m1", "+263779999999", "Someone else");
    w.invite("m2", "+263773000003", "Expired", { expiresAt: new Date(Date.now() - 1) });

    const { invites } = await w.invitesSvc.mine("chipo");

    expect(invites.map((i) => [i.businessName, i.ownerName, i.name, i.role, i.businessType])).toEqual([
      ["Sadza Republic", "Rudo", "Chipo M", "staff", "restaurant"],
      ["Mbare Auto Spares", "Farai", "Chipo", "staff", "shop"],
    ]);
  });

  it("Join makes them Staff with their own name and the terms time, fills an empty profile name, and audit-logs it", async () => {
    const inv = w.invite("m1", "+263773000003", "Chip");

    const res = await w.invitesSvc.join("chipo", inv.id, { name: "Chipo Moyo", termsAccepted: true });

    expect(res).toEqual({ id: "m1" });
    expect(w.members.find((m) => m.profileId === "chipo")).toMatchObject({
      merchantId: "m1",
      role: "staff",
      displayName: "Chipo Moyo",
      addedByProfileId: "owner-1",
      termsAcceptedAt: expect.any(Date),
    });
    expect(w.people.get("chipo")).toMatchObject({ firstName: "Chipo", lastName: "Moyo" });
    expect(w.invites).toHaveLength(0);
    expect(w.audit.at(-1)).toMatchObject({ actor: "chipo", action: TEAM_JOIN_ACTION, target: "m1", note: inv.id });
  });

  it("never overwrites a name they chose in the app", async () => {
    w.people.get("chipo")!.firstName = "Chipo";
    w.people.get("chipo")!.lastName = "Ncube";
    const inv = w.invite("m1", "+263773000003", "Chip");
    await w.invitesSvc.join("chipo", inv.id, { name: "Chip", termsAccepted: true });
    expect(w.prisma.profile.update).not.toHaveBeenCalled();
    expect(w.members.find((m) => m.profileId === "chipo")!.displayName).toBe("Chip");
  });

  it("settles one business per phone at Join, without naming the other business", async () => {
    w.member("m2", "chipo", "staff", "Chipo");
    const inv = w.invite("m1", "+263773000003", "Chipo");
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({
      status: 409,
      response: {
        reason: "member_elsewhere",
        message: "Your number already works at another business on LyniaGo. Leave it first to join Mbare Auto Spares.",
      },
    });
    expect(w.invites).toHaveLength(1);
  });

  it("a Join that loses a race to another business reads as member_elsewhere", async () => {
    const inv = w.invite("m1", "+263773000003", "Chipo");
    w.raceTo({ merchantId: "m2", profileId: "chipo", role: "staff", displayName: "Chipo", termsAcceptedAt: new Date(), addedByProfileId: "owner-2" });
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({
      response: { reason: "member_elsewhere" },
    });
  });

  it("a second Join on the same team is harmless", async () => {
    w.member("m1", "chipo", "staff", "Chipo");
    const inv = w.invite("m1", "+263773000003", "Chipo");
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).resolves.toEqual({ id: "m1" });
    expect(w.members.filter((m) => m.profileId === "chipo")).toHaveLength(1);
    expect(w.invites).toHaveLength(0);
  });

  it("an invite the owner cancels while the person taps Join can't still be joined", async () => {
    const inv = w.invite("m1", "+263773000003", "Chipo");
    const realFindFirst = w.prisma.merchantInvite.findFirst;
    w.prisma.merchantInvite.findFirst = async (args) => {
      const seen = await realFindFirst(args);
      w.invites.splice(0, w.invites.length); // the owner's Cancel commits after our read
      return seen;
    };
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({ status: 404 });
    expect(w.members.some((m) => m.profileId === "chipo")).toBe(false);
  });

  it("an expired invite says whom to ask", async () => {
    const inv = w.invite("m1", "+263773000003", "Chipo", { expiresAt: new Date(Date.now() - 1) });
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({
      status: 410,
      response: { reason: "invite_expired", message: "This invite has expired. Ask Farai to send a new one." },
    });
  });

  it("an invite to another number is not found, never forbidden", async () => {
    const inv = w.invite("m1", "+263779999999", "Someone else");
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({ status: 404 });
    await expect(w.invitesSvc.decline("chipo", inv.id)).rejects.toMatchObject({ status: 404 });
    expect(w.invites).toHaveLength(1);
  });

  it("refuses a held account or a restricted rider, as opening a business does", async () => {
    const inv = w.invite("m1", "+263773000003", "Chipo");
    w.people.get("chipo")!.onHold = true;
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({ status: 403, response: { reason: "on_hold" } });
    w.people.get("chipo")!.onHold = false;
    w.people.get("chipo")!.rider = { accountStatus: "suspended" };
    await expect(w.invitesSvc.join("chipo", inv.id, { name: "Chipo", termsAccepted: true })).rejects.toMatchObject({
      status: 403,
      response: { reason: "account_restricted" },
    });
    expect(w.members.some((m) => m.profileId === "chipo")).toBe(false);
  });

  it("Not me deletes the invite and audit-logs it", async () => {
    const inv = w.invite("m1", "+263773000003", "Chipo");
    await expect(w.invitesSvc.decline("chipo", inv.id)).resolves.toEqual({ ok: true });
    expect(w.invites).toHaveLength(0);
    expect(w.audit.at(-1)).toMatchObject({ actor: "chipo", action: TEAM_DECLINE_ACTION, target: "m1", note: inv.id });
  });
});
