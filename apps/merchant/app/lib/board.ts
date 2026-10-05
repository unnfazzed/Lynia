import type { MerchantBookingResponse, MerchantOrderResponse } from "@lynia/shared";
import { isFinding } from "./booking";
import { shortName } from "./booking-view";
import { isNoRiderHold, isReadyBucket, needsKitchenConfirm } from "./order-groups";
import { hm, isAfterPickup, money, orderLabel, riderFirstName } from "./orders-view";
import { openRound } from "./substitution";
import { countOf, type Vocabulary } from "./vocabulary";

/**
 * Merchant v2's Orders board (K1 kitchen, S1 shop — packages/design/handoff/merchant-v2, ledger D-77),
 * kept pure so every rule is unit-tested. One list, sorted by urgency (BRIEF §2):
 *
 *   1. NEEDS YOU — ringing orders, a rider for the counter, rider offers about to expire, answers due;
 *   2. COOKING / PACKING — with how long is left and when it's ready;
 *   3. ON THE WAY;
 *   4. cash still to come back.
 *
 * A shop's own rider bookings (BOOKED) sit in the same list as its customer orders (APP).
 */

export type BoardTag = "APP" | "BOOKED";

export interface BoardCard {
  key: string;
  href: string;
  /** K1's counter card: the bike disc and a "Hand over" pill. */
  counter?: boolean;
  /** A 2px accent border: this one needs the merchant. */
  urgent?: boolean;
  tag?: BoardTag;
  title: string;
  sub?: string;
  /** Gold sub-line (cash late). */
  subTone?: "gold";
  /** A live "m:ss" after the sub, counting down to this instant. */
  subDeadline?: string | null;
  /** The gold count chip on the right (offers about to expire). */
  chipDeadline?: string | null;
  /** The right-hand figure ("8 min", "Ready"). */
  right?: string;
  /** A cooking card's continuous bar (0–1), or a booking's five segments filled. */
  bar?: { fraction: number } | { steps: number };
  chevron?: boolean;
  /** K1b (D-77 follow-ups): a cash-to-come-back row — gold with a LATE chip once overdue, and a Call
   *  pill to the rider (in place of the chevron) when the number is known. */
  cash?: { late: boolean; phone: string | null };
}

export interface BoardSection {
  id: "needs" | "making" | "way" | "cash";
  heading: string;
  cards: BoardCard[];
}

/** "Mazondo, Sadza & greens" for several lines (names joined by commas), "1× Mazondo" for one (both as K1 draws them). */
export function boardItems(o: Pick<MerchantOrderResponse, "items">): string {
  if (o.items.length === 1) return `${o.items[0]!.quantity}× ${o.items[0]!.name}`;
  return o.items.map((i) => i.name).join(", ");
}

/** When the food is ready: started + prep minutes. */
export function readyAt(o: Pick<MerchantOrderResponse, "prepStartedAt" | "prepMinutes">): Date | null {
  if (!o.prepStartedAt || o.prepMinutes == null) return null;
  return new Date(new Date(o.prepStartedAt).getTime() + o.prepMinutes * 60_000);
}

function customer(o: Pick<MerchantOrderResponse, "customerFirstName">): string {
  return o.customerFirstName?.trim() || "the customer";
}

function possessive(name: string): string {
  return name === "the customer" ? "the customer’s" : `${name}’s`;
}

