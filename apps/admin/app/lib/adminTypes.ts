/**
 * Shapes the admin console reads from the API (`adminFetch`). These mirror the DS3 kit's fake-data
 * fields; the api endpoints behind several of them are still pending (see the A-0x tickets), so every
 * page degrades to the offline/empty state when `adminFetch` returns null. Monetary values are
 * strings (matching the existing Order.proposedFare contract) — the API owns rounding.
 *
 * RELATIONSHIP TO `@lynia/shared` (roadmap 3.3 determination): the shared ENUMS below are imported from
 * the single source of truth (never re-declared). The RESPONSE INTERFACES, however, are a deliberately
 * DISTINCT admin-privileged surface, NOT duplicates of the rider/customer contracts in
 * `@lynia/shared/contracts.ts` — e.g. `WalletLedgerEntry` here exposes `balanceAfter`/`actor` and the
 * `ride_commission`/`reversal` entry types that the rider-facing `WalletEntry` intentionally hides. So
 * these cannot simply `import` the shared shapes without leaking admin-only fields onto rider surfaces
 * (or losing them here). Unifying them would mean promoting a new *admin-contracts* surface into a shared
 * package — a public-API design decision (the RF-07 rule: any new shared export gets its own reviewed
 * PR), deliberately deferred rather than done as a mechanical move. Keep admin-only shapes here; import
 * only shapes that already exist in shared and match exactly.
 */
import type { IssueType, IssueStatus, IssueResolution, ReportReason, Role } from "@lynia/shared";

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
  // `on_hold` (S·2) is a real, blocking state now; `flagged`/`banned` remain display-only placeholders.
  status: "active" | "flagged" | "banned" | "on_hold";
  /** The recorded reason for a hold (S·2), null otherwise. */
  holdReason?: string | null;
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
  /** Conduct/safety reports filed against this customer (A-05). Absent/empty ⇒ never reported. */
  reports?: ReportEntry[];
  trail: TripRow[];
}

/* ── Issues / disputes (A-05) ──────────────────────────────── */
export interface IssueRow {
  id: string;
  /** Canonical `IssueType` from `@lynia/shared`; rendered through `ISSUE_TYPE_LABELS`. */
  type: IssueType;
  order: string;
  openedBy: string;
  opened: string;
  status: IssueStatus;
}

export interface IssueStatement {
  who: string;
  text: string;
}

/** One step of the order's delivery evidence (mirrors `OrderDetail.timeline`) — the OTP/timeline
 *  proof surfaced on the investigation screen. */
export interface IssueTimelineStep {
  label: string;
  ts?: string;
  note?: string;
  state?: "done" | "now" | "stall";
}

export interface IssueDetail extends IssueRow {
  route: string;
  fare: string;
  rider: string;
  customer: string;
  /** Server-masked outside an active order (A-03) — the investigator sees the masked forms. */
  riderPhone?: string;
  customerPhone?: string;
  facts: string;
  /** True when the delivery OTP was never entered — drives the evidence callout. */
  codeNotEntered: boolean;
  /** Optional delivery-code/timeline evidence for the order behind the dispute. */
  timeline?: IssueTimelineStep[];
  photos?: number;
  statements: IssueStatement[];
  /** Set once resolved — the canonical `IssueResolution` outcome. */
  resolution?: IssueResolution;
  /** Refund handed to the customer (only on a `refund` resolution). */
  refundAmount?: string;
  /** Free-text note the resolving admin recorded. */
  resolutionNote?: string;
}

/* ── SOS events (DS13-05 — feed + acknowledgement) ───────── */
/**
 * One emergency alert raised on a live trip (`GET /admin/sos`, newest-first). The durable record of a
 * raised SOS so ops can see it independently of push delivery. `raisedByRole` is the raiser's role
 * ("customer" | "rider"); `lat`/`lng` are null when the device didn't attach a fix. `createdAt` is an
 * ISO string (API-owned). `acknowledgedAt` (DS13-05) is the ISO time an operator marked the alert
 * handled, or null while it's still pending — drives the pending/acknowledged status + the ack action.
 */
