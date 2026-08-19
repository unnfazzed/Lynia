"use client";

import { useEffect, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { HANDOVER_CONFIRM_MS } from "../../lib/handover-watch";
import { formatMoney } from "../../lib/money-input";
import { Icon } from "../icons";
import { cardStyle, ghostButtonStyle } from "./styles";

/**
 * M3·3 `pickup_done` (r-merchant.jsx:722-735) — "LG-4471 handed over", the money line, and the
 * auto-return to the board. Only ever rendered for an order the server has confirmed reached a
 * post-pickup status (see `lib/handover-watch.ts`), so nothing on it is a guess.
 *
 * Two things the kit's line says that this app cannot: the rider's NAME and the delivery AREA.
 * `MerchantOrderResponse` carries `riderId` (a uuid) and no destination at all, and there is no
 * merchant-side endpoint that resolves either. Rather than invent them, the rider is referred to as
 * "the rider" and the destination is left out.
 */
function orderLabel(o: MerchantOrderResponse): string {
  return `#${o.id.slice(0, 8).toUpperCase()}`;
}

function atTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The money half of the kit's "$13.00 cash received at 10:04" — built only out of fields the order
 * actually carries.
 *
 * - **Collect-and-return** is the one branch with a true hand-over timestamp: `debtOpenedAt` is
 *   written inside the same transaction as the pickup (food-order.service.ts `confirmPickup` →
 *   `openDebtIfNeeded`), so it IS the moment the food left the counter.
 * - **Pay-me-upfront cash** settles in the rider's hand with nothing recorded digitally (a C4 scope
 *   cut), so no time is claimed for it — only the rule, which is real.
 * - **Wallet** was paid before cooking; its timestamp is labelled as the payment, not the hand-over.
 */
function moneyLine(order: MerchantOrderResponse): string {
  const goods = Number(order.merchantGoodsTotal ?? 0);
  const amount = `$${formatMoney(goods)}`;

  if (order.debtStatus === "open") {
    const debt = `$${formatMoney(Number(order.debtAmount ?? goods))}`;
    const at = atTime(order.debtOpenedAt);
    return `${debt} is owed back to you${at ? ` since ${at}` : ""} — count it here when the rider returns.`;
  }
  if (order.paymentMethod === "cash" && order.merchantCashRule === "pay_upfront") {
    return `${amount} cash — your rule is pay-me-upfront, so the rider settled at your counter.`;
  }
  if (order.merchantPaymentConfirmedAt) {
    const at = atTime(order.merchantPaymentConfirmedAt);
    return `${amount} already paid${at ? ` — you confirmed it at ${at}` : ""}.`;
  }
  return `${amount} for this order.`;
}

export function PickupDoneTakeover({ order, onDismiss }: { order: MerchantOrderResponse; onDismiss: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.round(HANDOVER_CONFIRM_MS / 1000));

  useEffect(() => {
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--surface)", zIndex: 56, display: "grid", placeItems: "center", padding: 24, overflow: "auto" }}>
      <div style={{ ...cardStyle, padding: "clamp(20px, 6vw, 30px)", textAlign: "center", maxWidth: 560, width: "100%" }} role="status" aria-live="polite">
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
          <Icon name="circle-check" size={34} color="var(--accent-text)" />
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{orderLabel(order)} handed over</div>
        <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
          {moneyLine(order)} The rider is on the way to the customer.
        </div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 16 }}>Back to orders in {secondsLeft}s</div>
        <button type="button" onClick={onDismiss} style={{ ...ghostButtonStyle, marginTop: 12 }}>
          Back to orders now
        </button>
      </div>
    </div>
  );
}
