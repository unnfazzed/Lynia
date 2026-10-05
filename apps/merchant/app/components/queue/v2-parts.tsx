"use client";

import type { MerchantOrderResponse } from "@lynia/shared";
import { hm, money, riderFirstName } from "../../lib/orders-view";
import { Icon } from "../icons";

/**
 * Merchant v2's shared ticket parts (packages/design/handoff/merchant-v2 README "Components", ledger
 * D-77): the five-step progress, the rider card, the six-digit code card, the cash card and the pinned
 * CTA bar. Kitchen, shop and pharmacy tickets all draw with these.
 */

/** The one lifecycle every order goes through (BRIEF §2). */
export const LIFECYCLE = ["Accept", "Cook", "Hand over", "On the way", "Cash back"] as const;

/** 5 segments, 4 tall, 4 apart; done = accent. With a label: "Step 2 of 5 · Cooking". */
export function ProgressSteps({ step, label, failed = false }: { step: number; label?: string; failed?: boolean }) {
  // K5c (D-77 follow-ups): a failed delivery draws its step in --danger and leaves the last one empty.
  return (
    <div className="m-psteps">
      <div className="m-steps" aria-hidden={label ? "true" : undefined} aria-label={label ? undefined : failed ? `Step ${step} of 5 failed` : `${step} of 5 steps`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={failed && i === step - 1 ? "m-fail" : i < step ? "m-on" : undefined} />
        ))}
      </div>
      {label && (
        <span>
          Step {step} of 5 · <b>{label}</b>
        </span>
      )}
    </div>
  );
}

/** "BM" for Blessing Moyo. */
function initials(r: NonNullable<MerchantOrderResponse["rider"]>): string {
  return `${r.firstName.charAt(0)}${r.lastName.charAt(0)}`.toUpperCase();
}

/** K4/S3's rider card: the 48 mint disc, the name, plate and rating, and a 44 call button. */
export function RiderCard({ order, sub }: { order: MerchantOrderResponse; sub?: string }) {
  const r = order.rider!;
  const name = riderFirstName(order) ?? r.firstName;
  // A1: "at your counter" once here, "arrives 07:31" before (A2: nothing when there's no estimate).
  const here = order.riderArrivedAt ? "at your counter" : order.riderEtaAt ? `arrives ${hm(order.riderEtaAt)}` : null;
  const line = sub ?? [r.plate, r.ratingCount > 0 ? `★ ${r.ratingAvg.toFixed(1)}` : null, here].filter(Boolean).join(" · ");
  return (
    <div className="m-rcard">
      <span className="m-rav">{initials(r)}</span>
      <div>
        <b>{name}</b>
        {line && <span data-here={(!sub && !!order.riderArrivedAt) || undefined}>{line}</span>}
      </div>
      {order.riderPhone && (
        <a href={`tel:${order.riderPhone}`} className="m-call" aria-label={`Call ${name}`}>
          <Icon name="phone" size={16} />
        </a>
      )}
    </div>
  );
}

/** "720 518" — every code is six digits shown 3+3. */
export function codeText(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** K4's code card: "SAY THIS CODE TO BLESSING", then the code at 48/700. */
export function CodeCard({ rider, code }: { rider: string; code: string | null }) {
  return (
    <div className="m-saycode">
      <span>SAY THIS CODE TO {rider.toUpperCase()}</span>
      {code ? (
        <b className="m-num" aria-label={`Pickup code ${code.split("").join(" ")}`}>
          {codeText(code)}
        </b>
      ) : (
        <b className="m-num" aria-hidden="true">
          ··· ···
        </b>
      )}
    </div>
  );
}

/** K5's cash card: what comes back (food only), the delivery that's the rider's, and when it's due. A shop's line reads "Goods". */
export function CashCard({ amount, food, delivery, line, foodLabel = "Food" }: { amount: number; food: number; delivery: number | null; line: string; foodLabel?: string }) {
  return (
    <div className="m-cashcard">
      <div>
        <Icon name="banknote" size={20} />
        <span>CASH BACK TO YOU</span>
        <b className="m-num">{money(amount)}</b>
      </div>
      <div className="m-num">
        <span>
          {foodLabel} {money(food)}
        </span>
        {delivery !== null && <span>Delivery {money(delivery)} · rider&apos;s</span>}
      </div>
      <p>{line}</p>
    </div>
  );
}

/** The pinned CTA bar (12/16/16; primary 52, secondary 48 outline). */
export function CtaBar({ children }: { children: React.ReactNode }) {
  return <div className="m-cta m-cta-pin">{children}</div>;
}