export interface SosRow {
  id: string;
  orderId: string;
  raisedByProfileId: string;
  raisedByRole: string;
  lat: number | null;
  lng: number | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

/* ── Reports against a party (A-05, conduct/safety) ────────── */
/**
 * One post-trip conduct/safety report filed against a rider or customer (distinct from an order
 * dispute). `reason` is the canonical `ReportReason` from `@lynia/shared`, rendered through
 * `REPORT_REASON_LABELS`. Surfaced on the rider + customer detail pages.
 */
export interface ReportEntry {
  date: string;
  reason: ReportReason;
  /** Who filed it — a masked/role label (e.g. "a rider", "the recipient"). */
  by?: string;
  note?: string;
  /** Deep-link to the order the report came out of, when there is one. */
  orderId?: string;
}

/* ── Commission (prepaid per-ride — 0% at launch) ──────────── */
/**
 * Commission overview (`GET /admin/cash/settlements`). The model is **prepaid per-ride**: riders
 * pre-fund a commission account and each completed ride debits a percentage of the amount paid. The
 * rate is **0% for the launch period**, so nothing is collected — this is a read-only view of ride
 * volume and the commission that *would* accrue at the current rate. There is no weekly billing,
 * refund-netting, record-payment or overdue state (all removed with the old cash-settlement engine);
 * the prepaid wallet + top-ups are a later build. All monetary values are API-owned strings.
 */
export interface CommissionRiderRow {
  /** Deep-link target — the rider these figures belong to. */
  riderId: string;
  name: string;
  /** Completed rides in the window. */
  rides: number;
  /** Gross agreed fares on those rides — the rider keeps this in full at 0%. */
  fares: string;
  /** Commission that would accrue at the current rate ("0.00" while the launch rate is 0%). */
  commission: string;
}

export interface CommissionOverview {
  /** Collection model — always `prepaid_per_ride`. */
  model: string;
  /** Current commission rate as a % of the amount paid per ride (0 during launch). */
  ratePct: number;
  /** The window these figures cover, pre-formatted by the API. */
  periodLabel: string;
  kpis: {
    ratePct: number;
    rides: number;
    fares: string;
    commission: string;
  };
  rows: CommissionRiderRow[];
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
  /** Short-lived signed GET URL for the rider's submitted document photo, or null (no photo yet, or
   *  the storage adapter failed to sign — the review still loads without it). */
  photoUrl: string | null;
  bike: string;
  status: "pending" | "verified" | "failed" | "expired";
  kycRef: string | null;
  /** Decline counter. 0 = first review, 1 = one resubmit used, >= 2 = locked. */
  kycAttempts: number;
  /** Current attempt number (1 on first review, 2 on the single allowed resubmit). */
  attempt: number;
  /** True once `kycAttempts >= 2` — resubmission is locked; the rider must contact support. */
  locked: boolean;
  declineReason: string | null;
  submittedAt: string;
  /** A-04: true if this rider's national ID already sat on another account at onboarding (snapshot). */
  duplicateIdFlag: boolean;
  /** A-04: the live set of OTHER accounts sharing this national ID — empty ⇒ no collision now.
   *  IR26-04: also includes accounts matched through the vendor-VERIFIED document hash. */
  duplicateIdAccounts: DuplicateIdAccount[];
  /** IR26-04: true = the document number the KYC vendor verified does NOT match the typed national ID
   *  ("typed a fake number, showed a real document"); false = they match; null = unknown (no vendor
   *  document data persisted, or no typed ID to compare). */
  verifiedIdMismatch: boolean | null;
}

/** One other account sharing this rider's national ID (A-04 duplicate-account guard). */
export interface DuplicateIdAccount {
  id: string;
  name: string;
  /** Server-masked (A-03). */
  phone: string;
  role: Role;
  /** The other account's KYC state, when it is itself a rider — null for a non-rider (e.g. customer). */
  kycStatus: "pending" | "verified" | "failed" | "expired" | null;
  /** The other account's rider standing, when it is a rider — null otherwise. */
  accountStatus: "active" | "suspended" | "banned" | null;
}

/* ── Order detail (kit orders.html) ────────────────────────── */
export interface OrderDetail {
  id: string;
  route: string;
  status: string;
  stuck?: boolean;
  stuckNote?: string;
  deliveryOtpAttempts?: number;
  /** Whether the customer/rider has an open (unresolved) issue filed against this order (A-05). */
  hasOpenIssue?: boolean;
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
  /** KB-POD-DISPUTE Phase A: rider-attached proof-of-drop evidence (photo read URL + GPS + capture time)
   *  for a disputed hand-off. Null unless the rider attached it. */
  deliveryProof?: {
    photoUrl: string | null;
    lat: number | null;
    lng: number | null;
    at: string | null;
  } | null;
}

/* ── Rider detail (kit riders.html) ────────────────────────── */
export interface RiderDetail {
  id: string;
  name: string;
  phone: string;
  bike: string;
  kyc: "pending" | "verified" | "failed" | "expired";
  status: "online" | "offline" | "suspended" | "banned" | "cooldown" | "on_hold";
  cooldown?: string;
  suspendReason?: string;
  /** Only present while status is "on_hold" — the score needs to reach RELIABILITY.ON_HOLD_CLEAR_AT. */
  reliabilityScore?: number;
  trips: number;
  rating: string | null;
  ratingCount: number;
  completion: string;
  strikes: number;
  /** Commission owed under the prepaid per-ride model — "0.00" while the launch rate is 0%. */
  commission: string;
  /** Orders this rider is actively riding right now (assigned…en_route_dropoff). A suspended/banned
   *  rider with activeOrders > 0 has a live delivery a standing change doesn't touch by itself. */
  activeOrders: number;
  joined: string;
  /** How many conduct/safety reports have been filed against this rider (A-05). 0 ⇒ never reported.
   *  (The API returns this as a count; the entries themselves are `reportLog`.) */
  reports?: number;
  /** The recent conduct/safety report entries (A-05) — what `<ReportsCallout>` renders. */
  reportLog?: ReportEntry[];
  trail: TripRow[];
}

/* ── Sidebar attention badges (GET /admin/nav-counts) ──────── */
export interface NavCounts {
  kycPending: number;
  openIssues: number;
  sosPending: number;
}

/* ── Rider prepaid wallet (DOC-16-03 — GET /admin/riders/:id/wallet) ── */
/** One append-only commission-ledger row (credit +, debit −). `type` mirrors the API's
 *  CommissionEntryType; `actor` is "system" or the admin profile id that wrote a manual credit. */
export interface WalletLedgerEntry {
  id: string;
  type: "ride_commission" | "topup" | "grace" | "adjustment" | "reversal";
  amount: string;
  balanceAfter: string;
  note: string | null;
  actor: string | null;
  orderId: string | null;
  at: string;
}

export interface WalletView {
  /** Prepaid commission balance (negative ⇒ owed). API-owned string. */
  balance: string;
  ledger: WalletLedgerEntry[];
}