function orderCards(
  o: MerchantOrderResponse,
  v: Vocabulary,
  shop: boolean,
  now: number,
): { section: BoardSection["id"]; card: BoardCard; rank: number } | null {
  const tag: BoardTag | undefined = shop ? "APP" : undefined;
  const href = `/queue/${o.id}`;
  const label = orderLabel(o);
  // 1 · NEEDS YOU
  if (o.merchantPhase === "awaiting_accept" || needsKitchenConfirm(o)) {
    return {
      section: "needs",
      rank: 0,
      card: {
        key: o.id,
        href: "/queue",
        urgent: true,
        tag,
        title: `${label} · New order`,
        sub: `${countOf(o.items.length, v)} · ${money(o.merchantGoodsTotal)}`,
        chevron: true,
      },
    };
  }
  if (o.merchantPhase === "awaiting_item_approval") {
    const round = openRound(o);
    const n = round?.lines.length ?? 0;
    const who = customer(o);
    return {
      section: "needs",
      rank: 2,
      card: {
        key: o.id,
        href,
        tag,
        title: `${label} · ${who === "the customer" ? "The customer" : who} asked for ${countOf(o.items.length, v)}`,
        sub: n > 0 ? `Waiting for ${possessive(who)} OK on ${n} change${n === 1 ? "" : "s"}` : `Waiting for ${possessive(who)} OK`,
        subDeadline: round?.deadlineAt ?? o.itemApprovalDeadlineAt,
      },
    };
  }
  if (o.merchantPhase === "awaiting_payment") {
    return {
      section: "needs",
      rank: 3,
      card: { key: o.id, href, urgent: true, tag, title: `${label} · ${boardItems(o)}`, sub: "Waiting for payment", chevron: true },
    };
  }
  if (isReadyBucket(o)) {
    if (isNoRiderHold(o)) {
      return {
        section: "needs",
        rank: 1,
        card: { key: o.id, href, urgent: true, tag, title: `${label} · No rider yet`, sub: "Decide what to do", chevron: true },
      };
    }
    const rider = riderFirstName(o);
    if (o.riderId && rider) {
      return {
        section: "needs",
        rank: 1,
        card: {
          key: o.id,
          href,
          counter: true,
          urgent: true,
          tag,
          // Merchant v2 (D-77): "at your counter" once the rider's location reached the pickup.
          title: o.riderArrivedAt ? `${rider} is at your counter` : `${rider} is coming to your counter`,
          sub: `${label} · ${boardItems(o)} · ${money(o.merchantGoodsTotal)}`,
        },
      };
    }
    const ready = readyAt(o) ?? (o.readyAt ? new Date(o.readyAt) : null);
    return {
      section: "making",
      rank: ready?.getTime() ?? 0,
      card: {
        key: o.id,
        href,
        tag,
        title: `${label} · ${boardItems(o)}`,
        right: "Ready",
        bar: { fraction: 1 },
        sub: [ready ? `Ready ${hm(ready.toISOString())}` : null, "finding a rider"].filter(Boolean).join(" · "),
      },
    };
  }
  // 2 · COOKING / PACKING
  if (o.merchantPhase === "preparing") {
    const ready = readyAt(o);
    const total = (o.prepMinutes ?? 0) * 60_000;
    const left = ready ? ready.getTime() - now : null;
    const fraction = ready && total > 0 ? Math.min(1, Math.max(0, 1 - (left ?? 0) / total)) : 0;
    const rider = o.riderId ? "rider booked" : o.dispatchAttempt > 0 ? "finding a rider" : null;
    return {
      section: "making",
      rank: ready?.getTime() ?? Number.MAX_SAFE_INTEGER,
      card: {
        key: o.id,
        href,
        tag,
        title: `${label} · ${boardItems(o)}`,
        right: left === null ? undefined : left > 0 ? `${Math.ceil(left / 60_000)} min` : "Due",
        bar: { fraction },
        sub: [ready ? `Ready ${hm(ready.toISOString())}` : null, rider].filter(Boolean).join(" · ") || undefined,
      },
    };
  }
  // 3 · ON THE WAY, 4 · cash still to come back
  if (isAfterPickup(o) && !o.merchantClosedAt) {
    const rider = riderFirstName(o);
    const owed = o.debtStatus === "open" && o.debtAmount ? o.debtAmount : null;
    const delivered = o.status === "delivered" || o.status === "completed" || o.status === "undelivered";
    if (!delivered) {
      return {
        section: "way",
        rank: new Date(o.createdAt ?? 0).getTime(),
        card: {
          key: o.id,
          href,
          tag,
          title: rider ? `${label} · ${rider}` : label,
          sub: [o.riderEtaAt ? `Arrives ${hm(o.riderEtaAt)}` : "On the way", owed ? `then brings you ${money(owed)}` : null].filter(Boolean).join(" · "),
          chevron: true,
        },
      };
    }
    if (owed) {
      const due = o.cashDueAt ? new Date(o.cashDueAt) : null;
      const late = due !== null && due.getTime() < now;
      const who = rider ?? "Your rider";
      return {
        section: "cash",
        rank: cashRank(late, due),
        card: {
          key: o.id,
          href,
          tag,
          title: `${money(owed)} · ${label}`,
          sub: late
            ? `${who} · was due ${hm(due!.toISOString())}`
            : [who, o.deliveredAt ? `delivered ${hm(o.deliveredAt)}` : null, due ? `back by ${hm(due.toISOString())}` : null].filter(Boolean).join(" · "),
          subTone: late ? "gold" : undefined,
          cash: { late, phone: o.riderPhone ?? null },
          chevron: !late,
        },
      };
    }
  }
  return null;
}

