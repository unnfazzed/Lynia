import type { MerchantApplicationStatus, Prisma } from "@prisma/client";
import { MERCHANT_APPLICATION_WAITING, MERCHANT_APPLICATION_WAITING_VIEW, type Waypoint } from "@lynia/shared";

/**
 * Admin console v2 §5 (docs/plans/2026-10-13-admin-console-v2.md): the pure half of merchant registration →
 * approval — the state machine, the "effective" status that reconciles a row an older API revision touched,
 * and the data-backed checklist. No I/O, so the table-driven spec pins every rule once.
 */

export type ApplicationStatus = MerchantApplicationStatus;

/** The admin actions that move an application, and the states each may start from. */
export type ApplicationAction = "review" | "approve" | "reject" | "go_live" | "suspend" | "resume";

export const ACTION_FROM: Readonly<Record<ApplicationAction, readonly ApplicationStatus[]>> = {
  // Reopening a rejected application goes back to review.
  review: ["applied", "rejected"],
  approve: ["reviewing"],
  reject: ["applied", "reviewing", "approved"],
  go_live: ["approved"],
  suspend: ["live"],
  resume: ["suspended"],
};

export const ACTION_TO: Readonly<Record<ApplicationAction, ApplicationStatus>> = {
  review: "reviewing",
  approve: "approved",
  reject: "rejected",
  go_live: "live",
  suspend: "suspended",
  resume: "live",
};

/**
 * The status the console acts on. `pilotEnabled` is still the switch the customer paths read, and an older
 * API revision (live during a rollout) flips it without touching `applicationStatus`, so the two can briefly
 * disagree. The switch wins, except that a suspension always wins:
 *  - pilotEnabled on → `live` (or `suspended` when suspended: the visibility rule hides it anyway);
 *  - pilotEnabled off but stored `live` → `suspended` (an old "switch off"; Resume brings it back).
 */
export function effectiveApplicationStatus(m: { applicationStatus: ApplicationStatus; pilotEnabled: boolean }): ApplicationStatus {
  if (m.pilotEnabled) return m.applicationStatus === "suspended" ? "suspended" : "live";
  if (m.applicationStatus === "live") return "suspended";
  return m.applicationStatus;
}

/** The Prisma filter for "effectively in this status" (mirrors {@link effectiveApplicationStatus}). */
export function applicationStatusWhere(status: ApplicationStatus | typeof MERCHANT_APPLICATION_WAITING_VIEW): Prisma.MerchantWhereInput {
  if (status === MERCHANT_APPLICATION_WAITING_VIEW) return { OR: MERCHANT_APPLICATION_WAITING.map((s) => applicationStatusWhere(s)) };
  if (status === "live") return { pilotEnabled: true, applicationStatus: { not: "suspended" } };
  if (status === "suspended") return { OR: [{ applicationStatus: "suspended" }, { applicationStatus: "live", pilotEnabled: false }] };
  return { applicationStatus: status, pilotEnabled: false };
}

/**
 * When the SLA clock for a waiting state started. Applied and in review: when the business entered the queue
 * (sign-up, or the last reopen after a rejection). Approved: when it was approved (it now waits on Go live).
 * Null for the states nobody is waiting on.
 */
export function slaSince(m: {
  createdAt: Date;
  applicationStatusAt: Date | null;
  applicationQueuedAt: Date | null;
  status: ApplicationStatus;
}): Date | null {
  if (MERCHANT_APPLICATION_WAITING.includes(m.status)) return m.applicationQueuedAt ?? m.createdAt;
  if (m.status === "approved") return m.applicationStatusAt ?? m.createdAt;
  return null;
}

/** The actions open from a status (approve is further gated on the checklist by the service). */
export function allowedActions(status: ApplicationStatus): ApplicationAction[] {
  return (Object.keys(ACTION_FROM) as ApplicationAction[]).filter((a) => ACTION_FROM[a].includes(status));
}

/* ── Checklist ─────────────────────────────────────────────────────────────────────────────────── */

export type ChecklistKey = "location" | "hours" | "owner" | "menu" | "shopfront" | "team" | "licence" | "call";

export interface ChecklistRow {
  key: ChecklistKey;
  label: string;
  ok: boolean;
  /** Approve needs every required row ✅. */
  required: boolean;
  /** What the data says, one short line. */
  detail: string;
  /** A live business that predates a check (a grandfathered pharmacy with no licence): shown, never blocking. */
  warning?: string;
}

export interface ChecklistInput {
  /** The business name, to tell a real landmark from the name sign-up fills it with. */
  name: string;
  businessType: string;
  shopKind: string | null;
  status: ApplicationStatus;
  location: unknown;
  hours: unknown;
  /** The hours are still exactly the sign-up default (08:00–22:00 every day): nobody confirmed them. */
  hoursDefault: boolean;
  owner: { name: string; phoneVerified: boolean; termsAccepted: boolean } | null;
  /** `liveDishes` is what a customer can see (customerListedDishWhere): photographed, in a category that
   *  isn't hidden, and not an unlisted prescription item. `categories` counts the visible categories. */
  menu: { categories: number; dishes: number; liveDishes: number; withPhoto: number; drafts: number; minPrice: number | null; maxPrice: number | null };
  /** What customers will see at the top of the listing: the round logo, the cover banner and the "about" text. */
  shopFront: { logo: boolean; cover: boolean; about: boolean };
  team: { members: number; staff: number; openInvites: number; pharmacists: number };
  licence: { licenceNumber: string | null; pharmacistName: string | null; verifiedAt: Date | null } | null;
  /** The last ops call that reached someone (a `merchant.application` `called` event, outcome reached). */
  lastCallAt: Date | null;
}

