import { Injectable } from "@nestjs/common";
import { BUSINESS_BOOKING_ACCOUNT_PREFIX, normalizePhone } from "@lynia/shared";
import type { Prisma } from "@prisma/client";
import { maskPhone } from "../common/phone-mask";
import { PrismaService } from "../prisma/prisma.service";
import { humanize, money, shortId, uuidPrefixRange } from "./admin-read.shared";

/**
 * Admin console v2 §4 (docs/plans/2026-10-13-admin-console-v2.md): the console's one search box. A query is read
 * every way it could be meant, and each reading only runs where it is cheap:
 *
 *  - a phone (`0771234567`, `+263 77 123 4567`, `771234567`) → the E.164 form, an equality on the unique
 *    `profiles.phone` index; a partial number (6+ digits) falls back to a bounded contains;
 *  - a name (letters) → every word must appear in the first or last name (case-insensitive), or the merchant name;
 *  - an order / top-up id (`#a1b2c3`, a uuid prefix of 6+ hex digits) → a primary-key RANGE (see uuidPrefixRange),
 *    never a text scan;
 *  - a Paynow reference → an equality on the unique `top_ups.provider_ref` index.
 *
 * Every group is capped (LIMIT) and a query shorter than {@link MIN_QUERY} runs nothing. The name / partial-phone
 * contains are sequential scans of `profiles` / `merchants`, which are small at pilot scale; a trigram index is the
 * next step if they grow (none is needed today).
 */

export const MIN_QUERY = 3;
const MAX_QUERY = 80;
const PER_GROUP = 8;

export interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
}

export interface SearchView {
  q: string;
  /** True when the query was too short to run. */
  tooShort: boolean;
  total: number;
  groups: {
    bikers: SearchHit[];
    customers: SearchHit[];
    merchants: SearchHit[];
    orders: SearchHit[];
    topups: SearchHit[];
  };
}

/** How a query will be matched (exported for the spec). */
export interface SearchPlan {
  /** Exact E.164 phone. */
  phone: string | null;
  /** National digits for a partial phone contains (6+ digits, no country code / trunk 0). */
  phoneFragment: string | null;
  /** Name words (letters present), at most 3. */
  words: string[];
  /** uuid range for an order / top-up id prefix. */
  idRange: { gte: string; lte: string } | null;
  /** Candidate Paynow reference (exact). */
  reference: string | null;
}

export function planSearch(raw: string): SearchPlan {
  const q = raw.trim().slice(0, MAX_QUERY);
  const digits = q.replace(/\D/g, "");
  const phoneLike = /^[+\d\s().-]+$/.test(q) && digits.length >= 6;
  const phone = phoneLike ? normalizePhone(q) : null;
  let phoneFragment: string | null = null;
  if (phoneLike && !phone) {
    const national = digits.replace(/^263/, "").replace(/^0/, "");
    phoneFragment = national.length >= 6 ? national : null;
  }
  const words = /\p{L}/u.test(q) && !q.startsWith("#")
    ? q
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2)
        .slice(0, 3)
    : [];
  const idRange = uuidPrefixRange(q);
  const reference = /^[\w-]{4,64}$/.test(q) ? q : null;
  return { phone, phoneFragment, words, idRange, reference };
}

function nameWhere(words: string[]): Prisma.ProfileWhereInput | null {
  if (!words.length) return null;
  return {
    AND: words.map((w) => ({
      OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }],
    })),
  };
}

function phoneWhere(plan: SearchPlan): Prisma.ProfileWhereInput | null {
  if (plan.phone) return { phone: plan.phone };
  if (plan.phoneFragment) return { phone: { contains: plan.phoneFragment } };
  return null;
}

const personName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim() || "Unnamed";

