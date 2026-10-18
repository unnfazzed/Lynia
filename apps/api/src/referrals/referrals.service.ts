import { randomInt } from "node:crypto";
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { normalizeReferralCode, REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH, referralLink } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";

/** The audit action ops' cash payment writes (reserved: only markPaid may record it). */
export const REFERRAL_PAID_ACTION = "referral.paid";

/** A code only attaches to a biker this new: the become call itself, or a lost-response replay of it. */
export const REFERRAL_ATTACH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cash per referral, per payment. A guard against a typo (500 for 5.00), not a policy. */
export const REFERRAL_PAY_CAP_USD = 100;

/** The newest referrals the console reads. Far above today's volume; `capped` says when it is reached. */
const LIST_LIMIT = 2000;

export type AttachOutcome = "attached" | "invalid" | "unknown" | "self" | "already" | "not_new";

/** joined = became a biker; verified = passed the ID check; riding = verified and finished a job. */
export type ReferralStage = "joined" | "verified" | "riding";

/**
 * Warnings shown beside a referral so ops can look before paying. None of them blocks anything.
 *  - same_device: the friend and the referrer have signed in on the same phone.
 *  - same_id: the friend's ID (typed or verified) is the referrer's.
 *  - duplicate_id: the friend's ID check flagged their ID as seen on another account.
 *  - referrer_not_verified: the referrer isn't (or is no longer) a verified biker.
 *  - not_active: the friend is suspended or banned.
 */
export type ReferralFlag = "same_device" | "same_id" | "duplicate_id" | "referrer_not_verified" | "not_active";

export interface AdminReferralRow {
  id: string;
  createdAt: string;
  referrer: { id: string; name: string; code: string };
  friend: { id: string; name: string; kycStatus: string; verifiedAt: string | null; trips: number; accountStatus: string };
  stage: ReferralStage;
  flags: ReferralFlag[];
  paid: { at: string; amount: string } | null;
}

export interface AdminReferrerRow {
  id: string;
  name: string;
  code: string;
  referred: number;
  verified: number;
  riding: number;
  /** Verified friends not paid for yet: what ops may owe this biker. */
  unpaidVerified: number;
  paidCount: number;
  paidTotal: string;
}

export interface ReferralTotals {
  referred: number;
  verified: number;
  riding: number;
  unpaidVerified: number;
  paidCount: number;
  paidTotal: string;
  /** Bikers with a share link, whether or not anyone used it yet. */
  links: number;
}

export interface AdminReferralsResponse {
  totals: ReferralTotals;
  referrers: AdminReferrerRow[];
  rows: AdminReferralRow[];
  /** True when there are more referrals than the console reads (LIST_LIMIT). */
  capped: boolean;
}

export interface RiderReferralSummary {
  code: string | null;
  link: string | null;
  referred: number;
  verified: number;
  paidCount: number;
}

function nameOf(p: { firstName: string; lastName: string } | undefined): string {
  const name = p ? `${p.firstName} ${p.lastName}`.trim() : "";
  return name || "No name";
}

function cents(v: Prisma.Decimal | null): number {
  return v ? Math.round(Number(v) * 100) : 0;
}

function dollars(c: number): string {
  return (c / 100).toFixed(2);
}

