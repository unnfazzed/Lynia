/**
 * Admin console v2 §4 (docs/plans/2026-10-13-admin-console-v2.md): the happy-path funnels, the stuck lists and the
 * Nudge copy. Everything here is pure (no Prisma), so the maths and the copy are unit-tested directly; the
 * service (admin-people.service.ts) only loads rows and hands them over.
 */

import { harareDayStart } from "./admin.shared";

/** PR 2 (the `domain_events` writers, Rider.createdAt, the cancel columns) shipped on this Harare day. */
export const PR2_SINCE = "2026-10-13";
/** The `rider.kyc_session_minted` audit row (one per paid Didit session) exists from this day (#1160). */
export const KYC_MINT_AUDIT_SINCE = "2026-10-12";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ── Ranges ────────────────────────────────────────────────────────────────────────────────────────────────

export const FUNNEL_KINDS = ["biker", "customer", "merchant"] as const;
export type FunnelKind = (typeof FUNNEL_KINDS)[number];
export const FUNNEL_RANGES = ["today", "7d", "30d"] as const;
export type FunnelRange = (typeof FUNNEL_RANGES)[number];

export function isFunnelKind(v: unknown): v is FunnelKind {
  return typeof v === "string" && (FUNNEL_KINDS as readonly string[]).includes(v);
}
export function isFunnelRange(v: unknown): v is FunnelRange {
  return typeof v === "string" && (FUNNEL_RANGES as readonly string[]).includes(v);
}

/** The cohort window: from 00:00 Harare on the first day of the range to now. `7d` is today and the 6 days before. */
export function rangeWindow(range: FunnelRange, now: Date = new Date()): { from: Date; to: Date } {
  const today = harareDayStart(now);
  const days = range === "today" ? 0 : range === "7d" ? 6 : 29;
  return { from: new Date(today.getTime() - days * DAY_MS), to: now };
}

// ── Stuck lists ───────────────────────────────────────────────────────────────────────────────────────────

export const STUCK_LIST_KEYS = [
  "biker_no_didit",
  "biker_didit_unfinished",
  "biker_declined_fixable",
  "biker_plate_waiting",
  "biker_never_online",
  "biker_idle",
  "biker_low_balance",
  "biker_id_expiring",
  "customer_expired",
  "customer_cancelled_first",
  "customer_undelivered",
  "customer_no_order",
  "merchant_applications",
  "merchant_live_idle",
] as const;
export type StuckListKey = (typeof STUCK_LIST_KEYS)[number];

export function isStuckListKey(v: unknown): v is StuckListKey {
  return typeof v === "string" && (STUCK_LIST_KEYS as readonly string[]).includes(v);
}

export interface StuckListMeta {
  key: StuckListKey;
  kind: FunnelKind;
  /** Short chip / card title. */
  title: string;
  /** One line: who is on the list. */
  line: string;
  /** Whether a Nudge push makes sense (the next move is the person's, not ops'). */
  nudge: boolean;
}

/** In display order per kind. Copy says "biker" (D-101), never "rider". */
export const STUCK_LISTS: readonly StuckListMeta[] = [
  { key: "biker_no_didit", kind: "biker", title: "Never started the ID check", line: "Became a biker over 24 hours ago and never opened the ID check.", nudge: true },
  { key: "biker_didit_unfinished", kind: "biker", title: "ID check unfinished", line: "Opened the ID check over an hour ago and didn't finish it.", nudge: true },
  { key: "biker_declined_fixable", kind: "biker", title: "Declined, can retry", line: "The ID check said no for a reason a retry can fix.", nudge: true },
  { key: "biker_plate_waiting", kind: "biker", title: "Plate waiting", line: "Saved a plate that ops hasn't checked yet.", nudge: false },
  { key: "biker_never_online", kind: "biker", title: "Verified, never online", line: "Passed the ID check and has never gone online.", nudge: true },
  { key: "biker_idle", kind: "biker", title: "Online, no job in 3 days", line: "Went online in the last 3 days and had no job in that time.", nudge: true },
  { key: "biker_low_balance", kind: "biker", title: "Balance below a job's commission", line: "Free jobs used up and the balance doesn't cover a typical job's commission.", nudge: true },
  { key: "biker_id_expiring", kind: "biker", title: "ID expires in 30 days", line: "A verified biker whose ID runs out in the next 30 days.", nudge: true },
  { key: "customer_expired", kind: "customer", title: "No biker took the order", line: "Their last order expired with no biker. Call them back first.", nudge: true },
  { key: "customer_cancelled_first", kind: "customer", title: "Cancelled first order", line: "Their only order was cancelled in the last 30 days.", nudge: true },
  { key: "customer_undelivered", kind: "customer", title: "Undelivered", line: "Their last order wasn't delivered, in the last 30 days.", nudge: true },
  { key: "customer_no_order", kind: "customer", title: "No order in 7 days", line: "Signed up 7 to 60 days ago and never ordered.", nudge: true },
  { key: "merchant_applications", kind: "merchant", title: "Applications waiting", line: "Applications waiting on ops over 24 hours. They live in the application queue.", nudge: false },
  { key: "merchant_live_idle", kind: "merchant", title: "Live, no order in 7 days", line: "Live businesses with no order in the last 7 days.", nudge: true },
];

