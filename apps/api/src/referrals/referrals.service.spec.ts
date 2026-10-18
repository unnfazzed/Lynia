import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { countsAsVerified, REFERRAL_ATTACH_WINDOW_MS, REFERRAL_PAID_ACTION, ReferralsService } from "./referrals.service";

type Rider = {
  profileId: string;
  createdAt: Date;
  kycStatus: string;
  kycResolvedAt: Date | null;
  tripsCount: number;
  accountStatus: string;
  verifiedIdHash: string | null;
  duplicateIdFlag: boolean;
};
type Profile = { id: string; firstName: string; lastName: string; idNumberHash: string | null };
type Referral = {
  id: string;
  referrerId: string;
  refereeId: string;
  code: string;
  createdAt: Date;
  paidAt: Date | null;
  paidAmount: Prisma.Decimal | null;
  paidBy: string | null;
};

const NOW = new Date("2026-10-18T10:00:00Z");

function unique(): never {
  throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

/** An in-memory stand-in for the few Prisma calls ReferralsService makes. */
function fakeDb() {
  const riders = new Map<string, Rider>();
  const profiles = new Map<string, Profile>();
  const codes = new Map<string, { riderId: string; code: string }>();
  const referrals: Referral[] = [];
  const sessions: Array<{ profileId: string; deviceId: string | null }> = [];
  const audits: Array<Record<string, unknown>> = [];
  const approvals: Array<{ target: string; at: Date }> = [];
  let seq = 0;

  const addBiker = (id: string, first: string, over: Partial<Rider> = {}, idHash: string | null = null) => {
    profiles.set(id, { id, firstName: first, lastName: "Moyo", idNumberHash: idHash });
    riders.set(id, {
      profileId: id,
      createdAt: NOW,
      kycStatus: "pending",
      kycResolvedAt: null,
      tripsCount: 0,
      accountStatus: "active",
      verifiedIdHash: null,
      duplicateIdFlag: false,
      ...over,
    });
  };

  const referral = {
    create: async ({ data }: { data: { referrerId: string; refereeId: string; code: string } }) => {
      if (referrals.some((r) => r.refereeId === data.refereeId)) unique();
      const row: Referral = { id: `ref-${++seq}`, createdAt: new Date(NOW.getTime() + seq), paidAt: null, paidAmount: null, paidBy: null, ...data };
      referrals.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => referrals.find((r) => r.id === where.id) ?? null,
    findMany: async (args: { where?: { referrerId?: string }; take?: number }) => {
      const rows = referrals.filter((r) => !args.where?.referrerId || r.referrerId === args.where.referrerId);
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, args.take ?? rows.length);
    },
    updateMany: async ({ where, data }: { where: { id: string; paidAt: null }; data: Partial<Referral> }) => {
      const row = referrals.find((r) => r.id === where.id && r.paidAt === null);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };

  const db = {
    referral,
    referralCode: {
      findUnique: async ({ where }: { where: { code?: string; riderId?: string } }) =>
        [...codes.values()].find((c) => (where.code ? c.code === where.code : c.riderId === where.riderId)) ?? null,
      create: async ({ data }: { data: { riderId: string; code: string } }) => {
        if (codes.has(data.riderId) || [...codes.values()].some((c) => c.code === data.code)) unique();
        codes.set(data.riderId, data);
        return data;
      },
      count: async () => codes.size,
    },
    rider: {
      findUnique: async ({ where }: { where: { profileId: string } }) => riders.get(where.profileId) ?? null,
      findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        where.profileId.in.flatMap((id) => (riders.has(id) ? [riders.get(id) as Rider] : [])),
    },
    profile: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.flatMap((id) => {
          const p = profiles.get(id);
          return p ? [{ ...p, rider: riders.get(id) ?? null }] : [];
        }),
    },
    session: {
      findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
        sessions.filter((s) => s.deviceId && where.profileId.in.includes(s.profileId)),
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), data),
      // The first ID-check approval per biker (ReferralsService.firstApprovals).
      groupBy: async ({ where }: { where: { action: string; target: { in: string[] } } }) =>
        where.target.in.flatMap((target) => {
          const dates = approvals.filter((a) => a.target === target && where.action === "rider.kyc_approve").map((a) => a.at.getTime());
          return dates.length ? [{ target, _min: { createdAt: new Date(Math.min(...dates)) } }] : [];
        }),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db, riders, codes, referrals, sessions, audits, approvals, addBiker };
}