@Injectable()
export class AdminSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(raw: string | undefined): Promise<SearchView> {
    const q = (raw ?? "").trim().slice(0, MAX_QUERY);
    const empty: SearchView = { q, tooShort: true, total: 0, groups: { bikers: [], customers: [], merchants: [], orders: [], topups: [] } };
    if (q.replace(/^#/, "").length < MIN_QUERY) return empty;
    const plan = planSearch(q);

    const personOr = [nameWhere(plan.words), phoneWhere(plan)].filter((w): w is Prisma.ProfileWhereInput => w !== null);
    const personSelect = { id: true, firstName: true, lastName: true, phone: true, rider: { select: { kycStatus: true } } } as const;

    const merchantOr: Prisma.MerchantWhereInput[] = [];
    if (plan.words.length) merchantOr.push({ AND: plan.words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) });
    const ownerPhone = phoneWhere(plan);
    if (ownerPhone) merchantOr.push({ ownerProfile: ownerPhone });

    const topupOr: Prisma.TopUpWhereInput[] = [];
    if (plan.reference) topupOr.push({ providerRef: plan.reference });
    if (plan.idRange) topupOr.push({ id: plan.idRange });

    const none = Promise.resolve([] as never[]);
    const [bikers, customers, merchants, orders, topups] = await Promise.all([
      personOr.length
        ? this.prisma.profile.findMany({
            where: { rider: { isNot: null }, OR: personOr },
            orderBy: { createdAt: "desc" },
            take: PER_GROUP,
            select: personSelect,
          })
        : none,
      personOr.length
        ? this.prisma.profile.findMany({
            where: { role: "customer", NOT: { phone: { startsWith: BUSINESS_BOOKING_ACCOUNT_PREFIX } }, OR: personOr },
            orderBy: { createdAt: "desc" },
            take: PER_GROUP,
            select: personSelect,
          })
        : none,
      merchantOr.length
        ? this.prisma.merchant.findMany({
            where: { OR: merchantOr },
            orderBy: { createdAt: "desc" },
            take: PER_GROUP,
            select: { id: true, name: true, businessType: true, pilotEnabled: true },
          })
        : none,
      plan.idRange
        ? this.prisma.order.findMany({
            where: { id: plan.idRange },
            orderBy: { createdAt: "desc" },
            take: PER_GROUP,
            select: { id: true, orderType: true, status: true, createdAt: true, customer: { select: { firstName: true, lastName: true } } },
          })
        : none,
      topupOr.length
        ? this.prisma.topUp.findMany({
            where: { OR: topupOr },
            orderBy: { initiatedAt: "desc" },
            take: PER_GROUP,
            select: { id: true, riderId: true, amount: true, status: true, rail: true, providerRef: true, rider: { select: { profile: { select: { firstName: true, lastName: true } } } } },
          })
        : none,
    ]);

    const groups: SearchView["groups"] = {
      bikers: bikers.map((p) => ({
        id: p.id,
        label: personName(p),
        sub: [maskPhone(p.phone), p.rider ? `ID check ${humanize(p.rider.kycStatus).toLowerCase()}` : null].filter(Boolean).join(" · "),
        href: `/riders/${p.id}`,
      })),
      customers: customers.map((p) => ({ id: p.id, label: personName(p), sub: maskPhone(p.phone), href: `/customers/${p.id}` })),
      merchants: merchants.map((m) => ({
        id: m.id,
        label: m.name,
        sub: [humanize(m.businessType), m.pilotEnabled ? "live" : "not live"].join(" · "),
        href: `/merchants/${m.id}`,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        label: shortId(o.id),
        sub: [o.orderType === "merchant" ? "Food / shop" : "Parcel", humanize(o.status), personName(o.customer)].join(" · "),
        href: `/orders/${o.id}`,
      })),
      topups: topups.map((t) => ({
        id: t.id,
        label: `Top-up ${shortId(t.id)}`,
        sub: [money(t.amount), t.status, t.providerRef && !t.providerRef.startsWith("stub_") && t.rail !== "manual" ? t.providerRef : null, personName(t.rider.profile)]
          .filter(Boolean)
          .join(" · "),
        href: `/riders/${t.riderId}`,
      })),
    };
    const total = Object.values(groups).reduce((n, g) => n + g.length, 0);
    return { q, tooShort: false, total, groups };
  }
}
