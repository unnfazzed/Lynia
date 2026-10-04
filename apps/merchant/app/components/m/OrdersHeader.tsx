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
 * The Orders home's mint top card (Merchant v2 K1/S1/T4 — packages/design/handoff/merchant-v2, ledger
 * D-77): the business, "● Open · until 22:00" and the labelled open pill, then (kitchen owners) one KPI
 * strip — Orders · Sales · Cash due, the last in gold when it isn't zero — refreshed every half minute
 * and whenever `refreshKey` changes. Closed by hand, the card greys and the strip goes (T4). A shop's
 * card carries "Book a rider" (`children`) where the kitchen has the strip (S1 draws no strip).
 *
 * Branches (ledger D-51, README section F): an owner with 2+ branches gets a chevron after the name; the
 * name and chevron are one 44px target that opens C6. In a branch LyniaGo hasn't switched on, the open
 * line becomes a grey "Not live yet" pill and the pill and strip go (README §5).
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
  const shop = merchant.businessType === "shop";
  const [summary, setSummary] = useState<MerchantEndOfDaySummaryResponse | null>(null);
  const [sheet, setSheet] = useState(false);
  const branches = useBranches(owner);
  const chevron = showBranchChevron(merchant, branches.length);
  const notLive = showNotLiveHome(merchant, branches.length);
  const closed = open.status.closedByHand && !notLive;
  const kpis = owner && !shop && !closed && !notLive;

  const loadSummary = useCallback(() => {
    if (!owner) return;
    getTodaySummary()
      .then(setSummary)
      .catch(() => {});
  }, [owner]);
  useEffect(() => {
    if (notLive || !kpis) return undefined;
    loadSummary();
    const t = setInterval(loadSummary, SUMMARY_POLL_MS);
    return () => clearInterval(t);
  }, [kpis, notLive, loadSummary, refreshKey]);

  // "Cash due" is all the cash riders still owe back; an API from before D-77 only knows the overdue part.
  const cashDue = summary ? (summary.cashDue ?? summary.cashOverdue ?? 0) : null;

  return (
    <div className={`m-hd${closed ? " m-hd-off" : ""}`}>
      <div className="m-hdt">
        <div className="m-biz">
          {chevron ? (
            <button type="button" className="m-biz-switch" aria-haspopup="dialog" onClick={() => setSheet(true)}>
              <b>{merchant.name}</b>
              <Icon name="chevron-down" size={20} color="var(--muted)" />
            </button>
          ) : (
            <b>{merchant.name}</b>
          )}
          {notLive ? (
            <span className="m-pl m-grey">Not live yet</span>
          ) : (
            <span className={`m-state${open.status.open ? "" : " m-off"}`}>{open.status.label}</span>
          )}
        </div>
        {!notLive && (
          <button
            type="button"
            role="switch"
            aria-checked={open.status.open}
            className="m-open"
            disabled={open.switching || disabled}
            onClick={() => void open.toggleOpen(!open.status.open)}
          >
            <i aria-hidden="true" />
            {open.status.open ? "Open" : "Closed"}
          </button>
        )}
      </div>
      {kpis && (
        <div className="m-kpi m-num">
          <div>
            <span>Orders</span>
            <b>{summary?.orders ?? "–"}</b>
          </div>
          <div>
            <span>Sales</span>
            <b>{summary?.sales !== undefined && summary ? money(summary.sales) : "–"}</b>
          </div>
          <Link href="/statement" className={cashDue ? "m-due" : undefined}>
            <span>Cash due</span>
            <b>{cashDue === null ? "–" : money(cashDue)}</b>
          </Link>
        </div>
      )}
      {!notLive && !closed && children}
      {sheet && <BranchSheet business={merchant} branches={branches} onClose={() => setSheet(false)} />}
    </div>
  );
}
