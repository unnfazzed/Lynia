"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PREP_CHIPS_MIN,
  RESTAURANTS_AUTO_ACCEPT,
  type MerchantOrderItemView,
  type MerchantOrderResponse,
  type MerchantRejectionReasonCode,
  type MerchantShopKind,
  type SubstitutionProposalLine,
} from "@lynia/shared";
import { useBusiness } from "../../lib/business";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { needsKitchenConfirm } from "../../lib/order-groups";
import { hm, money, orderLabel } from "../../lib/orders-view";
import { changeableLines, proposalLines, swapLine } from "../../lib/substitution";
import { useNow } from "../../lib/use-now";
import { countOf, ORDER_FLOW as OF, vocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";
import { InfoStrip, ReasonSheet } from "../m/ReasonSheet";
import { useToast } from "../m/Toast";
import { SwapPicker, useProposer, type Proposer } from "./proposer";
import { prescriptionHref } from "../../lib/routes";

type Prep = (typeof PREP_CHIPS_MIN)[number];

/**
 * K2 / S2 · the order rings (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77). One
 * full-screen ringing screen for a new order, an auto-accepted one the kitchen hasn't confirmed, and a
 * scheduled one at its start time: only the banner line changes (BRIEF §3).
 *
 * The green banner carries "NEW ORDER · #A1B2", what it is ("3 dishes · $15.00 · cash", a shop's
 * "4 items · Rudo · cash") and the time left to answer — the server's own deadline (owner decision:
 * the 3-minute window stays). The white sheet overlaps it by 14px: the lines, then for a kitchen the
 * ready-in chips ("Accept · ready 07:36" says the clock time), for a shop the inline swap / remove /
 * undo with the new total. Changes are sent with the accept in one action ("Accept with 2 changes").
 * "Can't take it" opens the reasons sheet. The alarm rings until it is answered: no back out of it.
 */
export function RingingScreen({
  active,
  disabled,
  onAccept,
  onPropose,
  onReject,
  onConfirm,
  onCancel,
  onEditItems,
  refetch,
}: {
  active: MerchantOrderResponse;
  disabled: boolean;
  onAccept: (orderId: string, prepMinutes: Prep, unavailableDishIds: string[]) => Promise<void>;
  onPropose: (orderId: string, prepMinutes: Prep, lines: SubstitutionProposalLine[]) => Promise<void>;
  onReject: (orderId: string, reason: MerchantRejectionReasonCode, note?: string) => Promise<void>;
  /** Auto-accept: the kitchen confirms it is making it. */
  onConfirm: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onEditItems: (orderId: string, lines: SubstitutionProposalLine[]) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const now = useNow();
  const toast = useToast();
  const shop = active.venue?.businessType === "shop";
  const v = vocabulary(active.venue?.businessType, active.venue?.shopKind as MerchantShopKind | null | undefined);
  const auto = needsKitchenConfirm(active);
  const scheduled = !!active.scheduledFor;
  const p = useProposer(active);
  // README "Navigation": an Rx order's prescription check (P1) comes before it is accepted (S2).
  const business = useBusiness();
  const rxFirst = active.prescription?.status === "pending" && business?.myIsPharmacist === true;
  const [prepMinutes, setPrepMinutes] = useState<Prep>(15);
  const [reasons, setReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous double-submit guard: two taps in one tick both read `submitting` as false. Order
  // assignment is a sensitive lane, so a fast double-tap must never double-accept or double-reject.
  const submittingRef = useRef(false);

  // Back is blocked here: the alarm must be answered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !p.picking && !reasons) toast("Accept or decline to stop the alarm");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast, p.picking, reasons]);

  async function run(action: () => Promise<void>, done: string, failed: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await action();
      setReasons(false);
      toast(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : failed);
      setReasons(false);
      // A refusal (usually a 409: the order already resolved) refetches, so a stale screen clears itself.
      await refetch().catch(() => {});
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const lines = proposalLines(active, p.changes);
  const changing = lines.length > 0;
  const who = active.customerFirstName?.trim() || null;
  const making = v.making.toLowerCase();
  const autoReady =
    auto && active.prepStartedAt && active.prepMinutes != null ? new Date(new Date(active.prepStartedAt).getTime() + active.prepMinutes * 60_000) : null;
  const readyAt = autoReady ?? new Date(now + prepMinutes * 60_000);
  const deadline = auto
    ? active.createdAt
      ? new Date(new Date(active.createdAt).getTime() + RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs).toISOString()
      : null
    : active.acceptDeadlineAt;
  const left = deadline ? msUntil(deadline, now) : null;
  // D-77 K2a: if the ring runs out while "Why can't you take it?" is open, the sheet closes (missed).
  const expired = left !== null && left <= 0;
  useEffect(() => {
    if (expired) setReasons(false);
  }, [expired]);

  const acceptLabel = changing
    ? `Accept with ${lines.length} change${lines.length === 1 ? "" : "s"}`
    : shop && !auto
      ? "Accept"
      : `Accept · ready ${hm(readyAt.toISOString())}`;

  function accept() {
    if (auto) {
      return run(
        async () => {
          if (changing) await onEditItems(active.id, lines);
          await onConfirm(active.id);
        },
        "Confirmed · we’ll send a rider when it’s nearly ready",
        "Couldn't confirm the order. Try again.",
      );
    }
    return changing
      ? run(() => onPropose(active.id, prepMinutes, lines), "Accepted · the customer has 3 minutes for the changes", "Couldn't accept the order. Try again.")
      : run(() => onAccept(active.id, prepMinutes, []), `Accepted · ready ${hm(readyAt.toISOString())}`, "Couldn't accept the order. Try again.");
  }
  const decline = (reason: MerchantRejectionReasonCode, note?: string) =>
    run(() => (auto ? onCancel(active.id) : onReject(active.id, reason, note)), "Declined · the customer was told", "Couldn't decline the order. Try again.");

  const busy = disabled || submitting;
  const pay = active.paymentMethod ?? "cash";
  const what =
    shop && who
      ? `${countOf(active.items.length, v)} · ${who} · ${pay}`
      : `${countOf(active.items.length, v)} · ${money(active.merchantGoodsTotal ?? p.totals.was)} · ${pay}`;

  return (
    <div className="m-overlay" style={{ zIndex: 60 }}>
      <div className="m-overlay-frame m-ringf" role="alertdialog" aria-label={`New order ${orderLabel(active)}`}>
        <div className="m-ringb">
          <i aria-hidden="true">
            <Icon name="volume-2" size={20} />
          </i>
          <div className="m-ringt">
            <b>{`${scheduled ? OF.scheduled : OF.newOrder} · ${orderLabel(active)}`}</b>
            <span>{auto ? OF.auto : what}</span>
          </div>
          {left !== null && (
            <div className="m-ringc">
              <b className="m-num" aria-label="Time left to answer">
                {formatCountdown(left)}
              </b>
              {!shop && <span>to answer</span>}
            </div>
          )}
        </div>

        <div className="m-rings">
          {rxFirst && <p className="m-hint m-ringhint">This order needs a prescription. Check it first, then accept.</p>}
          {shop && !rxFirst && <p className="m-hint m-ringhint">Missing something? Tap it to swap or remove.</p>}
          <RingLines order={active} p={p} shop={shop} disabled={busy} />
          {active.note && <q className="m-notechip">{active.note}</q>}
          {changing && (
            <div className="m-newtotal">
              <span>New total</span>
              <b className="m-num">
                <s>{money(p.totals.was)}</s> {money(p.totals.now)}
              </b>
            </div>
          )}
          {!shop && !auto && (
            <div className="m-readyin">
              <b>Ready in</b>
              <div role="radiogroup" aria-label="Ready in">
                {PREP_CHIPS_MIN.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={prepMinutes === m} onClick={() => setPrepMinutes(m)}>
                    {m}
                  </button>
                ))}
              </div>
              <span>min · we book the rider to arrive as it&apos;s ready</span>
            </div>
          )}
          {!shop && (
            <div className="m-tiprow">
              <Icon name="pencil" size={20} color="var(--accent-text)" />
              <span>Out of something? Tap a dish to remove it.</span>
            </div>
          )}
        </div>

        <div className="m-cta">
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          {changing && (
            <span className="m-ctahint">
              {who ?? "The customer"} has 3 min to OK the changes. Start {making} now.
            </span>
          )}
          {rxFirst ? (
            <Link href={prescriptionHref(active.id)} className="m-btn">
              <Icon name="file-text" size={18} />
              Check the prescription
            </Link>
          ) : (
            <button type="button" className="m-btn" disabled={busy} onClick={() => void accept()}>
              {acceptLabel}
            </button>
          )}
          <button type="button" className="m-btn2" disabled={busy} onClick={() => setReasons(true)}>
            {OF.decline}
          </button>
        </div>
      </div>

      {p.picking && <SwapPicker item={p.picking} onPick={(c) => p.set(p.picking!.itemId, c)} onCancel={() => p.setPicking(null)} />}
      {reasons && (
        <ReasonsSheet
          shop={shop}
          label={orderLabel(active)}
          customer={who}
          busy={submitting}
          onPick={(r, note) => void decline(r, note)}
          onCancel={() => setReasons(false)}
        />
      )}
    </div>
  );
}

/** The lines: a kitchen taps a dish to remove it; a shop taps an item for "Remove it" / "Swap for…".
 *  A removed line greys and strikes through with "Removed · Undo"; a swap shows "⇄ Bakers Inn · +$0.10". */
function RingLines({ order, p, shop, disabled }: { order: MerchantOrderResponse; p: Proposer; shop: boolean; disabled: boolean }) {
  const editable = new Set(changeableLines(order).map((l) => l.itemId));
  return (
    <div className="m-rlines">
      {order.items.map((item, i) => {
        const id = item.itemId;
        const change = id ? p.changes[id] : undefined;
        const canEdit = !!id && editable.has(id);
        const tap = () => {
          if (!id) return;
          // A kitchen's tap removes the dish (or undoes it); a shop's opens the two choices.
          if (!shop && !change) p.set(id, { kind: "remove" });
          else p.tap(id);
        };
        return (
          <RingLine
            key={id ?? `${item.dishId}-${i}`}
            item={item}
            change={change}
            selected={p.selected === id}
            swaps={p.swaps}
            disabled={disabled || !canEdit}
            onTap={tap}
            onRemove={() => id && p.set(id, { kind: "remove" })}
            onSwap={() => id && p.setPicking({ ...item, itemId: id })}
          />
        );
      })}
    </div>
  );
}

function RingLine({
  item,
  change,
  selected,
  swaps,
  disabled,
  onTap,
  onRemove,
  onSwap,
}: {
  item: MerchantOrderItemView;
  change?: { kind: "remove" } | { kind: "swap"; name: string; priceUsd: number };
  selected: boolean;
  swaps: boolean;
  disabled: boolean;
  onTap: () => void;
  onRemove: () => void;
  onSwap: () => void;
}) {
  const removed = change?.kind === "remove";
  return (
    <div className={`m-rl${removed ? " m-removed" : ""}`}>
      <button type="button" aria-expanded={selected} disabled={disabled} onClick={onTap}>
        <b>{item.quantity}×</b>
        <div>
          <span className="m-rln">{item.name}</span>
          {item.note && <q className="m-notechip">{item.note}</q>}
          {change?.kind === "swap" && (
            <span className="m-swapln">
              <Icon name="arrow-left-right" size={14} />
              {swapLine(change, item.priceUsd, OF.mSame).replace(/ · \$[\d.]+ \((.+)\)$/, " · $1")}
            </span>
          )}
          {removed && <span className="m-undo">Removed · Undo</span>}
        </div>
        <span className="m-num">{money(item.priceUsd * item.quantity)}</span>
      </button>
      {selected && !change && (
        <div className="m-rlacts">
          <button type="button" className="m-gh" disabled={disabled} onClick={onRemove}>
            <Icon name="trash-2" size={16} />
            {OF.mRemove}
          </button>
          {swaps && (
            <button type="button" className="m-gh" disabled={disabled} onClick={onSwap}>
              <Icon name="arrow-left-right" size={16} />
              {OF.mSwap}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** K2a / S2a "Why can't you take it?" (Merchant v2 follow-ups, D-77). The reason is the customer's copy
 *  (D-11); "Something else" may carry a note the customer sees. */
const REASONS: Record<"kitchen" | "shop", readonly (readonly [MerchantRejectionReasonCode, string])[]> = {
  kitchen: [
    ["out_of_ingredient", "Out of an ingredient"],
    ["too_busy", "Too busy right now"],
    ["closing_soon", "Closing soon"],
    ["other", "Something else"],
  ],
  shop: [
    ["out_of_stock", "Out of stock"],
    ["too_busy", "Too busy right now"],
    ["closing_soon", "Closing soon"],
    ["other", "Something else"],
  ],
};

export function ReasonsSheet({
  shop,
  label,
  customer,
  busy,
  onPick,
  onCancel,
}: {
  shop: boolean;
  label: string;
  customer: string | null;
  busy: boolean;
  onPick: (reason: MerchantRejectionReasonCode, note?: string) => void;
  onCancel: () => void;
}) {
  const who = customer ?? "the customer";
  return (
    <ReasonSheet
      title="Why can't you take it?"
      sub={`We tell ${who} straight away.`}
      reasons={REASONS[shop ? "shop" : "kitchen"]}
      noteFor="other"
      noteHelper={`${customer ?? "The customer"} sees this note.`}
      extra={(picked) =>
        !shop && picked === "too_busy" ? (
          <InfoStrip icon="clock">
            Busy for a while? <b style={{ display: "inline" }}>Open, but busy</b> adds 10 min to new orders instead of turning them away.
          </InfoStrip>
        ) : null
      }
      cta={`Turn down ${label}`}
      secondary="Go back"
      busy={busy}
      onConfirm={onPick}
      onCancel={onCancel}
    />
  );
}