export function isPharmacy(m: { businessType: string; shopKind: string | null }): boolean {
  return m.businessType === "shop" && m.shopKind === "pharmacy";
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function openDays(hours: unknown): number {
  if (!hours || typeof hours !== "object") return 0;
  return Object.values(hours as Record<string, unknown>).filter((w) => w && typeof w === "object").length;
}

export function buildChecklist(input: ChecklistInput): ChecklistRow[] {
  const shop = input.businessType === "shop";
  const wp = (input.location as Waypoint | null) ?? null;
  const hasPin = !!wp?.point;
  const landmark = wp?.landmark?.trim() ?? "";
  // Sign-up fills an empty landmark with the address or the business name (merchantWaypoint).
  const landmarkIsName = landmark.length > 0 && landmark === input.name.trim();
  const days = openDays(input.hours);
  const o = input.owner;
  const m = input.menu;
  const rows: ChecklistRow[] = [
    {
      key: "location",
      label: "Pin and landmark",
      ok: hasPin && landmark.length > 0,
      required: true,
      detail: !hasPin ? "No pin yet" : landmarkIsName ? `${landmark} · just the business name, ask for a landmark` : landmark ? landmark : "Pin set, no landmark",
    },
    {
      key: "hours",
      label: "Opening hours",
      ok: days > 0,
      required: true,
      detail: days === 0 ? "Not set" : input.hoursDefault ? "08:00–22:00 every day · the sign-up default, confirm on the call" : `Open ${plural(days, "day")} a week`,
    },
    {
      key: "owner",
      label: "Owner",
      ok: !!o && o.name.trim().length > 0 && o.phoneVerified && o.termsAccepted,
      required: true,
      detail: !o
        ? "No owner on the team"
        : [o.name.trim() || "No name", o.phoneVerified ? "phone verified" : "phone not verified", o.termsAccepted ? "terms accepted" : "terms not accepted"].join(" · "),
    },
    {
      key: "menu",
      label: shop ? "Items" : "Menu",
      ok: m.categories > 0 && m.liveDishes > 0,
      required: true,
      detail:
        m.dishes === 0
          ? `${plural(m.categories, "category", "categories")} · no ${shop ? "items" : "dishes"}`
          : [
              plural(m.categories, "category", "categories"),
              plural(m.dishes, shop ? "item" : "dish", shop ? "items" : "dishes"),
              `${Math.round((m.withPhoto / m.dishes) * 100)}% with photos`,
              plural(m.drafts, "draft"),
              m.minPrice != null && m.maxPrice != null ? (m.minPrice === m.maxPrice ? usd(m.minPrice) : `${usd(m.minPrice)}–${usd(m.maxPrice)}`) : null,
            ]
              .filter(Boolean)
              .join(" · "),
    },
    {
      // The owner's ask (2026-10-18): ops sees the logo and the "about" before approving. Shown, not
      // required: sign-up never asks for them, so an applicant can't be blocked on a field it wasn't shown.
      key: "shopfront",
      label: "Shop front",
      ok: input.shopFront.logo && input.shopFront.about,
      required: false,
      detail: [
        input.shopFront.logo ? "logo" : "no logo",
        input.shopFront.cover ? "cover" : "no cover",
        input.shopFront.about ? "about" : "no about",
      ].join(" · "),
    },
    {
      key: "team",
      label: "Team",
      ok: input.team.members > 0,
      required: false,
      detail: `${plural(input.team.staff, "staff", "staff")} · ${plural(input.team.openInvites, "open invite")}`,
    },
  ];

  if (isPharmacy(input)) {
    const l = input.licence;
    const named = !!l?.pharmacistName?.trim();
    const numbered = !!l?.licenceNumber?.trim();
    const ok = numbered && named && !!l?.verifiedAt;
    const live = input.status === "live" || input.status === "suspended";
    rows.push({
      key: "licence",
      label: "Pharmacy licence",
      ok,
      required: true,
      detail: !l
        ? input.team.pharmacists > 0
          ? `Not recorded · ${plural(input.team.pharmacists, "pharmacist")} on the team`
          : "Not recorded"
        : [numbered ? `No. ${l.licenceNumber!.trim()}` : "No number", named ? l.pharmacistName!.trim() : "No pharmacist named", l.verifiedAt ? "verified" : "not verified"].join(" · "),
      ...(!ok && live
        ? { warning: l ? "The licence isn't verified (it was changed, or never checked). Verify it." : "Live before licences were checked. Record and verify it." }
        : {}),
    });
  }

  rows.push({
    key: "call",
    label: "Ops call",
    ok: input.lastCallAt != null,
    required: true,
    detail: input.lastCallAt ? "Spoke to the business" : "No call logged",
  });
  return rows;
}

/** Score = required rows passing / required rows. */
export function checklistScore(rows: ChecklistRow[]): { passed: number; total: number } {
  const required = rows.filter((r) => r.required);
  return { passed: required.filter((r) => r.ok).length, total: required.length };
}

export function checklistPasses(rows: ChecklistRow[]): boolean {
  return rows.every((r) => !r.required || r.ok);
}

/* ── Metrics (pure maths over loaded rows) ───────────────────────────────────────────────────────── */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
