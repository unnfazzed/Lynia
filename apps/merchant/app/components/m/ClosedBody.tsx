"use client";

import Link from "next/link";
import type { MerchantProfileResponse } from "@lynia/shared";
import { nextOpenTime } from "../../lib/orders-view";
import { vocabulary } from "../../lib/vocabulary";
import type { PartialMerchantHours } from "../../lib/hours";
import { Icon } from "../icons";
import type { useOpenSwitch } from "./OrdersHeader";

/**
 * T4 · Closed (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77): under the grey top card,
 * the power disc, "You're closed", what customers can and can't do, then "Open now" and "Open, but busy
 * (+10 min)". A shop's line says "items" where the kitchen's says "menu".
 */
export function ClosedBody({
  merchant,
  open,
  disabled,
  children,
}: {
  merchant: MerchantProfileResponse;
  open: ReturnType<typeof useOpenSwitch>;
  disabled: boolean;
  /** Orders already under way still need finishing while closed. */
  children?: React.ReactNode;
}) {
  const v = vocabulary(merchant.businessType, merchant.shopKind);
  const from = merchant.closedUntil
    ? new Date(merchant.closedUntil)
    : new Date();
  const opens = nextOpenTime(
    (merchant.hours ?? null) as PartialMerchantHours | null,
    from,
  );
  const what = merchant.businessType === "shop" ? v.catalogLower : "menu";
  return (
    <>
      <div className="m-closed">
        <i>
          <Icon name="power" size={28} />
        </i>
        <b>You’re closed</b>
        <p>
          Customers can see your {what} but can’t order.
          {opens ? ` You open again at ${opens}.` : ""}
        </p>
        <button
          type="button"
          className="m-btn"
          disabled={open.switching || disabled}
          onClick={() => void open.toggleOpen(true)}
        >
          Open now
        </button>
        <button
          type="button"
          className="m-gh"
          disabled={open.switching || disabled}
          onClick={() => void open.toggleOpen(true, true)}
        >
          Open, but busy (+10 min)
        </button>
      </div>
      {children}
    </>
  );
}

/** S1's "Book a rider" card on the shop's top card. */
export function BookRiderCard({ href }: { href: string }) {
  return (
    <Link href={href} className="m-hdbtn">
      <i>
        <Icon name="bike" size={20} />
      </i>
      <div>
        <b>Book a rider</b>
        <span>For sales you made by phone or WhatsApp</span>
      </div>
      <Icon name="chevron-right" size={20} color="var(--muted)" />
    </Link>
  );
}
