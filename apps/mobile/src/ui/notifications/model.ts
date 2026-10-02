import type { NotificationRow } from "../../api/notifications";
import type { IconName } from "../Icon";
import { N, NF, NX } from "./copy";

/**
 * Notifications v1 (`packages/design/handoff/notifications-v1/`, ledger D-65) — the feed as the screen
 * draws it. Pure: no React, no clock of its own (`now` is passed in), so every rule here is unit-tested.
 *
 * - **Grouping** (README "Behaviour"): one row per order, showing its latest update; the order's earlier
 *   updates become its timeline, latest first. An order sits in the day of its latest update. Account,
 *   money and safety rows stay single rows.
 * - **Side** (N4): order rows follow the side the user is on; account and safety rows show on both.
 * - **Danger pin** (N1c / N3): an SOS, a pause or a block still in force pins above the day groups.
 * - **Copy**: the handoff's `N`, filled from the row data in the same sentence shapes (`NF`). Where `N`
 *   states something the feed doesn't know (a reason, an amount), the row keeps the server's own copy —
 *   the push the user got (ledger D-65 §4).
 */

export type Side = "customer" | "rider";
export type Tone = "neutral" | "good" | "money" | "warn" | "danger";
export type Service = "send" | "restaurants" | "shops" | "pharmacy";

export interface NStep {
  label: string;
  /** "12:21" — the step's clock time. */
  clock: string;
}

export interface NItem {
  /** The order id for an order row, the feed row id otherwise. */
  key: string;
  /** Every feed row id this item stands for — a swipe dismisses them all. */
  ids: string[];
  orderId: string | null;
  /** Order and job rows: the v2 service sticker. Other rows: `icon` on a tone-filled disc. */
  service?: Service;
  icon: IconName;
  tone: Tone;
  unread: boolean;
  title: string;
  line: string;
  /** "now" · "2 min" · "1 hr" · "Yesterday" · "28 Sep". */
  time: string;
  /** The latest update's ISO time (the sort key). */
  at: string;
  /** The order's updates, latest first; steps[0] is the row itself. Only drawn when length > 1. */
  steps: NStep[];
  /** Needs-you rows only (N5). */
  action?: { label: string; to: string };
  /** Where tapping the row goes. */
  to: string;
  /** Rider voice ("Open job") vs customer voice ("Open order"). */
  rider: boolean;
}

export interface NDay {
  key: string;
  /** "TODAY" · "YESTERDAY" · "MON 28 SEP". */
  label: string;
  items: NItem[];
}

export interface NFeed {
  /** Danger items in force, above the day groups. */
  pinned: NItem[];
  days: NDay[];
  /** The other side's unread order updates (dual-role users, N4) — null when there are none. */
  other: { count: number; what: string } | null;
}

/** Row types that belong to an order (grouped by order id, and filtered by side). */
const ORDER_TYPES = new Set(["status", "offer", "fare", "riders_available", "sos", "standing", "standing_resolved", "swap"]);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number): string => String(n).padStart(2, "0");
const dayStart = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days between `at` and `now` (0 = today, 1 = yesterday), in the phone's own time zone. */
function daysAgo(at: Date, now: Date): number {
  return Math.round((dayStart(now) - dayStart(at)) / DAY_MS);
}

/** The row's time (README "Time"): now · 2 min · 1 hr · Yesterday · 28 Sep. */
export function timeLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = daysAgo(at, now);
  const min = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (days <= 0 || min < 60) {
    if (min < 1) return N.now;
    if (min < 60) return NF.min(min);
    return NF.hr(Math.floor(min / 60));
  }
  if (days === 1) return N.yest;
  return NF.date(at.getDate(), MONTHS[at.getMonth()]!);
}

/** The day group's label: TODAY · YESTERDAY · MON 28 SEP. */
export function dayLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  const days = daysAgo(at, now);
  if (days <= 0) return N.dToday;
  if (days === 1) return N.dYest;
  return NF.dayLabel(WEEKDAYS[at.getDay()]!, at.getDate(), MONTHS[at.getMonth()]!);
}