export function stuckListMeta(key: StuckListKey): StuckListMeta {
  return STUCK_LISTS.find((l) => l.key === key)!;
}

// ── Nudge copy ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The one push each nudgeable list sends, fixed (owner decision 6: push only, no SMS). Short and true under the
 * current policy: no balance floor (D-102 / D-104: a job can be taken when the balance covers its commission),
 * "biker" not "rider" (D-101). `data.kind` reuses a kind every installed app already routes: `account` opens the
 * biker board (or Home with `to: customer`), `free_jobs` opens the biker's Money tab.
 */
export interface NudgeCopy {
  title: string;
  body: string;
  data: Record<string, string>;
}

const BIKER = { kind: "account" };
const CUSTOMER = { kind: "account", to: "customer" };

export const NUDGE_COPY: Partial<Record<StuckListKey, NudgeCopy>> = {
  biker_no_didit: { title: "Your ID check is waiting", body: "It takes a few minutes. Open the app to start it.", data: BIKER },
  biker_didit_unfinished: { title: "Finish your ID check", body: "You started it but didn't finish. Open the app to carry on.", data: BIKER },
  biker_declined_fixable: { title: "Try your ID check again", body: "Open the app to see what to fix, then try again.", data: BIKER },
  biker_never_online: { title: "You're ready to ride", body: "Your ID is verified. Go online in the app to get jobs.", data: BIKER },
  biker_idle: { title: "Ready for a job?", body: "Go online when you're free. New jobs show on your board.", data: BIKER },
  biker_low_balance: {
    title: "Top up to keep taking jobs",
    body: "You can take a job when your balance covers its commission. Top up in Money.",
    data: { kind: "free_jobs" },
  },
  biker_id_expiring: { title: "Your ID expires soon", body: "When it runs out you'll need a new ID check before you can go online.", data: BIKER },
  customer_expired: { title: "Still need it sent?", body: "No biker took your last order. Open the app to send it again.", data: CUSTOMER },
  customer_cancelled_first: { title: "Still need something sent?", body: "Open the app when you're ready to send it.", data: CUSTOMER },
  customer_undelivered: { title: "About your last order", body: "It wasn't delivered. Open the app to send it again.", data: CUSTOMER },
  customer_no_order: { title: "Send your first order", body: "A biker can pick it up for you. Open the app to start.", data: CUSTOMER },
  merchant_live_idle: { title: "No orders this week", body: "Check your menu and opening hours are up to date.", data: CUSTOMER },
};

export function nudgeCopy(key: StuckListKey): NudgeCopy | null {
  return stuckListMeta(key).nudge ? (NUDGE_COPY[key] ?? null) : null;
}

// ── Funnels ───────────────────────────────────────────────────────────────────────────────────────────────

export interface StepDef {
  key: string;
  label: string;
  /** Counts are complete only from this Harare day (YYYY-MM-DD); null = full history. */
  since: string | null;
  /** Times (the median) are complete only from this day; null = full history. */
  timesSince: string | null;
  /** Whether the step records a time at all (false → no median, ever). */
  timed: boolean;
  /** The stuck list of the people who did NOT reach this step. */
  stuckList: StuckListKey | null;
}

const step = (key: string, label: string, o: Partial<Omit<StepDef, "key" | "label">> = {}): StepDef => ({
  key,
  label,
  since: o.since ?? null,
  timesSince: o.timesSince ?? null,
  timed: o.timed ?? true,
  stuckList: o.stuckList ?? null,
});

