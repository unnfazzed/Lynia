/**
 * Shapes the admin console reads from the API (`adminFetch`). These mirror the DS3 kit's fake-data
 * fields; the api endpoints behind several of them are still pending (see the A-0x tickets), so every
 * page degrades to the offline/empty state when `adminFetch` returns null. Monetary values are
 * strings (matching the existing Order.proposedFare contract) — the API owns rounding.
 */

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
export interface SettlementRow {
  id: string;
  name: string;
  trips: number;
  cash: string;
  commission: string;
  adjustment?: string;
  status: "due" | "overdue" | "settled" | "none";
  note: string;
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
