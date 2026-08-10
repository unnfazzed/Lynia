"use client";

import { memo, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { formatMoney } from "../../lib/money-input";
import { isNoRiderHold, isRiderSecured, isSearchingForRider } from "../../lib/order-groups";
import { Icon } from "../icons";
import { useNow } from "../../lib/use-now";
import { PaymentConfirmSheet, RefundSheet } from "./PaymentConfirmSheet";
import { PayTag } from "./PayTag";
import { isRiderLate, RiderNoShowSheet } from "./RiderNoShowSheet";
import { cardStyle, dangerGhostButtonStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "./styles";

function orderLabel(o: MerchantOrderResponse): string {
  return `#${o.id.slice(0, 8).toUpperCase()}`;
}

/** RF-16: the busy+error try/catch/finally wrapper repeated across this file's action buttons,
 *  collapsed into one hook. `run` takes the thunk at call time (not bind time) so one hook
 *  instance can back several distinct buttons sharing a single busy/error pair, exactly as the
 *  pre-extraction code did in `PaymentBucketActions`. The `{ ok, value }` result lets a caller
 *  run its own success-only side effect (closing a sheet, storing a returned value) without
 *  duplicating the try/catch itself. */
function useAsyncAction(fallbackMessage = "Something went wrong — try again.") {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<R>(action: () => Promise<R>): Promise<{ ok: true; value: R } | { ok: false }> {
    setBusy(true);
    setError(null);
    try {
      const value = await action();
      return { ok: true, value };
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}

export type OrderCardBucket = "waiting" | "payment" | "preparing" | "ready";

/**
 * E3 (R-16/R-17): the awaiting-payment lane's real flow — log the call, request payment, confirm it
 * landed against the merchant's own statement (D-06), or release with no penalty. No clock (M2·7
 * never blocks the board) — this only ever renders as an ordinary card, never a takeover.
 */
function PaymentBucketActions({
  order,
  disabled,
  onLogCall,
  onRequestPayment,
  onConfirmPayment,
  onReleaseUnpaid,
}: {
  order: MerchantOrderResponse;
  disabled: boolean;
  onLogCall: (orderId: string) => Promise<void>;
  onRequestPayment: (orderId: string, overrideCallLog: boolean) => Promise<void>;
  onConfirmPayment: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
  onReleaseUnpaid: (orderId: string) => Promise<void>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { busy, error, setError, run: runVoid } = useAsyncAction();
  const run = (action: () => Promise<void>) => runVoid(action);

  // D-06/mismatch: on a rejection this leaves the sheet open (result.ok stays false) so the
  // server's "expected $X, got $Y" message is visible.
  async function submitConfirm(body: { reference: string; amount: number }) {
    const result = await runVoid(() => onConfirmPayment(order.id, body));
    if (result.ok) setShowConfirm(false);
  }

  const expected = Number(order.merchantGoodsTotal ?? 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {error && <div style={{ fontSize: 12, color: "var(--danger-ink)", fontWeight: 700 }}>{error}</div>}

      {!order.paymentRequestedAt && (
        <>
          {!order.paymentCallLoggedAt ? (
            <>
              <button
                type="button"
                onClick={() => void run(() => onLogCall(order.id))}
                disabled={disabled || busy}
                style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13, ...disabledStyle(disabled || busy) }}
              >
                Log the call
              </button>
              <button
                type="button"
                onClick={() => void run(() => onRequestPayment(order.id, true))}
                disabled={disabled || busy}
                style={{ ...ghostButtonStyle, padding: "7px 12px", fontSize: 12, ...disabledStyle(disabled || busy) }}
              >
                They confirmed another way
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void run(() => onRequestPayment(order.id, false))}
              disabled={disabled || busy}
              style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13, ...disabledStyle(disabled || busy) }}
            >
              Request payment · ${formatMoney(expected)}
            </button>
          )}
        </>
      )}

      {order.paymentRequestedAt && (
        <>
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={disabled || busy}
            style={{ ...primaryButtonStyle, padding: "9px 14px", fontSize: 13, ...disabledStyle(disabled || busy) }}
          >
            It landed — enter the reference
          </button>
          <button
            type="button"
            onClick={() => void run(() => onReleaseUnpaid(order.id))}
            disabled={disabled || busy}
            style={{ ...dangerGhostButtonStyle, padding: "7px 12px", fontSize: 12, ...disabledStyle(disabled || busy) }}
          >
            Release — they never paid
          </button>
        </>
      )}

      {showConfirm && (
        <PaymentConfirmSheet
          orderLabel={orderLabel(order)}
          expectedAmount={expected}
          disabled={disabled}
          submitting={busy}
          error={error}
          onCancel={() => {
            setShowConfirm(false);
            setError(null);
          }}
          onConfirm={(body) => void submitConfirm(body)}
        />
      )}
    </div>
  );
}