export const FUNNEL_STEPS: Record<FunnelKind, readonly StepDef[]> = {
  biker: [
    step("signed_up", "Signed up"),
    step("profile", "Profile", { timed: false }),
    // Rider.createdAt is exact from PR 2 (migration 0091 backfilled older rows from the sign-up time).
    step("become", "Became a biker", { timesSince: PR2_SINCE }),
    step("didit_started", "Started ID check", { timesSince: KYC_MINT_AUDIT_SINCE, stuckList: "biker_no_didit" }),
    step("verified", "ID verified", { stuckList: "biker_didit_unfinished" }),
    step("plate_verified", "Plate verified", { timesSince: PR2_SINCE, stuckList: "biker_plate_waiting" }),
    step("first_online", "First online", { timesSince: PR2_SINCE, stuckList: "biker_never_online" }),
    step("first_job", "First job", { stuckList: "biker_idle" }),
    step("job_10", "10th job", { stuckList: "biker_idle" }),
    step("first_topup", "First top-up", { stuckList: "biker_low_balance" }),
    step("active_week", "Active this week", { timed: false, stuckList: "biker_idle" }),
  ],
  customer: [
    step("signed_up", "Signed up"),
    step("first_order", "First order", { stuckList: "customer_no_order" }),
    step("delivered", "Delivered", { stuckList: "customer_expired" }),
    step("rated", "Rated"),
    step("second_order", "2nd order in 14 days", { stuckList: "customer_cancelled_first" }),
  ],
  merchant: [
    step("signed_up", "Signed up"),
    step("pin_hours", "Pin + hours", { timed: false, stuckList: "merchant_applications" }),
    // A dish's creation time, not when it was published: approximate.
    step("menu_photos", "Menu with photos", { stuckList: "merchant_applications" }),
    // Only the `merchant.application` "called" event records a call (PR 4).
    step("called", "Ops called", { since: PR2_SINCE, timesSince: PR2_SINCE, stuckList: "merchant_applications" }),
    step("approved", "Approved", { stuckList: "merchant_applications" }),
    step("live", "Live", { stuckList: "merchant_applications" }),
    step("first_order", "First order", { stuckList: "merchant_live_idle" }),
    step("first_completed", "First completed", { stuckList: "merchant_live_idle" }),
    step("ten_orders", "10 orders", { stuckList: "merchant_live_idle" }),
  ],
};

/** One cohort member's steps: a time when known, `true` when reached with no recorded time. Absent = not reached. */
export type PersonSteps = Record<string, Date | true | undefined>;

export interface FunnelStepView {
  key: string;
  label: string;
  count: number;
  /** count ÷ cohort, 0–100 (null for an empty cohort). */
  pctOfCohort: number | null;
  /** count ÷ the previous step's count, 0–100 (null for the first step or a previous step of 0). */
  conversionPct: number | null;
  /** Median time from the person's previous timed step to this one, in ms (null when none can be measured). */
  medianMs: number | null;
  /** How many people the median is taken over. */
  timedCount: number;
  since: string | null;
  timesSince: string | null;
  stuckList: StuckListKey | null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/**
 * Build the funnel bars. Each step counts the people who reached it by its own definition (not "reached every
 * step before it": a biker can top up before their 10th job). The median is taken over people with a time for
 * this step and for an earlier step, measured from the nearest earlier timed step, positive gaps only (a gap of
 * 0 is a backfilled row, a negative one a step taken out of order).
 */
export function buildFunnel(defs: readonly StepDef[], people: PersonSteps[]): FunnelStepView[] {
  const cohort = people.length;
  const counts = defs.map((d) => people.filter((p) => p[d.key] !== undefined).length);
  return defs.map((d, i) => {
    const gaps: number[] = [];
    if (d.timed && i > 0) {
      for (const p of people) {
        const at = p[d.key];
        if (!(at instanceof Date)) continue;
        for (let j = i - 1; j >= 0; j--) {
          const prev = p[defs[j].key];
          if (prev instanceof Date) {
            const gap = at.getTime() - prev.getTime();
            if (gap > 0) gaps.push(gap);
            break;
          }
        }
      }
    }
    return {
      key: d.key,
      label: d.label,
      count: counts[i],
      pctOfCohort: pct(counts[i], cohort),
      // Of the people who reached the step before, the share who reached this one too (≤ 100% even where the
      // steps aren't strictly in order).
      conversionPct: i === 0 ? null : pct(people.filter((p) => p[defs[i - 1].key] !== undefined && p[d.key] !== undefined).length, counts[i - 1]),
      medianMs: median(gaps),
      timedCount: gaps.length,
      since: d.since,
      timesSince: d.timesSince,
      stuckList: d.stuckList,
    };
  });
}

/** The earliest of several optional times. */
export function earliest(...ts: Array<Date | null | undefined>): Date | null {
  let out: Date | null = null;
  for (const t of ts) if (t && (!out || t.getTime() < out.getTime())) out = t;
  return out;
}

/** A reached step: its time when known, else `true`. Not reached → undefined. */
export function reached(isReached: boolean, at: Date | null | undefined): Date | true | undefined {
  if (at) return at;
  return isReached ? true : undefined;
}

// ── Small helpers the service shares ──────────────────────────────────────────────────────────────────────

/** A dialable phone, or null for a booking account / an erased tombstone. */
export function dialable(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.startsWith("business:") || phone.startsWith("erased:")) return null;
  return phone;
}

export const HOURS = HOUR_MS;
export const DAYS = DAY_MS;
