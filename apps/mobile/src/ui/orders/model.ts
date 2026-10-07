import type { MerchantOrderResponse } from "@lynia/shared";
import type { CustomerOrderOutcome, CustomerOrderRow, OrderHistoryRow, OrderSnapshot } from "../../api/orders";
import { liveEta } from "../../logic/eta";
import { GPS_PAUSED_MS } from "../../logic/order-stage";
import type { IconName } from "../Icon";
import { clock, hhmm, riderShortName, usd } from "../order/copy";
import { merchantLive } from "../orderflow/live-copy";
import { ordersCopy as C, OX } from "./copy";

/**
 * Orders v2 view-models (packages/design/handoff/orders-v2, README §4–§6, ledger D-63): pure mappers from
 * the app's order data to what each row and card draws. Fields the API doesn't carry yet fall back as the
 * handoff's README §9 says, each marked `NEEDS BACKEND (orders-v2)`.
 */

export type OrdersService = "send" | "restaurants" | "shops" | "pharmacy";
export type OrdersFilter = "all" | OrdersService;

export type Outcome = "delivered" | "cancelledByYou" | "cancelledByRider" | "cancelledByLynia" | "kitchenTimeout" | "venueDeclined" | "noRider" | "notDelivered";

export interface HistoryRowVM {
  id: string;
  service: OrdersService;
  createdAt: string;
  title: string;
  items: string;
  outcome: Outcome;
  /** 0 → "No charge". */
  chargedUsd: number;
  riderName: string | null;
  rating: number | null;
  /** The drop-off text search also matches ("an area like Belgravia"). */
  area: string;
}

export interface NowCardVM {
  id: string;
  icon: IconName;
  title: string;
  sub: string;
  /** Lit segments of the four-step track (Order flow v2 / After Send v2: the same track the order screen draws). */
  lit: number;
  /** The yellow chip — only with a real ETA. */
  etaMinutes: number | null;
  /** The quiet pill when there is no ETA: "4:12 left" · "No ETA" · "As of 09:24". */
  pill: string | null;
}

/** The four-step track the Now card draws (owner 2026-10-02: Orders v2's card, Order flow v2's track). */
export const NOW_SEGMENTS = 4;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────

/** The first comma segment of an address ("Eastgate Mall" from "Eastgate Mall, CBD"). NEEDS BACKEND
 *  (orders-v2): the drop-off suburb for "Parcel to <area>"; README §9's fallback until it exists. */
export function firstSegment(text: string | null | undefined): string {
  const s = (text ?? "").split(",")[0]?.trim() ?? "";
  return s || (text ?? "").trim();
}

function firstName(full: string | null | undefined): string | null {
  const f = (full ?? "").trim().split(/\s+/)[0];
  return f ? f : null;
}

/** "Tendai M." from a "Tendai Moyo" display name. */
function shortFromFull(full: string | null | undefined): string | null {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return riderShortName(parts[0], parts.length > 1 ? parts[parts.length - 1] : null);
}

const DAY_UPPER = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAY_TITLE = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days between `iso` and `now` (0 = today), or null for an unparseable date. */
function daysAgo(iso: string, now: Date): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
}