/**
 * Biker referrals (owner 2026-10-18, ledger D-112). Ops mint a biker's code from the console and share
 * `lyniago.com/r/<code>`; the friend's app sends the code with `POST /riders/become` (read from Play's install
 * referrer, no screen); the console shows every referral with the friend's live progress, and ops record the
 * cash they pay. Nothing here moves money in the app: the wallet is untouched.
 */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Link a just-registered biker to the biker whose code their app carried. Best-effort and silent: the
   * caller never fails a sign-up over it, and the outcome is only logged. First code wins, once per biker.
   */
  async attach(refereeId: string, rawCode: unknown, now: Date = new Date()): Promise<AttachOutcome> {
    const code = normalizeReferralCode(rawCode);
    if (!code) return "invalid";
    const owner = await this.prisma.referralCode.findUnique({ where: { code }, select: { riderId: true } });
    if (!owner) return "unknown";
    if (owner.riderId === refereeId) return "self";
    const rider = await this.prisma.rider.findUnique({ where: { profileId: refereeId }, select: { createdAt: true } });
    // Only a new biker: an existing one can't claim a referral later by replaying become with a code.
    if (!rider || now.getTime() - rider.createdAt.getTime() > REFERRAL_ATTACH_WINDOW_MS) return "not_new";
    try {
      await this.prisma.referral.create({ data: { referrerId: owner.riderId, refereeId, code } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "already";
      throw err;
    }
    this.logger.log(`Biker ${refereeId} joined with ${owner.riderId}'s referral code`);
    return "attached";
  }

  /** The biker's code, minted on first ask. One per biker, kept for good (a shared link must keep working). */
  async codeFor(riderId: string): Promise<{ code: string; link: string }> {
    const rider = await this.prisma.rider.findUnique({ where: { profileId: riderId }, select: { profileId: true } });
    if (!rider) throw new NotFoundException("Biker not found");
    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await this.prisma.referralCode.findUnique({ where: { riderId }, select: { code: true } });
      if (existing) return { code: existing.code, link: referralLink(existing.code) };
      try {
        const row = await this.prisma.referralCode.create({ data: { riderId, code: randomCode() }, select: { code: true } });
        return { code: row.code, link: referralLink(row.code) };
      } catch (err) {
        // Either a code collision (draw again) or a concurrent mint for this biker (the re-read returns it).
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    throw new ConflictException("Couldn't create a referral code. Try again.");
  }

  /** The biker page's referral card: the link (if minted) and how their referrals are doing. */
  async summaryFor(riderId: string): Promise<RiderReferralSummary> {
    const [codeRow, referrals] = await Promise.all([
      this.prisma.referralCode.findUnique({ where: { riderId }, select: { code: true } }),
      this.prisma.referral.findMany({ where: { referrerId: riderId }, select: { refereeId: true, paidAt: true } }),
    ]);
    const verified = referrals.length
      ? await this.prisma.rider.count({ where: { profileId: { in: referrals.map((r) => r.refereeId) }, kycStatus: "verified" } })
      : 0;
    return {
      code: codeRow?.code ?? null,
      link: codeRow ? referralLink(codeRow.code) : null,
      referred: referrals.length,
      verified,
      paidCount: referrals.filter((r) => r.paidAt).length,
    };
  }

  /** Every referral, newest first, with the friend's live progress, the warnings, and the per-referrer rollup. */
  async list(): Promise<AdminReferralsResponse> {
    const [found, links] = await Promise.all([
      this.prisma.referral.findMany({ orderBy: { createdAt: "desc" }, take: LIST_LIMIT + 1 }),
      this.prisma.referralCode.count(),
    ]);
    const capped = found.length > LIST_LIMIT;
    const referrals = capped ? found.slice(0, LIST_LIMIT) : found;
    const ids = [...new Set(referrals.flatMap((r) => [r.referrerId, r.refereeId]))];
    const [profiles, sessions] = ids.length
      ? await Promise.all([
          this.prisma.profile.findMany({
            where: { id: { in: ids } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              idNumberHash: true,
              rider: {
                select: { kycStatus: true, kycResolvedAt: true, tripsCount: true, accountStatus: true, verifiedIdHash: true, duplicateIdFlag: true },
              },
            },
          }),
          this.prisma.session.findMany({
            where: { profileId: { in: ids }, deviceId: { not: null } },
            select: { profileId: true, deviceId: true },
          }),
        ])
      : [[], []];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const devices = new Map<string, Set<string>>();
    for (const s of sessions) {
      if (!s.deviceId) continue;
      const set = devices.get(s.profileId) ?? new Set<string>();
      set.add(s.deviceId);
      devices.set(s.profileId, set);
    }

    const rows: AdminReferralRow[] = referrals.map((r) => {
      const referrer = byId.get(r.referrerId);
      const friend = byId.get(r.refereeId);
      const fr = friend?.rider;
      const verified = fr?.kycStatus === "verified";
      const trips = fr?.tripsCount ?? 0;
      const stage: ReferralStage = verified ? (trips > 0 ? "riding" : "verified") : "joined";
      const flags: ReferralFlag[] = [];
      const mine = devices.get(r.referrerId);
      if (mine && [...(devices.get(r.refereeId) ?? [])].some((d) => mine.has(d))) flags.push("same_device");
      const referrerIds = [referrer?.idNumberHash, referrer?.rider?.verifiedIdHash].filter((h): h is string => !!h);
      const friendIds = [friend?.idNumberHash, fr?.verifiedIdHash].filter((h): h is string => !!h);
      if (friendIds.some((h) => referrerIds.includes(h))) flags.push("same_id");
      if (fr?.duplicateIdFlag) flags.push("duplicate_id");
      if (referrer?.rider?.kycStatus !== "verified") flags.push("referrer_not_verified");
      if (fr && fr.accountStatus !== "active") flags.push("not_active");
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        referrer: { id: r.referrerId, name: nameOf(referrer), code: r.code },
        friend: {
          id: r.refereeId,
          name: nameOf(friend),
          kycStatus: fr?.kycStatus ?? "pending",
          verifiedAt: verified && fr?.kycResolvedAt ? fr.kycResolvedAt.toISOString() : null,
          trips,
          accountStatus: fr?.accountStatus ?? "active",
        },
        stage,
        flags,
        paid: r.paidAt ? { at: r.paidAt.toISOString(), amount: dollars(cents(r.paidAmount)) } : null,
      };
    });

    const rollup = new Map<string, AdminReferrerRow & { paidCents: number }>();
    const totals = { referred: 0, verified: 0, riding: 0, unpaidVerified: 0, paidCount: 0, paidCents: 0 };
    for (const row of rows) {
      const agg =
        rollup.get(row.referrer.id) ??
        { id: row.referrer.id, name: row.referrer.name, code: row.referrer.code, referred: 0, verified: 0, riding: 0, unpaidVerified: 0, paidCount: 0, paidTotal: "0.00", paidCents: 0 };
      const isVerified = row.stage !== "joined";
      const paidCents = row.paid ? Math.round(Number(row.paid.amount) * 100) : 0;
      for (const t of [agg, totals]) {
        t.referred += 1;
        if (isVerified) t.verified += 1;
        if (row.stage === "riding") t.riding += 1;
        if (isVerified && !row.paid) t.unpaidVerified += 1;
        if (row.paid) {
          t.paidCount += 1;
          t.paidCents += paidCents;
        }
      }
      rollup.set(row.referrer.id, agg);
    }
    const referrers = [...rollup.values()]
      .map(({ paidCents, ...r }) => ({ ...r, paidTotal: dollars(paidCents) }))
      .sort((a, b) => b.verified - a.verified || b.referred - a.referred || a.name.localeCompare(b.name));
    const { paidCents, ...rest } = totals;
    return { totals: { ...rest, paidTotal: dollars(paidCents), links }, referrers, rows, capped };
  }

  /**
   * Ops record the cash they paid the referrer for one verified friend. Once per referral; the note and the
   * amount go on the audit row (target = the referrer, so it shows on their biker page).
   */
  async markPaid(actor: string, referralId: string, body: { amount: number; note?: string | null }): Promise<{ ok: true }> {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
      select: { referrerId: true, refereeId: true, paidAt: true },
    });
    if (!referral) throw new NotFoundException("Referral not found");
    if (referral.paidAt) throw new ConflictException({ reason: "already_paid", message: "This referral is already marked paid." });
    const friend = await this.prisma.rider.findUnique({ where: { profileId: referral.refereeId }, select: { kycStatus: true } });
    if (friend?.kycStatus !== "verified") {
      throw new ConflictException({ reason: "not_verified", message: "The friend isn't a verified biker yet." });
    }
    const amount = new Prisma.Decimal(body.amount.toFixed(2));
    await this.prisma.$transaction(async (tx) => {
      // Compare-and-set: two ops tapping at once record one payment.
      const res = await tx.referral.updateMany({
        where: { id: referralId, paidAt: null },
        data: { paidAt: new Date(), paidAmount: amount, paidBy: actor },
      });
      if (res.count === 0) throw new ConflictException({ reason: "already_paid", message: "This referral is already marked paid." });
      await tx.auditLog.create({
        data: {
          actor,
          action: REFERRAL_PAID_ACTION,
          target: referral.referrerId,
          targetType: "rider",
          amount,
          note: body.note ?? null,
          after: { referralId, refereeId: referral.refereeId, paidAmount: amount.toFixed(2) },
        },
      });
    });
    return { ok: true };
  }
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  return code;
}