/** D-12: the merchant cannot cancel an already-confirmed WALLET order without a refund reference and
 *  the exact amount first — offered alongside "Mark ready" while the order is still in prep. */
function RefundAction({
  order,
  disabled,
  onRefund,
}: {
  order: MerchantOrderResponse;
  disabled: boolean;
  onRefund: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
}) {
  const [show, setShow] = useState(false);
  const { busy, error, setError, run } = useAsyncAction("Something went wrong");
  const expected = Number(order.merchantGoodsTotal ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setShow(true)}
        disabled={disabled}
        style={{ ...dangerGhostButtonStyle, padding: "7px 12px", fontSize: 12, ...disabledStyle(disabled) }}
      >
        Can&apos;t fulfill — refund &amp; cancel
      </button>
      {show && (
        <RefundSheet
          orderLabel={orderLabel(order)}
          expectedAmount={expected}
          disabled={disabled}
          submitting={busy}
          error={error}
          onCancel={() => {
            setShow(false);
            setError(null);
          }}
          onConfirm={(body) =>
            void run(() => onRefund(order.id, body)).then((result) => {
              if (result.ok) setShow(false);
            })
          }
        />
      )}
    </>
  );
}

/** D-06/D-08: what to expect when the rider is at the counter. The `collect_and_return` rule is
 *  informational (the debt opens automatically when the rider enters the pickup code, R-01). The
 *  `pay_upfront` rule is NOT just a note — the rider hands physical cash across the counter — so it
 *  gets the kit's count-and-acknowledge hero (`CashPickupHero`) that gates the code reveal, not a
 *  caption. This note therefore renders for `collect_and_return` only. */
function CashRuleNote({ order }: { order: MerchantOrderResponse }) {
  if (order.paymentMethod !== "cash" || order.merchantCashRule === "pay_upfront") return null;
  const amount = Number(order.merchantGoodsTotal ?? 0);
  return (
    <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
      {`Release unpaid — the rider owes you $${formatMoney(amount)} back after the drop.`}
    </div>
  );
}

/** M3·1 `pickup_cash` — the kit's count-and-acknowledge hero for a pay-upfront CASH order: the rider
 *  hands physical cash across the counter, so "the number is the screen; confirming means
 *  acknowledging it" (r-merchant.jsx:606-623). The ticked box gates the pickup-code reveal below —
 *  that reveal is the release mechanic, so an un-counted order literally cannot be handed over. The
 *  escape is a danger-ink instruction rather than a link: there is no short-cash endpoint, and the
 *  gate itself (don't tick → code stays hidden → food not released) is the real enforcement. */