/** Day label (README §4): TODAY · YESTERDAY · weekday 2–6 days ago · "TUE 22 SEP" (+ year if not this year). */
export function dayLabel(iso: string, now: Date): string {
  const n = daysAgo(iso, now);
  if (n == null) return "";
  if (n <= 0) return C.today;
  if (n === 1) return C.yesterday;
  const d = new Date(iso);
  if (n <= 6) return DAY_UPPER[d.getDay()]!;
  const base = `${DAY3[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}`.toUpperCase();
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** The date a search result shows instead of the time: "Today" / "Yesterday" / "Monday" / "Tue 22 Sep". */
export function searchDate(iso: string, now: Date): string {
  const n = daysAgo(iso, now);
  if (n == null) return "";
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  const d = new Date(iso);
  if (n <= 6) return DAY_TITLE[d.getDay()]!;
  const base = `${DAY3[d.getDay()]} ${d.getDate()} ${MON3[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Mar 2025" — the End row's "Your orders since …". */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${MON3[d.getMonth()]} ${d.getFullYear()}`;
}

// ── history rows ────────────────────────────────────────────────────────────────────────────────

const OUTCOME: Record<CustomerOrderOutcome, Outcome> = {
  delivered: "delivered",
  cancelled_by_you: "cancelledByYou",
  cancelled_by_rider: "cancelledByRider",
  cancelled_by_lynia: "cancelledByLynia",
  kitchen_timeout: "kitchenTimeout",
  venue_declined: "venueDeclined",
  no_rider: "noRider",
  not_delivered: "notDelivered",
};

const SERVICE: Record<CustomerOrderRow["service"], OrdersService> = { parcel: "send", food: "restaurants", shops: "shops", pharmacy: "pharmacy" };

/** An API older than GET /orders/mine/history sends a plain history row: read its status alone. */
function legacyOutcome(status: string): Outcome {
  if (status === "expired") return "noRider";
  if (status === "undelivered") return "notDelivered";
  return status === "cancelled" ? "cancelledByYou" : "delivered";
}

export function historyRowVM(o: CustomerOrderRow | OrderHistoryRow): HistoryRowVM {
  const merchant = o.orderType === "merchant";
  const full = "outcome" in o && o.outcome in OUTCOME;
  const outcome = full ? OUTCOME[(o as CustomerOrderRow).outcome] : legacyOutcome(o.status);
  const charged = full ? Number((o as CustomerOrderRow).chargedTotal ?? 0) : outcome === "delivered" ? Number(o.agreedFare ?? o.proposedFare) : 0;
  return {
    id: o.id,
    service: "service" in o && o.service in SERVICE ? SERVICE[o.service] : merchant ? "restaurants" : "send",
    createdAt: o.createdAt,
    title: merchant ? o.merchantName || firstSegment(o.pickup.landmark) : C.parcelTo(firstSegment(o.dropoff.landmark)),
    items: merchant ? o.itemDesc : C.parcelItems(o.itemDesc, firstSegment(o.pickup.landmark)),
    outcome,
    // The server's charged amount (a merchant row's grand total); every unpaid outcome reads "No charge"
    // (owner 2026-10-02, "Not delivered" included).
    chargedUsd: Number.isFinite(charged) ? charged : 0,
    riderName: shortFromFull(o.counterpartyName),
    rating: o.rating?.score ?? null,
    area: o.dropoff.landmark,
  };
}

/** Search (README §5): the venue / title, the drop-off area and the rider's name, case-insensitive. */
export function matchesQuery(row: HistoryRowVM, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.title, row.area, row.riderName ?? ""].some((s) => s.toLowerCase().includes(needle));
}