function bookingCard(b: MerchantBookingResponse, now: number): { section: BoardSection["id"]; card: BoardCard; rank: number } | null {
  if (b.rebroadcastedToId) return null;
  const href = `/deliveries/${b.id}`;
  const rider = shortName(b.rider?.name);
  const cod = b.cashOnDelivery ?? null;
  if (isFinding(b.state)) {
    if (b.offerCount > 0) {
      return {
        section: "needs",
        rank: 1,
        card: {
          key: b.id,
          href,
          urgent: true,
          title: `${b.itemsSummary} · ${b.offerCount} rider${b.offerCount === 1 ? "" : "s"} offered`,
          sub: "Pick one before the offers expire",
          chipDeadline: b.expiresAt,
        },
      };
    }
    return { section: "making", rank: now, card: { key: b.id, href, tag: "BOOKED", title: b.itemsSummary, sub: "Finding a rider", chipDeadline: b.expiresAt } };
  }
  if (b.state === "coming") {
    return {
      section: "needs",
      rank: 1,
      card: {
        key: b.id,
        href,
        counter: true,
        urgent: true,
        tag: "BOOKED",
        title: `${rider ?? "A rider"} is ${b.riderArrivedAt ? "at" : "coming to"} your counter`,
        sub: b.itemsSummary,
      },
    };
  }
  if (b.state === "picked_up") {
    const due = cod?.dueAt ? ` by ${hm(cod.dueAt)}` : "";
    return {
      section: "way",
      rank: new Date(b.createdAt).getTime(),
      card: {
        key: b.id,
        href,
        tag: "BOOKED",
        title: rider ? `${b.itemsSummary} · ${rider}` : b.itemsSummary,
        bar: { steps: 4 },
        sub: cod ? `Brings you ${money(Number(cod.amount))}${due}` : b.riderEtaAt ? `Arrives ${hm(b.riderEtaAt)}` : "On the way",
      },
    };
  }
  if (b.state === "delivered" && cod?.status === "due") {
    const dueAt = cod.dueAt ? new Date(cod.dueAt) : null;
    const late = dueAt !== null && dueAt.getTime() < now;
    const who = rider ?? "Your rider";
    return {
      section: "cash",
      rank: cashRank(late, dueAt),
      card: {
        key: b.id,
        href,
        tag: "BOOKED",
        title: `${money(Number(cod.amount))} · ${b.itemsSummary}`,
        sub: late ? `${who} · was due ${hm(cod.dueAt)}` : dueAt ? `${who} · back by ${hm(cod.dueAt)}` : who,
        subTone: late ? "gold" : undefined,
        cash: { late, phone: b.rider?.phone ?? null },
        chevron: !late,
      },
    };
  }
  return null;
}

/** K1b: late rows first, then the rest; the oldest due first within each. */
function cashRank(late: boolean, due: Date | null): number {
  return (late ? 0 : 1e15) + (due?.getTime() ?? 0);
}

/** K1 / S1: the board's sections, each sorted most urgent first, empty ones dropped. */
export function buildBoard(input: {
  orders: readonly MerchantOrderResponse[];
  bookings?: readonly MerchantBookingResponse[];
  v: Vocabulary;
  shop: boolean;
  now: number;
}): BoardSection[] {
  const placed = [
    ...input.orders.map((o) => orderCards(o, input.v, input.shop, input.now)),
    ...(input.bookings ?? []).map((b) => bookingCard(b, input.now)),
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  const pick = (id: BoardSection["id"]) =>
    placed
      .filter((p) => p.section === id)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => p.card);
  const sections: BoardSection[] = [
    { id: "needs", heading: "NEEDS YOU", cards: pick("needs") },
    { id: "making", heading: input.v.making.toUpperCase(), cards: pick("making") },
    { id: "way", heading: "ON THE WAY", cards: pick("way") },
    { id: "cash", heading: "CASH TO COME BACK", cards: pick("cash") },
  ];
  return sections.filter((s) => s.cards.length > 0).map((s) => (s.id === "needs" ? s : { ...s, heading: `${s.heading} · ${s.cards.length}` }));
}
