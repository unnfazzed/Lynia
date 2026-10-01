"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MerchantEndOfDaySummaryResponse, MerchantProfileResponse } from "@lynia/shared";
import { ApiError } from "../../lib/api-client";
import { showBranchChevron, showNotLiveHome, useBranches } from "../../lib/branches";
import { primeBusiness } from "../../lib/business";
import { setBusyMode, setOpen } from "../../lib/menu-api";
import { getTodaySummary } from "../../lib/orders-api";
import { money, openStatus } from "../../lib/orders-view";
import { useNow } from "../../lib/use-now";
import { BranchSheet } from "../branches/BranchSheet";
import { Icon } from "../icons";
import { Switch } from "./Switch";
import { useToast } from "./Toast";

const SUMMARY_POLL_MS = 30_000;

/** B1's open/closed switch, shared with B5's "Open now" / busy-mode buttons below the header. */
export function useOpenSwitch(merchant: MerchantProfileResponse | null, onMerchant: (m: MerchantProfileResponse) => void) {
  const toast = useToast();
  const now = useNow(30_000);
  const [switching, setSwitching] = useState(false);
  const status = openStatus(merchant, new Date(now));

  async function toggleOpen(next: boolean, busy = false) {
    if (switching || !merchant) return;
    if (next && !status.closedByHand && !status.open) {
      toast("Outside your opening hours · change them in Account");
      return;
    }
    setSwitching(true);
    try {
      let m = await setOpen(next);
      if (busy) m = await setBusyMode({ active: true });
      primeBusiness(m);
      onMerchant(m);
      toast(next ? (busy ? "Open · busy mode +10 min" : "You’re open") : "Closed · new orders won’t come in");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't change that. Try again.");
    } finally {
      setSwitching(false);
    }
  }

  return { status, switching, toggleOpen };
}

/**
 * The Orders home's mint header (B1 restaurant, D1 shop — packages/design/handoff/merchant-mobile,
 * ledger D-48): the business, "● Open until 22:00" and the open/closed switch, then (owners) the
 * Orders · Sales · Cash overdue tiles, refreshed every half minute and whenever `refreshKey` changes.
 * Closed by hand, it greys. `children` sits under the tiles (D1's "Book a rider").
 *
 * Branches (ledger D-51, README section F): an owner with 2+ branches gets a chevron after the name; the
 * name and chevron are one 44px target that opens C6. In a branch LyniaGo hasn't switched on, the open
 * line becomes a grey "Not live yet" pill and the switch and tiles go (README §5).
 */
export function OrdersHeader({
  merchant,
  open,
  disabled,
  refreshKey,
  children,
}: {
  merchant: MerchantProfileResponse;
  open: ReturnType<typeof useOpenSwitch>;
  disabled: boolean;
  refreshKey?: unknown;
  children?: React.ReactNode;
}) {
  const owner = merchant.myRole === "owner";
  const [summary, setSummary] = useState<MerchantEndOfDaySummaryResponse | null>(null);
  const [sheet, setSheet] = useState(false);
  const branches = useBranches(owner);
  const chevron = showBranchChevron(merchant, branches.length);
  const notLive = showNotLiveHome(merchant, branches.length);
  const closed = open.status.closedByHand && !notLive;

  const loadSummary = useCallback(() => {
    if (!owner) return;
    getTodaySummary()
      .then(setSummary)
      .catch(() => {});
  }, [owner]);
  useEffect(() => {
    if (notLive) return undefined;
    loadSummary();
    if (!owner) return undefined;
    const t = setInterval(loadSummary, SUMMARY_POLL_MS);
    return () => clearInterval(t);
  }, [owner, notLive, loadSummary, refreshKey]);

  return (
    <div className={`m-hd${closed ? " m-hd-off" : ""}`}>
      <div className="m-hdt">
        <div className="m-biz">
          {chevron ? (
            <button type="button" className="m-biz-switch" aria-haspopup="dialog" onClick={() => setSheet(true)}>
              <b>{merchant.name}</b>
              <Icon name="chevron-down" size={20} color="var(--ink)" />
            </button>
          ) : (
            <b>{merchant.name}</b>
          )}
          {notLive ? (
            <span className="m-pl m-grey">Not live yet</span>
          ) : (
            <span style={open.status.open ? undefined : { color: "var(--muted)" }}>● {open.status.label}</span>
          )}
        </div>
        {!notLive && (
          <Switch
            checked={open.status.open}
            label={open.status.open ? "Open for orders" : "Closed"}
            disabled={open.switching || disabled}
            onChange={(next) => void open.toggleOpen(next)}
          />
        )}
      </div>
      {owner && !closed && !notLive && (
        <div className="m-stats">
          <div className="m-stat">
            <span>Orders</span>
            <b>{summary?.orders ?? "–"}</b>
          </div>
          <div className="m-stat">
            <span>Sales</span>
            <b>{summary?.sales !== undefined ? money(summary.sales) : "–"}</b>
          </div>
          <Link href="/statement" className="m-stat m-overdue">
            <span>Cash overdue</span>
            <b>{money(summary?.cashOverdue)}</b>
          </Link>
        </div>
      )}
      {!notLive && children}
      {sheet && <BranchSheet business={merchant} branches={branches} onClose={() => setSheet(false)} />}
    </div>
  );
}
