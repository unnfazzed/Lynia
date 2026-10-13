import type { MerchantApplicationStatus, Prisma } from "@prisma/client";
import type { Waypoint } from "@lynia/shared";

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
export function applicationStatusWhere(status: ApplicationStatus): Prisma.MerchantWhereInput {
  if (status === "live") return { pilotEnabled: true, applicationStatus: { not: "suspended" } };
  if (status === "suspended") return { OR: [{ applicationStatus: "suspended" }, { applicationStatus: "live", pilotEnabled: false }] };
  return { applicationStatus: status, pilotEnabled: false };
}

/** The actions open from a status (approve is further gated on the checklist by the service). */
export function allowedActions(status: ApplicationStatus): ApplicationAction[] {
  return (Object.keys(ACTION_FROM) as ApplicationAction[]).filter((a) => ACTION_FROM[a].includes(status));
}

/* ── Checklist ─────────────────────────────────────────────────────────────────────────────────── */

export type ChecklistKey = "location" | "hours" | "owner" | "menu" | "team" | "licence" | "call";

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
  businessType: string;
  shopKind: string | null;
  status: ApplicationStatus;
  location: unknown;
  hours: unknown;
  owner: { name: string; phoneVerified: boolean; termsAccepted: boolean } | null;
  menu: { categories: number; dishes: number; liveDishes: number; withPhoto: number; drafts: number; minPrice: number | null; maxPrice: number | null };
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
  const days = openDays(input.hours);
  const o = input.owner;
  const m = input.menu;
  const rows: ChecklistRow[] = [
    {
      key: "location",
      label: "Pin and landmark",
      ok: hasPin && landmark.length > 0,
      required: true,
      detail: !hasPin ? "No pin yet" : landmark ? landmark : "Pin set, no landmark",
    },
    {
      key: "hours",
      label: "Opening hours",
      ok: days > 0,
      required: true,
      detail: days > 0 ? `Open ${plural(days, "day")} a week` : "Not set",
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
      ...(!ok && live ? { warning: "Live before licences were checked. Record and verify it." } : {}),
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
