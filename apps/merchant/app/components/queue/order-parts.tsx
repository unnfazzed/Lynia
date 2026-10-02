"use client";

import type { MerchantOrderResponse } from "@lynia/shared";
import { cashBackRow, money, riderFirstName, trackStep } from "../../lib/orders-view";
import { ORDER_FLOW as OF, type Vocabulary } from "../../lib/vocabulary";
import { Icon } from "../icons";

/**
 * Order flow v2's merchant parts (packages/design/handoff/order-flow-v2, of-screens-mrg.js, ledger D-59):
 * the customer's four-step track with the merchant-only "Cash back to you" row (README "Merchant
 * track"), the priced order lines (`mline`), the rider row (`riderRow`) and the "Change items" sheet.
 */

/** README "Merchant track": the customer's four steps, then "Cash back to you" when the rider brings
 *  the money back. Replaces B6's eight-step stepper. */
export function MerchantTrack({ order, v, cashRow = true }: { order: MerchantOrderResponse; v: Vocabulary; cashRow?: boolean }) {
  const cur = trackStep(order);
  // M3 draws the bare track; M5/M6 add the cash row (of-screens-mrg `track` vs `mtrack`).
  const cash = cashRow ? cashBackRow(order) : null;
  return (
    <>
      <ol className="m-trk" aria-label={`Step ${Math.min(cur + 1, 4)} of 4: ${v.track[Math.min(cur, 3)]}`}>
        {v.track.map((label, k) => {
          const state = k < cur ? "done" : k === cur ? "now" : undefined;
          return (
            <li key={label} data-s={state}>
              {/* One connector per gap, centre to centre; the next step's circle paints over its end. */}
              {k < 3 && <span className="m-ln" data-on={k < cur ? "" : undefined} style={{ left: "50%", width: "100%" }} />}
              <span className="m-c">{state === "done" ? <Icon name="check" size={13} /> : k + 1}</span>
              <span className="m-l">{label}</span>
            </li>
          );
        })}
      </ol>
      {cash && cash.state !== "done" && (
        <div className="m-cashrow" data-due={cash.state === "due" ? "" : undefined}>
          <Icon name="banknote" size={18} />
          <b>{OF.cashStep}</b>
          <span>{cash.state === "due" ? (cash.dueAt ? OF.cashDueAt(cash.dueAt) : "") : OF.cashAfter}</span>
        </div>
      )}
    </>
  );
}

/** The order's lines with their prices; the customer's note sits under its line in a highlight wash. */
export function OrderLines({ order }: { order: MerchantOrderResponse }) {
  return (
    <div>
      {order.items.map((item, i) => {
        // A line taken off (out of stock, a removal, a declined swap) stays in view, struck through.
        const off = item.available === false;
        return (
          <div key={`${item.itemId ?? item.dishId ?? "i"}-${i}`} className="m-ol">
            <b>{item.quantity}×</b>
            <div>
              <span style={off ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{item.name}</span>
              {item.note && <q>{item.note}</q>}
            </div>
            <span style={off ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{money(item.priceUsd * item.quantity)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** "TM" for Tendai Moyo. */
function initials(r: NonNullable<MerchantOrderResponse["rider"]>): string {
  return `${r.firstName.charAt(0)}${r.lastName.charAt(0)}`.toUpperCase();
}

/** `riderRow`: the 52px ringed avatar, the name, then plate and rating. The order carries no rider
 *  number for the merchant, so the drawn call button is left out (not drawn ⇒ not faked). */
export function RiderRow({ order }: { order: MerchantOrderResponse }) {
  const r = order.rider!;
  const name = riderFirstName(order) ?? r.firstName;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="m-av m-av-ring">{initials(r)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 15, display: "block" }}>{name}</b>
        <div className="m-hint" style={{ fontSize: 13 }}>
          {[r.plate, r.ratingCount > 0 ? `★ ${r.ratingAvg.toFixed(1)}` : null].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

