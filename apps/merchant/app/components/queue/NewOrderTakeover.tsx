"use client";

import { useEffect, useRef, useState } from "react";
import { PREP_CHIPS_MIN, type MerchantOrderResponse, type MerchantRejectionReasonCode, type SubstitutionProposalLine } from "@lynia/shared";
import type { MerchantShopKind } from "@lynia/shared";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { orderLabel, slotLabel } from "../../lib/orders-view";
import { changeableLines, proposalLines } from "../../lib/substitution";
import { useNow } from "../../lib/use-now";
import { countOf, ORDER_FLOW as OF, vocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";
import { ConfirmSheet } from "../m/ConfirmSheet";
import { useToast } from "../m/Toast";
import { ProposerLines, ProposerTotal, SwapPicker, useProposer } from "./proposer";
import { Note } from "./proof-parts";

type Prep = (typeof PREP_CHIPS_MIN)[number];

/**
 * A new order ringing (merchant-mobile B2, ledger D-48), as Order flow v2 draws it (of-screens-mrg.js
 * `U1a`, `M1c`; ledger D-59): the green takeover with a white strip — "NEW ORDER" (or "SCHEDULED · START
 * NOW" for a scheduled order at its start time), the number and the accept countdown — over the white
 * sheet. The sheet is the proposer: "{n} items · Tap an item you can't supply", every line tappable into
 * "Remove it" / "Swap for…" (only "Remove it" when the customer chose "Remove it" for missing items), the
 * total ("$14.60 → $11.60" once something changed), the ready-in chips, then "Accept · ready in 15 min"
 * — or "Send 2 changes to customer", which accepts with the changes and gives the customer 3 minutes to
 * answer the swaps. "Can't take it" sits behind the confirm sheet. The alarm rings until one of them is
 * answered: there is no back out of it (README "Ringing").
 */
export function NewOrderTakeover({
  active,
  disabled,
  onAccept,
  onPropose,
  onReject,
  refetch,
}: {
  active: MerchantOrderResponse;
  queued?: readonly MerchantOrderResponse[];
  disabled: boolean;
  onAccept: (orderId: string, prepMinutes: Prep, unavailableDishIds: string[]) => Promise<void>;
  onPropose?: (orderId: string, prepMinutes: Prep, lines: SubstitutionProposalLine[]) => Promise<void>;
  onReject: (orderId: string, reason: MerchantRejectionReasonCode) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const now = useNow();
  const toast = useToast();
  // The order's own venue speaks its words (Cooking / Packing); a restaurant's by default.
  const v = vocabulary(active.venue?.businessType, active.venue?.shopKind as MerchantShopKind | null | undefined);
  const p = useProposer(active);
  const [prepMinutes, setPrepMinutes] = useState<Prep>(15);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous double-submit guard: two taps in one tick both read `submitting` as false. Order
  // assignment is a sensitive lane, so a fast double-tap must never double-accept or double-reject.
  const submittingRef = useRef(false);

  const remainingMs = msUntil(active.acceptDeadlineAt, now);
  const scheduled = active.scheduledFor ? slotLabel(active.scheduledFor, new Date(now)) : null;
  const making = v.making.toLowerCase();

  // Back is blocked here: the alarm must be answered (README "Ringing").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !p.picking) toast("Accept or decline to stop the alarm");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast, p.picking]);

  // A refusal here (usually a 409: the order already resolved) refetches, so a stale takeover clears
  // itself as soon as the fresh queue lands instead of waiting for the next poll.
  async function run(action: () => Promise<void>, done: string, failed: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await action();
      toast(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : failed);
      setConfirmDecline(false);
      await refetch().catch(() => {});
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const lines = proposalLines(active, p.changes);
  const accept = () =>
    lines.length > 0 && onPropose
      ? run(() => onPropose(active.id, prepMinutes, lines), "Changes sent · the customer has 3 minutes", "Couldn't send the changes. Try again.")
      : run(() => onAccept(active.id, prepMinutes, []), `Accepted · customer told ${prepMinutes} min`, "Couldn't accept the order. Try again.");
  const decline = () => run(() => onReject(active.id, "other"), "Declined · the customer was told", "Couldn't decline the order. Try again.");

  const busy = disabled || submitting;
  const changing = lines.length > 0 && !!onPropose;
  const acceptLabel = changing ? OF.mSend(lines.length) : `Accept · ready in ${prepMinutes} min`; // O.m.accept

  return (
    <div className="m-overlay" style={{ zIndex: 60 }}>
      <div className="m-overlay-frame" style={{ background: "var(--cta-fill)", display: "flex", flexDirection: "column" }} role="alertdialog" aria-label={`New order ${orderLabel(active)}`}>
        <div
          style={{
            margin: "calc(6px + env(safe-area-inset-top)) 12px 14px",
            background: "var(--bg)",
            borderRadius: 16,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="volume-2" size={22} color="var(--accent-text)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-cap" style={{ color: "var(--accent-text)" }}>
              {scheduled ? OF.scheduled : OF.newOrder}
            </div>
            <b style={{ fontSize: 17 }}>{orderLabel(active)}</b>
          </div>
          <b className="m-num" style={{ fontSize: 28 }} aria-label="Time left to accept">
            {formatCountdown(remainingMs)}
          </b>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            background: "var(--bg)",
            borderRadius: "20px 20px 0 0",
            padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {scheduled && (
            <Note icon="calendar" title={OF.schedT(`${scheduled.slot} ${scheduled.day}`)}>
              <br />
              {OF.schedNow}
            </Note>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <b style={{ fontSize: 15 }}>{countOf(changeableLines(active).length, v)}</b>
            <span className="m-hint" style={{ fontSize: 13 }}>
              {OF.mHint}
            </span>
          </div>
          <ProposerLines order={active} p={p} disabled={busy} />
          {active.note && (
            <div style={{ fontSize: 13, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 10, padding: "8px 10px" }}>“{active.note}”</div>
          )}
          <ProposerTotal p={p} fallback={active.merchantGoodsTotal ?? p.totals.was} />

          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>READY IN (MIN)</div>
          <div className="m-chips" style={{ gap: 6 }} role="radiogroup" aria-label="Ready in">
            {PREP_CHIPS_MIN.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={prepMinutes === m}
                className={`m-chip${prepMinutes === m ? " m-on" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: 0 }}
                onClick={() => setPrepMinutes(m)}
              >
                {m}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button type="button" className="m-btn" disabled={busy} onClick={() => void accept()}>
            {acceptLabel}
          </button>
          {changing && (
            <span className="m-hint" style={{ textAlign: "center", fontSize: 13 }}>
              {OF.mSendHint(making)}
            </span>
          )}
          <button type="button" className="m-lnk m-red" style={{ minHeight: "var(--target-min)", fontSize: 14 }} disabled={busy} onClick={() => setConfirmDecline(true)}>
            {OF.decline}
          </button>
        </div>
      </div>

      {p.picking && <SwapPicker item={p.picking} onPick={(c) => p.set(p.picking!.itemId, c)} onCancel={() => p.setPicking(null)} />}
      {confirmDecline && (
        <ConfirmSheet
          title="Decline this order?"
          body="The customer is told straight away."
          confirmLabel="Decline order"
          busy={submitting}
          onConfirm={() => void decline()}
          onCancel={() => setConfirmDecline(false)}
        />
      )}
    </div>
  );
}

