"use client";

/**
 * Delivery ceiling v1 (ledger D-125, `packages/design/handoff/delivery-ceiling-v1/`), merchant side:
 * - M4h — the gold hold card: "No biker yet", the offer bikers see, three top-up buttons (+$0.50 / +$1 / +$2, each
 *   showing the offer it creates), Keep searching, the "we'll ask {c} to raise in 1:42" line and Cancel order.
 * - M4h-sent — after a top-up, the mint "Finding a biker" card: "Offered $4.00 · includes your $1.00".
 * Strings are `DCM` (the handoff's `DC.m`, rider → biker).
 */
import type { DeliveryTopUpView } from "@lynia/shared";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { DCM, fill } from "../../lib/delivery-ceiling-copy";

const usd = (n: number) => `$${n.toFixed(2)}`;
/** The button labels are the handoff's ("+$1"); the offer under each is exact. */
const LABEL: Record<string, string> = { "0.5": DCM.topUps[0], "1": DCM.topUps[1], "2": DCM.topUps[2] };

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function TopUpHold({
  view,
  customer,
  disabled,
  onTopUp,
  onKeep,
  onCancel,
}: {
  view: DeliveryTopUpView;
  /** The customer's first name ("Rudo"), or "the customer". */
  customer: string;
  disabled: boolean;
  onTopUp: (amount: number) => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  const now = useNow(view.askCustomerAt != null);
  const askLeft = view.askCustomerAt ? msUntil(view.askCustomerAt, now) : null;
  const choices = [0.5, 1, 2];
  return (
    <div className="m-card m-hold" role="group" aria-label={DCM.holdT}>
      <div className="m-hold-head">
        <i className="m-hold-disc" aria-hidden="true">
          <Icon name="bike" size={20} />
        </i>
        <div>
          <b className="m-hold-t">{DCM.holdT}</b>
          <span className="m-hold-sub m-num">{fill(DCM.holdSub, { o: usd(view.offer) })}</span>
        </div>
      </div>
      <div>
        <b className="m-hold-top">{DCM.topT}</b>
        <span className="m-hint">{fill(DCM.topSub, { c: customer })}</span>
      </div>
      <div className="m-topups">
        {choices.map((t) => {
          const allowed = view.choices.includes(t);
          return (
            <button
              key={t}
              type="button"
              className="m-topup"
              disabled={disabled || !allowed}
              aria-label={fill(DCM.topAria, { t: usd(t) })}
              onClick={() => onTopUp(t)}
            >
              <b className="m-num">{LABEL[String(t)]}</b>
              <span className="m-num">{fill(DCM.topOffer, { o: usd(view.offer + t) })}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="m-hold-keep" disabled={disabled} onClick={onKeep}>
        {DCM.keep}
      </button>
      {askLeft !== null && askLeft > 0 ? (
        <span className="m-hold-ask m-num">
          <Icon name="clock" size={16} />
          {fill(DCM.askIn, { c: customer, t: formatCountdown(askLeft) })}
        </span>
      ) : null}
      <button type="button" className="m-lnk m-hold-cancel" disabled={disabled} onClick={onCancel}>
        {DCM.cancel}
      </button>
    </div>
  );
}

/** M4h-sent: searching again after a top-up. */
export function TopUpFinding({ view }: { view: DeliveryTopUpView }) {
  return (
    <div className="m-card m-finding" role="status">
      <i className="m-finding-disc" aria-hidden="true">
        <span className="m-wspin" />
      </i>
      <div>
        <b className="m-hold-t">{DCM.finding}</b>
        <span className="m-finding-sub m-num">{fill(DCM.offered, { o: usd(view.offer), t: usd(view.topUp) })}</span>
      </div>
    </div>
  );
}