function CashPickupHero({ amount, counted, onToggle }: { amount: number; counted: boolean; onToggle: () => void }) {
  const amountText = formatMoney(amount);
  return (
    <div style={{ textAlign: "center", padding: "6px 2px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)", letterSpacing: ".04em" }}>COUNT WHAT THE RIDER HANDS YOU</div>
      <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.05, margin: "4px 0 2px", fontVariantNumeric: "tabular-nums" }}>${amountText}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginBottom: 12 }}>
        Food only — not the delivery fee, which the customer pays the rider at the door.
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={counted}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          border: `2px solid ${counted ? "var(--accent)" : "var(--line)"}`,
          background: counted ? "var(--accent-wash)" : "#fff",
          borderRadius: 12,
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            border: `2px solid ${counted ? "var(--accent)" : "var(--line)"}`,
            background: counted ? "var(--accent)" : "#fff",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          {counted && <Icon name="check" size={15} color="#fff" />}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>I counted ${amountText} in my hand</span>
      </button>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
        Short or no cash?{" "}
        <span style={{ color: "var(--danger-ink)", fontWeight: 700 }}>Don&apos;t tick the box — hold the food and don&apos;t show the code.</span>
      </div>
    </div>
  );
}

function OrderCardImpl({
  order,
  bucket,
  disabled,
  onMarkReady,
  onRevealPickupCode,
  onOpenHold,
  onLogCall,
  onRequestPayment,
  onConfirmPayment,
  onReleaseUnpaid,
  onRefund,
}: {
  order: MerchantOrderResponse;
  bucket: OrderCardBucket;
  disabled: boolean;
  onMarkReady: (orderId: string) => Promise<void>;
  onRevealPickupCode: (orderId: string) => Promise<string>;
  onOpenHold: (order: MerchantOrderResponse) => void;
  onLogCall: (orderId: string) => Promise<void>;
  onRequestPayment: (orderId: string, overrideCallLog: boolean) => Promise<void>;
  onConfirmPayment: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
  onReleaseUnpaid: (orderId: string) => Promise<void>;
  onRefund: (orderId: string, body: { reference: string; amount: number }) => Promise<void>;
}) {
  // B-O16: only the waiting/preparing branches below read `now` — a payment/ready-bucket card
  // (which can sit mounted for minutes) has no reason to tick once/sec.
  const needsClock = bucket === "waiting" || bucket === "preparing";
  const now = useNow(1000, needsClock);
  // M3·b2 only needs to know whether the wait has crossed a 12-minute line — a separate, much slower
  // tick keeps the ready card off the once/sec clock B-O16 deliberately took it off.
  const readyNow = useNow(30_000, bucket === "ready");
  const items = order.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ");
  const canRefund = order.paymentMethod === "wallet" && !!order.merchantPaymentConfirmedAt;
  const [showNoShow, setShowNoShow] = useState(false);
  // M3·1: a pay-upfront CASH order needs the cash counted before the code (= the food) is released.
  const payUpfrontCash = order.paymentMethod === "cash" && order.merchantCashRule === "pay_upfront";
  const [cashCounted, setCashCounted] = useState(false);

  // LC-D03: mark-ready and pickup-code reveal each own per-order busy+error state instead of
  // firing as a bare `void` promise that swallows a network failure silently.
  const markReadyAction = useAsyncAction();
  async function handleMarkReadyClick() {
    await markReadyAction.run(() => onMarkReady(order.id));
  }

  const [pickupCode, setPickupCode] = useState<string | undefined>(undefined);
  const revealAction = useAsyncAction();
  async function handleRevealClick() {
    const result = await revealAction.run(() => onRevealPickupCode(order.id));
    if (result.ok) setPickupCode(result.value);
  }

  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Kit's BoardCard heads every card with the id and the PayTag pill (r-merchant.jsx:63-68). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{orderLabel(order)}</div>
        <PayTag pay={order.paymentMethod} />
      </div>
      <div style={{ fontSize: 13.5, color: "var(--muted)" }}>{items || "—"}</div>

      {bucket === "waiting" && (
        <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 10, padding: "8px 10px" }}>
          Waiting for the customer to approve the shorter order · {formatCountdown(msUntil(order.itemApprovalDeadlineAt, now))}
        </div>
      )}

      {bucket === "payment" && (
        <PaymentBucketActions
          order={order}
          disabled={disabled}
          onLogCall={onLogCall}
          onRequestPayment={onRequestPayment}
          onConfirmPayment={onConfirmPayment}
          onReleaseUnpaid={onReleaseUnpaid}
        />
      )}

      {bucket === "preparing" && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>
            {order.prepMinutes != null && order.prepStartedAt
              ? `${formatCountdown(Math.max(0, order.prepMinutes * 60_000 - (now - new Date(order.prepStartedAt).getTime())))} prep left`
              : "In prep"}
          </div>
          <button
            type="button"
            onClick={() => void handleMarkReadyClick()}
            disabled={disabled || markReadyAction.busy}
            style={{ ...primaryButtonStyle, padding: "10px 16px", fontSize: 14, ...disabledStyle(disabled || markReadyAction.busy) }}
          >
            {markReadyAction.busy ? "Marking ready…" : "Mark ready"}
          </button>
          {markReadyAction.error && <div style={{ fontSize: 12, color: "var(--danger-ink)", fontWeight: 700 }}>{markReadyAction.error}</div>}
          {canRefund && <RefundAction order={order} disabled={disabled} onRefund={onRefund} />}
        </>
      )}

      {bucket === "ready" && (
        <>
          <CashRuleNote order={order} />
          {isSearchingForRider(order) && (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Searching for a rider…</div>
          )}
          {isNoRiderHold(order) && (
            <button
              type="button"
              onClick={() => onOpenHold(order)}
              style={{ fontSize: 12.5, fontWeight: 800, color: "var(--highlight-ink)", background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}
            >
              No rider yet — tap to decide
            </button>
          )}
          {isRiderSecured(order) && !isNoRiderHold(order) && (
            <>
              <div style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>Rider on the way</div>
              {/* M3·b2's way in. Always available (a rider can be late in ways the board can't see),
               *  but only shouts once the wait has actually gone long. */}
              <button
                type="button"
                onClick={() => setShowNoShow(true)}
                style={
                  isRiderLate(order, readyNow)
                    ? {
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: "var(--highlight-ink)",
                        background: "var(--highlight-wash)",
                        border: "1px solid var(--highlight-border)",
                        borderRadius: 10,
                        padding: "8px 10px",
                        cursor: "pointer",
                        textAlign: "left",
                      }
                    : {
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--muted)",
                        background: "none",
                        border: "none",
                        padding: "2px 0",
                        cursor: "pointer",
                        textAlign: "left",
                        textDecoration: "underline",
                      }
                }
              >
                {isRiderLate(order, readyNow) ? "The rider hasn't arrived — what now?" : "Rider hasn't arrived?"}
              </button>
              {showNoShow && <RiderNoShowSheet order={order} onClose={() => setShowNoShow(false)} />}
              {pickupCode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--accent-wash)", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-text)" }}>PICKUP CODE</span>
                  <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: ".06em" }}>{pickupCode}</span>
                </div>
              ) : (
                <>
                  {/* Pay-upfront CASH: count-and-acknowledge the cash BEFORE the reveal (= releasing the
                      food). The reveal stays disabled until the box is ticked. */}
                  {payUpfrontCash && (
                    <CashPickupHero amount={Number(order.merchantGoodsTotal ?? 0)} counted={cashCounted} onToggle={() => setCashCounted((v) => !v)} />
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRevealClick()}
                    disabled={disabled || revealAction.busy || (payUpfrontCash && !cashCounted)}
                    style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", ...disabledStyle(disabled || revealAction.busy || (payUpfrontCash && !cashCounted)) }}
                  >
                    {revealAction.busy ? "Loading…" : payUpfrontCash ? "Show pickup code · release the food" : "Show pickup code"}
                  </button>
                  {revealAction.error && <div style={{ fontSize: 12, color: "var(--danger-ink)", fontWeight: 700 }}>{revealAction.error}</div>}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// B-O17: no memo boundary meant every mounted card re-rendered in lockstep on the board's 5s poll
// tick (`use-queue-poll.ts`) regardless of whether ITS OWN order data changed — QueueBoard now
// pairs this with structural-sharing in `mergeOrders` (an unchanged order keeps its previous object
// reference across a poll) and stable action-handler references, so an order whose data didn't
// change in a given poll now genuinely skips re-rendering its card.
export const OrderCard = memo(OrderCardImpl);
