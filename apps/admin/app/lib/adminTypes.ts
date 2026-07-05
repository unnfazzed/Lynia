/**
 * Shapes the admin console reads from the API (`adminFetch`). These mirror the DS3 kit's fake-data
 * fields; the api endpoints behind several of them are still pending (see the A-0x tickets), so every
 * page degrades to the offline/empty state when `adminFetch` returns null. Monetary values are
 * strings (matching the existing Order.proposedFare contract) — the API owns rounding.
 */
import type { SettlementStatus } from "@lynia/shared";

/** A compact order/trip row reused in the recent-trips + recent-orders tables. */
export interface TripRow {
  id: string;
  route: string;
  status: string;
  fare: string;
  when: string;
}

/* ── Customers (A-05 adjacent) ─────────────────────────────── */
export interface Customer {
  id: string;
  name: string;
  /** Server-masked outside an active order (A-03). */
  phoneMasked: string;
  orders: number;
  spend: string;
  cancelRatePct: number;
  flags: number;
  joined: string;
  status: "active" | "flagged" | "banned";
}

export interface CustomerFlag {
  date: string;
  text: string;
  issueId?: string;
}

export interface CustomerDetail extends Customer {
  publicName: string;
  warn?: string;
  flagLog: CustomerFlag[];
  trail: TripRow[];
}

/* ── Issues / disputes (A-05) ──────────────────────────────── */
export interface IssueRow {
  id: string;
  type: string;
  order: string;
  openedBy: string;
  opened: string;
  status: "open" | "investigating" | "resolved";
}

export interface IssueStatement {
  who: string;
  text: string;
}

export interface IssueDetail extends IssueRow {
  route: string;
  fare: string;
  rider: string;
  customer: string;
  facts: string;
  /** True when the delivery OTP was never entered — drives the evidence callout. */
  codeNotEntered: boolean;
  photos?: number;
  statements: IssueStatement[];
  resolution?: string;
}

/* ── Cash & settlements (A-06 — model UNCONFIRMED) ─────────── */
/**
 * One rider's settlement for the current cycle (`GET /admin/cash/settlements`). The money model is
 * still an assumption (see the caveat in cash/page.tsx): `commission` = commissionPct of `grossFares`,
 * `refundsNetted` = customer refunds deducted before billing, `amountDue` = the net the rider owes.
 * `status` is the canonical `SettlementStatus` from `@lynia/shared` (pending | paid | overdue). All
 * monetary values are API-owned strings — the console renders, it does not compute them.
 */
export interface SettlementRow {
  id: string;
  /** Optional deep-link target — the rider whose settlement this is. */
  riderId?: string;
  name: string;
  /** Gross agreed fares on completed cash orders this cycle. */
  grossFares: string;
  /** Commission Lynia bills on the gross fares. */
  commission: string;
  /** Customer refunds netted off the commission before billing ("0" when none). */
  refundsNetted: string;
  /** Net owed after netting refunds — the amount the record-payment action settles. */
  amountDue: string;
  status: SettlementStatus;
  /** Cycle due date (settlement day), pre-formatted by the API. */
  dueDate: string;
}

export interface SettlementWeek {
  weekLabel: string;
  settlementDay: string;
  kpis: {
    cashCollected: string;
    commissionOwed: string;
    settledThisWeek: string;
    overdueCount: number;
    overdueNote?: string;
  };
  rows: SettlementRow[];
}

/* ── KYC review (kit kyc.html — admin A-02) ─────────────────── */
/**
 * One rider's KYC doc-review detail (`GET /admin/riders/:id/kyc`). The persisted A-02 state machine:
 * status, the resubmission counter + derived attempt/lock, and the last decline reason. Didit's
 * granular scores (face-match, doc authenticity, liveness) are NOT persisted in the pilot — only the
 * overall verdict flows into `status` — so the checks panel is rendered from `status` + the reviewer's
 * own compare rather than numeric fields (see admin.service.getKycReview).
 */
export interface KycReview {
  id: string;
  name: string;
  /** Server-masked (A-03) — the reviewer matches the ID number, not the phone. */
  phone: string;
  idNumber: string | null;
  bike: string;
  status: "pending" | "verified" | "failed";
  kycRef: string | null;
  /** Decline counter. 0 = first review, 1 = one resubmit used, >= 2 = locked. */
  kycAttempts: number;
  /** Current attempt number (1 on first review, 2 on the single allowed resubmit). */
  attempt: number;
  /** True once `kycAttempts >= 2` — resubmission is locked; the rider must contact support. */
  locked: boolean;
  declineReason: string | null;
  submittedAt: string;
}

/* ── Order detail (kit orders.html) ────────────────────────── */
export interface OrderDetail {
  id: string;
  route: string;
  status: string;
  stuck?: boolean;
  stuckNote?: string;
  rider: string | null;
  riderPhone?: string;
  bike?: string;
  customer: string;
  customerPhone?: string;
  proposed: string;
  agreed: string | null;
  km: number;
  items: Array<{ desc: string; qty: number }>;
  timeline?: Array<{ label: string; ts?: string; note?: string; state?: "done" | "now" | "stall" }>;
}

/* ── Rider detail (kit riders.html) ────────────────────────── */
export interface RiderDetail {
  id: string;
  name: string;
  phone: string;
  bike: string;
  kyc: "pending" | "verified" | "failed";
  status: "online" | "offline" | "suspended" | "cooldown";
  cooldown?: string;
  suspendReason?: string;
  trips: number;
  rating: string | null;
  ratingCount: number;
  completion: string;
  strikes: number;
  cashOwed: string;
  cashOverdue?: boolean;
  joined: string;
  trail: TripRow[];
}
