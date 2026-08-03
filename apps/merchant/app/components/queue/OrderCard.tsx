"use client";

import { useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { formatMoney } from "../../lib/money-input";
import { isNoRiderHold, isRiderSecured, isSearchingForRider } from "../../lib/order-groups";
import { useNow } from "../../lib/use-now";
import { PaymentConfirmSheet, RefundSheet } from "./PaymentConfirmSheet";
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

/** D-06/D-08: what to expect when the rider is at the counter — informational only. The actual
 *  hand-off mechanic is the rider entering the pickup code (N-16); CASH money never needs a merchant
 *  button here because collect-and-return opens the debt automatically at that moment (R-01) and
 *  pay-me-upfront settles in the rider's hand with nothing left to confirm digitally (C4 scope cut). */
function CashRuleNote({ order }: { order: MerchantOrderResponse }) {
  if (order.paymentMethod !== "cash") return null;
  const amount = Number(order.merchantGoodsTotal ?? 0);
  const upfront = order.merchantCashRule === "pay_upfront";
  return (
    <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
      {upfront
        ? `Rider pays you $${formatMoney(amount)} cash before you hand over the food.`
        : `Release unpaid — the rider owes you $${formatMoney(amount)} back after the drop.`}
    </div>
  );
}

export function OrderCard({
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
  const now = useNow();
  const items = order.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ");
  const canRefund = order.paymentMethod === "wallet" && !!order.merchantPaymentConfirmedAt;

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{orderLabel(order)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{order.paymentMethod === "wallet" ? "WALLET" : "CASH"}</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{items || "—"}</div>

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
              {pickupCode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--accent-wash)", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-text)" }}>PICKUP CODE</span>
                  <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: ".06em" }}>{pickupCode}</span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleRevealClick()}
                    disabled={disabled || revealAction.busy}
                    style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", ...disabledStyle(disabled || revealAction.busy) }}
                  >
                    {revealAction.busy ? "Loading…" : "Show pickup code"}
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