/** "12:21" — a timeline step's clock time. */
export function clockOf(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/** Which side an order row belongs to. A row the API did not side (an older API's SOS) shows on both. */
function rowSide(r: NotificationRow): Side | null {
  return ORDER_TYPES.has(r.type ?? "status") && r.orderId ? (r.to ?? null) : null;
}

/** Is this an order row (grouped) rather than an account / money / safety row (single)? */
function isOrderRow(r: NotificationRow): boolean {
  if (!r.orderId) return false;
  // An older API sends no `type`: every row with an order id was an order row then.
  if (!r.type) return true;
  return ORDER_TYPES.has(r.type) && !(r.type === "sos" && r.active);
}

// ── Copy ──────────────────────────────────────────────────────────────────────────────────────────

/** The row's latest line, in the voice of the side it's on. Falls back to the server's own copy. */
function lineOf(r: NotificationRow, rider: boolean): string {
  const n = r.riderName;
  const p = r.amount;
  const merchant = r.service && r.service !== "send";
  switch (r.type) {
    case "offer":
      return n && p ? NF.cOffer(n, p) : r.message;
    case "fare":
      return p ? NF.cFare(p) : r.message;
    case "riders_available":
      return N.cNear;
    case "standing_resolved":
      return N.sBack;
    case "swap":
      return r.swap ? NF.mSwap(r.swap.item, r.swap.sub, r.swap.diff) : r.message;
    case "sos":
      return !rider && n ? NF.sSosB(n) : r.message;
    case "status":
    case undefined:
      break;
    default:
      return r.message;
  }
  const beat = r.beat ?? r.status ?? "";
  if (rider) {
    if (beat === "assigned") return p ? NF.rGot(p) : r.message;
    if (beat === "completed") return p ? NF.rDelivered(p) : r.message;
    return r.message;
  }
  if (merchant) {
    switch (beat) {
      case "accepted":
        return N.mAccepted;
      case "preparing":
        return NF.mPreparing(r.prepMinutes ?? null);
      case "picked_up":
        return r.service === "restaurants" && n ? NF.mCollected(n) : r.message;
      case "en_route_dropoff":
        return N.mDoor;
      case "delivered":
        return r.service === "restaurants" ? N.mDelivered : N.mDeliveredShop;
      case "cancelled":
        return N.cCancelled;
      default:
        return r.message;
    }
  }
  switch (beat) {
    case "confirmed":
      return n ? NF.cAssigned(n) : r.message;
    case "en_route_pickup":
      return n ? NF.cOnWay(n) : r.message;
    case "picked_up":
      return n ? NF.cCollected(n) : r.message;
    case "en_route_dropoff":
      return n ? NF.cToDrop(n) : r.message;
    case "delivered":
    case "completed":
      return n ? NF.cDelivered(n) : r.message;
    case "undelivered":
      return n ? NF.cNotDone(n) : r.message;
    case "cancelled":
      return N.cCancelled;
    case "rebroadcast":
      return N.cRiderCx;
    case "expired":
    case "no_supply":
    case "window_closed":
      return N.cWindow;
    default:
      return r.message;
  }
}

/** A status beat's timeline label. */
function beatLabel(beat: string, fallback: string, rider: boolean, merchant: boolean): string {
  if (rider) {
    return ({ assigned: N.trGot, completed: N.trDelivered, cancelled: N.trCancelled } as Record<string, string>)[beat] ?? fallback;
  }
  if (merchant) {
    return (
      ({
        accepted: N.tmAccepted,
        preparing: N.tmPreparing,
        picked_up: N.tmCollected,
        en_route_dropoff: N.tmDoor,
        delivered: N.tmDelivered,
        cancelled: N.tlCancelled,
      } as Record<string, string>)[beat] ?? fallback
    );
  }
  return (
    ({
      confirmed: N.tlAssigned,
      en_route_pickup: N.tlOnWay,
      picked_up: N.tlCollected,
      en_route_dropoff: N.tlToDrop,
      delivered: N.tlDelivered,
      completed: N.tlDelivered,
      cancelled: N.tlCancelled,
      rebroadcast: NX.tlRebroadcast,
      expired: N.tlNoRiders,
      no_supply: N.tlNoRiders,
      window_closed: N.tlNoRiders,
    } as Record<string, string>)[beat] ?? fallback
  );
}

/** The timeline steps one feed row contributes (latest first). */
function stepsOf(r: NotificationRow, rider: boolean): { label: string; at: string }[] {
  const merchant = !!r.service && r.service !== "send";
  switch (r.type) {
    case "offer":
      return [{ label: N.tlOffer, at: r.at }];
    case "fare":
      return [{ label: NX.tlFare, at: r.at }];
    case "sos":
      return [{ label: N.tlSos, at: r.at }];
    case "standing_resolved":
      return [{ label: N.tlBack, at: r.at }];
    case "swap":
      return [{ label: N.tmSwap, at: r.at }];
    case "standing":
    case "riders_available":
      return [{ label: r.title, at: r.at }];
    default:
      break;
  }
  const steps = r.steps?.length ? r.steps : [{ beat: r.beat ?? r.status ?? "", title: r.title, at: r.at }];
  return steps.map((s) => ({ label: beatLabel(s.beat, s.title, rider, merchant), at: s.at }));
}

/** Tone (README "Tones"): on order rows the corner mark, on the rest the disc fill. */
function toneOf(r: NotificationRow): Tone {
  switch (r.type) {
    case "offer":
    case "swap":
      return r.active ? "warn" : "neutral";
    case "sos":
      return r.active ? "danger" : "neutral";
    case "standing_resolved":
    case "issue":
      return "good";
    case "account":
      return accountOf(r).tone;
    default:
      break;
  }
  const beat = r.beat ?? r.status;
  return beat === "delivered" || beat === "completed" ? "good" : "neutral";
}

/** An account row's disc, title, line, tone and needs-you action. */
function accountOf(r: NotificationRow): { icon: IconName; tone: Tone; title: string; line: string; action?: NItem["action"] } {
  switch (r.action) {
    case "rider.kyc_approve":
      return { icon: "shield-check", tone: "good", title: N.aVerifiedT, line: N.aVerifiedB };
    case "rider.kyc_decline":
      return { icon: "id-card", tone: "warn", title: N.aIdT, line: r.message, action: { label: N.tryAgain, to: "/rider/become" } };
    case "rider.suspend":
    case "customer.hold":
      return { icon: "ban", tone: r.active ? "danger" : "neutral", title: N.aPausedT, line: r.message };
    case "rider.ban":
      return { icon: "ban", tone: r.active ? "danger" : "neutral", title: N.aBlockedT, line: N.aBlockedB };
    case "rider.lift":
    case "rider.clear_hold":
    case "customer.lift":
      return { icon: "shield-check", tone: "good", title: N.aRestoredT, line: r.message };
    case "wallet.credit":
      return { icon: "banknote", tone: "money", title: N.aWalletT, line: r.message };
    default:
      return { icon: r.icon, tone: "neutral", title: r.title, line: r.message };
  }
}

/** Where tapping a row goes (KB-FEED-SYNTH / BH-18 routing, shared with the old screen). */
export type Destination = (row: NotificationRow) => string;

/** One single (ungrouped) item: an account, money or safety row, or a pinned danger row. */
function singleItem(r: NotificationRow, unread: boolean, now: Date, side: Side, dest: Destination): NItem {
  const base = { key: r.id, ids: [r.id], orderId: r.orderId, unread, time: timeLabel(r.at, now), at: r.at, steps: [], to: dest(r), rider: side === "rider" };
  if (r.type === "account" || (!r.type && !r.orderId)) {
    const a = accountOf(r);
    return { ...base, icon: a.icon, tone: a.tone, title: a.title, line: a.line, action: a.action };
  }
  if (r.type === "sos") return { ...base, icon: "siren", tone: toneOf(r), title: N.sSosT, line: lineOf(r, side === "rider") };
  if (r.type === "issue") return { ...base, icon: "shield-check", tone: "good", title: N.sResolvedT, line: r.message };
  return { ...base, icon: r.icon, tone: toneOf(r), title: r.title, line: lineOf(r, side === "rider") };
}

/** The order row's title: "Parcel to Glenara Ave" / the venue (customer); "Eastgate → Glenara Ave" (rider). */
function orderTitle(rows: NotificationRow[], rider: boolean): string {
  const pick = <K extends keyof NotificationRow>(k: K): NotificationRow[K] | undefined => rows.find((r) => r[k] != null)?.[k];
  const venue = pick("venue");
  const from = venue ?? pick("pickupArea");
  const to = pick("dropoffArea");
  if (rider) return from && to ? NF.job(from, to) : rows[0]!.title;
  if (venue) return venue;
  return to ? NF.parcelTo(to) : rows[0]!.title;
}

/** One order's rows (newest first) → its row. */
function orderItem(rows: NotificationRow[], unreadIds: ReadonlySet<string>, now: Date, side: Side, dest: Destination): NItem {
  const lead = rows[0]!;
  const rider = side === "rider";
  const service = (rows.find((r) => r.service)?.service ?? "send") as Service;
  const seen = new Set<string>();
  const steps = rows
    .flatMap((r) => stepsOf(r, rider))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .filter((s) => {
      const k = `${s.at}|${s.label}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((s) => ({ label: s.label, clock: clockOf(s.at) }));
  // A needs-you row keeps its button while the ask is open, even when a quieter update landed after it.
  const ask = rows.find((r) => r.active && (r.type === "offer" || r.type === "swap"));
  const action = ask ? { label: ask.type === "offer" ? N.seeOffer : N.reviewSwap, to: dest(ask) } : undefined;
  const shown = ask ?? lead;
  return {
    key: lead.orderId!,
    ids: rows.map((r) => r.id),
    orderId: lead.orderId,
    service,
    icon: lead.icon,
    tone: toneOf(shown),
    unread: rows.some((r) => unreadIds.has(r.id)),
    title: orderTitle(rows, rider),
    line: lineOf(shown, rider),
    time: timeLabel(lead.at, now),
    at: lead.at,
    steps,
    action,
    to: dest(lead),
    rider,
  };
}

/**
 * The whole screen's data. `unreadIds` is the set of rows that were unread when this visit began (the
 * dots stay until the user leaves — README "Read state"); `hidden` are rows swiped away awaiting Undo.
 */
export function buildFeed(
  rows: readonly NotificationRow[],
  opts: { side: Side; now: Date; unreadIds: ReadonlySet<string>; hidden?: ReadonlySet<string>; dest: Destination },
): NFeed {
  const { side, now, unreadIds, dest } = opts;
  const hidden = opts.hidden ?? new Set<string>();
  const visible = rows.filter((r) => !hidden.has(r.id));
  const mine = visible.filter((r) => {
    const s = rowSide(r);
    return s === null || s === side;
  });

  const pinned: NItem[] = [];
  const singles: NItem[] = [];
  const byOrder = new Map<string, NotificationRow[]>();
  for (const r of mine) {
    if (r.active && (r.type === "sos" || (r.type === "account" && accountOf(r).tone === "danger"))) {
      pinned.push(singleItem(r, unreadIds.has(r.id), now, side, dest));
    } else if (isOrderRow(r)) {
      const list = byOrder.get(r.orderId!);
      if (list) list.push(r);
      else byOrder.set(r.orderId!, [r]);
    } else {
      singles.push(singleItem(r, unreadIds.has(r.id), now, side, dest));
    }
  }
  const newestFirst = (a: { at: string }, b: { at: string }): number => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
  const orders = [...byOrder.values()].map((list) => orderItem([...list].sort(newestFirst), unreadIds, now, side, dest));
  const items = [...orders, ...singles].sort(newestFirst);

  const days: NDay[] = [];
  for (const item of items) {
    const label = dayLabel(item.at, now);
    const last = days.at(-1);
    if (last && last.label === label) last.items.push(item);
    else days.push({ key: label, label, items: [item] });
  }

  // N4: the other side's unread order updates, one count per order.
  const otherSide: Side = side === "rider" ? "customer" : "rider";
  const otherGroups = new Map<string, NotificationRow[]>();
  for (const r of visible) {
    if (rowSide(r) !== otherSide || !unreadIds.has(r.id)) continue;
    const list = otherGroups.get(r.orderId!);
    if (list) list.push(r);
    else otherGroups.set(r.orderId!, [r]);
  }
  const otherTitles = [...otherGroups.values()].map((list) => orderTitle([...list].sort(newestFirst), otherSide === "rider"));
  const other = otherTitles.length ? { count: otherTitles.length, what: otherTitles.slice(0, 2).join(", ") } : null;

  return { pinned: pinned.sort(newestFirst), days, other };
}
