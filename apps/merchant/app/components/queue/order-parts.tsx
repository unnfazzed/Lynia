"use client";

import { useEffect, useRef, useState } from "react";
import { formatPhoneDisplay, type MerchantOrderResponse } from "@lynia/shared";
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
export function MerchantTrack({ order, v }: { order: MerchantOrderResponse; v: Vocabulary }) {
  const cur = trackStep(order);
  const cash = cashBackRow(order);
  return (
    <>
      <ol className="m-trk" aria-label={`Step ${Math.min(cur + 1, 4)} of 4: ${v.track[Math.min(cur, 3)]}`}>
        {v.track.map((label, k) => {
          const state = k < cur ? "done" : k === cur ? "now" : undefined;
          return (
            <li key={label} data-s={state}>
              {k > 0 && <span className="m-ln" data-on={k <= cur ? "" : undefined} style={{ left: 0, right: "50%" }} />}
              {k < 3 && <span className="m-ln" data-on={k < cur ? "" : undefined} style={{ left: "50%", right: 0 }} />}
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
      {order.items.map((item, i) => (
        <div key={`${item.itemId ?? item.dishId ?? "i"}-${i}`} className="m-ol">
          <b>{item.quantity}×</b>
          <div>
            {item.name}
            {item.note && <q>{item.note}</q>}
          </div>
          <span>{money(item.priceUsd * item.quantity)}</span>
        </div>
      ))}
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

/** Lines the merchant can change: each needs its own id for the edit (older APIs don't send one). */
export function editableLines(order: MerchantOrderResponse) {
  return order.items.filter((i): i is typeof i & { itemId: string } => !!i.itemId);
}

/** "Change items": every line with − qty + (0 removes it); lines the kitchen didn't have show struck
 *  at 0. Saving sends every line's quantity; a refusal (not editable any more, nothing left) shows here.
 *  The customer's number sits here, where the change is agreed with them by phone. */
export function ChangeItemsSheet({
  order,
  busy,
  error,
  onSave,
  onCancel,
}: {
  order: MerchantOrderResponse;
  busy: boolean;
  error: string | null;
  onSave: (lines: { itemId: string; quantity: number }[]) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = useState(() =>
    editableLines(order).map((i) => ({ itemId: i.itemId, name: i.name, gone: i.available === false, quantity: i.available === false ? 0 : i.quantity })),
  );
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const step = (itemId: string, by: number) =>
    setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(0, Math.min(99, l.quantity + by)) } : l)));

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Keep as is" onClick={onCancel} />
        <div className="m-sheet" role="dialog" aria-modal="true" aria-labelledby="m-items-title">
          <div className="m-grab" />
          <b id="m-items-title" style={{ fontSize: 18 }}>
            {OF.changeItems}
          </b>
          <p className="m-sub">Agree it with the customer first. They’ll get the new total.</p>
          <CustomerCall order={order} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lines.map((l) => (
              <div key={l.itemId} className="m-li" style={{ cursor: "default" }}>
                <div className="m-t">
                  <b style={l.gone || l.quantity === 0 ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{l.name}</b>
                </div>
                <button
                  type="button"
                  className="m-gh"
                  aria-label={`One less ${l.name}`}
                  style={{ width: "var(--target-min)", padding: 0, borderRadius: "50%" }}
                  disabled={busy || l.gone || l.quantity === 0}
                  onClick={() => step(l.itemId, -1)}
                >
                  <Icon name="minus" size={18} />
                </button>
                <b className="m-num" style={{ width: 24, textAlign: "center" }} aria-label={`${l.name} quantity`}>
                  {l.quantity}
                </b>
                <button
                  type="button"
                  className="m-gh"
                  aria-label={`One more ${l.name}`}
                  style={{ width: "var(--target-min)", padding: 0, borderRadius: "50%" }}
                  disabled={busy || l.gone || l.quantity >= 99}
                  onClick={() => step(l.itemId, 1)}
                >
                  <Icon name="plus" size={18} />
                </button>
              </div>
            ))}
          </div>
          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button ref={saveRef} type="button" className="m-btn" disabled={busy} onClick={() => onSave(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })))}>
            Save changes
          </button>
          <button type="button" className="m-lnk" onClick={onCancel}>
            Keep as is
          </button>
        </div>
      </div>
    </div>
  );
}

/** The customer's number with a call button — only when the order carries one. */
function CustomerCall({ order }: { order: MerchantOrderResponse }) {
  const phone = order.customerPhone;
  if (!phone) return null;
  const shown = formatPhoneDisplay(phone);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div className="m-av">
        <Icon name="user" size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <b style={{ fontSize: 15 }}>Customer</b>
        <div className="m-hint m-num" style={{ fontSize: 13 }}>
          {shown}
        </div>
      </div>
      <a href={`tel:${phone}`} className="m-gh" aria-label={`Call the customer on ${shown}`} style={{ width: "var(--target-min)", padding: 0, borderRadius: "50%" }}>
        <Icon name="phone" size={18} />
      </a>
    </div>
  );
}