function setup() {
  const f = fakeDb();
  const service = new ReferralsService(f.db as unknown as PrismaService);
  return { ...f, service };
}

describe("ReferralsService.codeFor", () => {
  it("mints one code per biker and returns the same one after", async () => {
    const { service, addBiker } = setup();
    addBiker("tino", "Tino", { kycStatus: "verified" });
    const first = await service.codeFor("tino");
    expect(first.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(first.link).toBe(`https://lyniago.com/r/${first.code}`);
    expect(await service.codeFor("tino")).toEqual(first);
  });

  it("refuses a profile that isn't a biker", async () => {
    const { service } = setup();
    await expect(service.codeFor("nobody")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ReferralsService.attach", () => {
  it("links a new biker to the code's owner, once, first code wins", async () => {
    const { service, addBiker, referrals } = setup();
    addBiker("tino", "Tino", { kycStatus: "verified" });
    addBiker("rudo", "Rudo", { kycStatus: "verified" });
    addBiker("farai", "Farai");
    const tino = await service.codeFor("tino");
    const rudo = await service.codeFor("rudo");
    expect(await service.attach("farai", tino.code.toLowerCase(), NOW)).toBe("attached");
    expect(await service.attach("farai", rudo.code, NOW)).toBe("already");
    expect(referrals).toHaveLength(1);
    expect(referrals[0]).toMatchObject({ referrerId: "tino", refereeId: "farai", code: tino.code });
  });

  it("ignores a malformed or unknown code, the biker's own code, and a biker who isn't new", async () => {
    const { service, addBiker, referrals } = setup();
    addBiker("tino", "Tino", { kycStatus: "verified" });
    addBiker("old", "Old", { createdAt: new Date(NOW.getTime() - REFERRAL_ATTACH_WINDOW_MS - 1) });
    const { code } = await service.codeFor("tino");
    expect(await service.attach("tino", "bad", NOW)).toBe("invalid");
    expect(await service.attach("tino", "ZZZZZZ", NOW)).toBe("unknown");
    expect(await service.attach("tino", code, NOW)).toBe("self");
    expect(await service.attach("old", code, NOW)).toBe("not_new");
    expect(await service.attach("ghost", code, NOW)).toBe("not_new");
    expect(referrals).toHaveLength(0);
  });
});

describe("ReferralsService.list", () => {
  it("reads each friend's live stage, the warnings and the per-referrer rollup", async () => {
    const { service, addBiker, sessions } = setup();
    addBiker("tino", "Tino", { kycStatus: "verified" }, "hash-tino");
    addBiker("rider", "Rider", { kycStatus: "verified", kycResolvedAt: NOW, tripsCount: 3 });
    addBiker("ver", "Ver", { kycStatus: "verified", kycResolvedAt: NOW });
    addBiker("pend", "Pend", { duplicateIdFlag: true }, "hash-tino");
    addBiker("bad", "Bad", { accountStatus: "banned" });
    sessions.push({ profileId: "tino", deviceId: "dev-1" }, { profileId: "bad", deviceId: "dev-1" }, { profileId: "ver", deviceId: "dev-9" });
    const { code } = await service.codeFor("tino");
    for (const id of ["rider", "ver", "pend", "bad"]) await service.attach(id, code, NOW);

    const res = await service.list();
    const byFriend = new Map(res.rows.map((r) => [r.friend.id, r]));
    expect(byFriend.get("rider")).toMatchObject({ stage: "riding", flags: [], friend: { trips: 3, verifiedAt: NOW.toISOString() } });
    expect(byFriend.get("ver")).toMatchObject({ stage: "verified", flags: [] });
    expect(byFriend.get("pend")).toMatchObject({ stage: "joined", flags: ["same_id", "duplicate_id"], friend: { verifiedAt: null } });
    expect(byFriend.get("bad")?.flags).toEqual(["same_device", "not_active"]);
    expect(res.totals).toMatchObject({ referred: 4, verified: 2, riding: 1, unpaidVerified: 2, paidCount: 0, paidTotal: "0.00", links: 1 });
    expect(res.referrers).toEqual([
      { id: "tino", name: "Tino Moyo", code, referred: 4, verified: 2, riding: 1, unpaidVerified: 2, paidCount: 0, paidTotal: "0.00" },
    ]);
    expect(res.capped).toBe(false);
  });

  it("warns when the referrer isn't verified", async () => {
    const { service, addBiker } = setup();
    addBiker("tino", "Tino", { kycStatus: "expired" });
    addBiker("farai", "Farai");
    await service.attach("farai", (await service.codeFor("tino")).code, NOW);
    expect((await service.list()).rows[0].flags).toEqual(["referrer_not_verified"]);
  });
});

describe("ReferralsService.markPaid", () => {
  async function withReferral(friend: Partial<Rider>) {
    const s = setup();
    s.addBiker("tino", "Tino", { kycStatus: "verified" });
    s.addBiker("farai", "Farai", friend);
    await s.service.attach("farai", (await s.service.codeFor("tino")).code, NOW);
    return { ...s, id: s.referrals[0].id };
  }

  it("records the cash once, with an audit row on the referrer", async () => {
    const { service, id, referrals, audits } = await withReferral({ kycStatus: "verified" });
    await service.markPaid("admin-1", id, { amount: 5, note: "Paid at the depot" });
    expect(referrals[0]).toMatchObject({ paidBy: "admin-1" });
    expect(referrals[0].paidAmount?.toFixed(2)).toBe("5.00");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: "admin-1", action: REFERRAL_PAID_ACTION, target: "tino", targetType: "rider", note: "Paid at the depot" });
    await expect(service.markPaid("admin-1", id, { amount: 5 })).rejects.toBeInstanceOf(ConflictException);
    expect(audits).toHaveLength(1);
    const list = await service.list();
    expect(list.rows[0].paid?.amount).toBe("5.00");
    expect(list.totals).toMatchObject({ paidCount: 1, paidTotal: "5.00", unpaidVerified: 0 });
  });

  it("refuses a friend who isn't verified, and an unknown referral", async () => {
    const { service, id, audits } = await withReferral({ kycStatus: "pending" });
    await expect(service.markPaid("admin-1", id, { amount: 5 })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.markPaid("admin-1", "missing", { amount: 5 })).rejects.toBeInstanceOf(NotFoundException);
    expect(audits).toHaveLength(0);
  });
});

describe("a friend who passed the ID check stays verified (accurate tracking)", () => {
  it("countsAsVerified: verified now, or approved once and not declined since", () => {
    expect(countsAsVerified("verified", undefined)).toBe(true);
    expect(countsAsVerified("expired", NOW)).toBe(true);
    expect(countsAsVerified("pending", NOW)).toBe(true);
    expect(countsAsVerified("failed", NOW)).toBe(false);
    expect(countsAsVerified("expired", undefined)).toBe(false);
    expect(countsAsVerified("pending", undefined)).toBe(false);
    expect(countsAsVerified(undefined, undefined)).toBe(false);
  });

  it("keeps a friend whose ID later lapsed as verified, dated by the first approval, and payable", async () => {
    const { service, addBiker, approvals, referrals } = setup();
    addBiker("tino", "Tino", { kycStatus: "verified" });
    addBiker("lapsed", "Lapsed", { kycStatus: "expired", kycResolvedAt: new Date("2027-01-01T00:00:00Z"), tripsCount: 4 });
    addBiker("declined", "Declined", { kycStatus: "failed" });
    approvals.push(
      { target: "lapsed", at: new Date("2026-10-18T11:00:00Z") },
      { target: "lapsed", at: new Date("2026-12-01T09:00:00Z") },
      { target: "declined", at: new Date("2026-10-18T11:00:00Z") },
    );
    const { code } = await service.codeFor("tino");
    await service.attach("lapsed", code, NOW);
    await service.attach("declined", code, NOW);

    const res = await service.list();
    const byFriend = new Map(res.rows.map((r) => [r.friend.id, r]));
    expect(byFriend.get("lapsed")).toMatchObject({ stage: "riding", friend: { verifiedAt: "2026-10-18T11:00:00.000Z" } });
    expect(byFriend.get("declined")).toMatchObject({ stage: "joined", friend: { verifiedAt: null } });
    expect(res.totals).toMatchObject({ referred: 2, verified: 1, riding: 1, unpaidVerified: 1 });
    expect(await service.summaryFor("tino")).toMatchObject({ referred: 2, verified: 1, paidCount: 0 });

    const lapsedId = referrals.find((r) => r.refereeId === "lapsed")?.id ?? "";
    const declinedId = referrals.find((r) => r.refereeId === "declined")?.id ?? "";
    await expect(service.markPaid("admin-1", lapsedId, { amount: 5 })).resolves.toEqual({ ok: true });
    await expect(service.markPaid("admin-1", declinedId, { amount: 5 })).rejects.toBeInstanceOf(ConflictException);
  });
});