/** Day groups in list order (the feed is newest first). */
export function groupByDay(rows: HistoryRowVM[], now: Date): { label: string; rows: HistoryRowVM[] }[] {
  const out: { label: string; rows: HistoryRowVM[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(r.createdAt, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else out.push({ label, rows: [r] });
  }
  return out;
}

// ── Now cards ───────────────────────────────────────────────────────────────────────────────────

const MOVING = new Set(["picked_up", "en_route_dropoff"]);

/** A running parcel (README §4 "Card stages", on the four-step track Matched · Picked up · On the way · Delivered). */
export function parcelNowVM(o: OrderSnapshot, nowMs: number, asOf: string | null): NowCardVM {
  const area = firstSegment(o.dropoff.landmark);
  const price = usd(Number(o.agreedFare ?? o.proposedFare) || 0);
  const card = o.riderCard ?? null;
  const short = card ? riderShortName(card.firstName, card.lastName) : null;
  const first = card ? firstName(card.firstName) : null;
  const fix = o.rider && o.rider.currentLat != null && o.rider.currentLng != null ? { lat: o.rider.currentLat, lng: o.rider.currentLng } : null;
  const fixAt = o.rider?.updatedAt ? Date.parse(o.rider.updatedAt) : NaN;
  const stale = fix != null && Number.isFinite(fixAt) && nowMs - fixAt > GPS_PAUSED_MS;
  const eta = fix && !stale ? liveEta({ status: o.status, rider: fix, pickup: o.pickup.point, dropoff: o.dropoff.point }) : null;
  const moving = MOVING.has(o.status);

  let title: string;
  let sub: string;
  let lit: number;
  let pill: string | null = null;
  switch (o.status) {
    case "requested":
    case "open_for_offers": {
      title = C.now_.findingT;
      sub = C.now_.findingS(area, price);
      lit = 0;
      const left = o.expiresAt ? Date.parse(o.expiresAt) - nowMs : NaN;
      if (Number.isFinite(left) && left > 0) pill = C.now_.timeLeft(clock(left));
      break;
    }
    case "en_route_pickup":
      title = first ? C.now_.toPickupT(first) : OX.toPickupNoName;
      sub = C.now_.toPickupS(o.pickup.landmark, area);
      lit = 1;
      break;
    case "picked_up":
      title = first ? C.now_.collectedT(first) : OX.collectedNoName;
      sub = C.now_.collectedS(area);
      lit = 2;
      break;
    case "en_route_dropoff":
      title = first ? C.now_.onWayT(first) : OX.onWayNoName;
      sub = C.now_.onWayParcelS(area, price);
      lit = 3;
      break;
    default:
      // assigned / confirmed
      title = short ? C.now_.assignedT(short) : OX.assignedNoName;
      sub = C.now_.assignedS(area);
      lit = 1;
  }
  if (stale && o.status !== "requested" && o.status !== "open_for_offers") {
    sub = C.now_.gpsStaleS(hhmm(o.rider!.updatedAt));
    pill = C.now_.noEta;
  }
  const view: NowCardVM = { id: o.id, icon: moving ? "bike" : "package", title, sub, lit, etaMinutes: eta?.minutes ?? null, pill };
  return asOf ? offline(view, "package", asOf) : view;
}

/** A running restaurant / shop / pharmacy order: Order flow v2's own stage copy (G2), so the card, Home's
 *  live bar and the order screen never disagree (owner 2026-10-02). */
export function merchantNowVM(o: OrderSnapshot, read: MerchantOrderResponse | undefined, nowMs: number, asOf: string | null): NowCardVM {
  const rider = read?.rider ? riderShortName(read.rider.firstName, read.rider.lastName) : null;
  const v = merchantLive(o, read, rider, nowMs);
  const view: NowCardVM = {
    id: o.id,
    icon: v.stage === "onWay" ? "bike" : v.icon,
    title: v.title,
    sub: v.line,
    lit: v.lit,
    etaMinutes: v.etaMinutes,
    pill: null,
  };
  return asOf ? offline(view, v.icon, asOf) : view;
}

/** Offline (README §4): the last stage and progress, no ETA, "Last known · " sub and the "As of" pill. */
function offline(v: NowCardVM, serviceIcon: IconName, asOf: string): NowCardVM {
  return { ...v, icon: serviceIcon, sub: `${C.lastKnownPrefix}${v.sub}`, etaMinutes: null, pill: C.asOf(asOf) };
}

/**
 * Whether a running order still belongs in NOW (README §5 "A card leaves Now as soon as its order is
 * delivered or cancelled"; segment 7 "the card leaves Now and becomes a history row"). The active feed
 * keeps `delivered` (the rating still gates closure, so Home and the cold-start resume can return to it),
 * so the Orders tab filters it out itself — U06: a delivered, unrated parcel otherwise fell to the
 * `parcelNowVM` default ("{Rider} is your rider · Rider assigned") and stayed out of history for up to 6 h.
 * The shared status set is deliberately left alone: Home reads the same query.
 */
export function isNowOrder(o: Pick<OrderSnapshot, "status">): boolean {
  return o.status !== "delivered" && o.status !== "completed";
}

/** Now ordering (README §5): most-advanced stage first, then newest (the feed's own order breaks ties). */
export function sortNow(cards: NowCardVM[]): NowCardVM[] {
  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.lit - a.c.lit || a.i - b.i)
    .map((x) => x.c);
}
