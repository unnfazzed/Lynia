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

/** Who cancelled an order, by role (GET /admin/orders `cancelledByRole`, admin console v2 §3). Orders
 *  cancelled before migration 0091 carry only customer / rider (matched from the canceller id) or null. */
export type CancelledByRole = "customer" | "rider" | "merchant" | "admin" | "system";

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
  /** X1/R-08: narrows food orders to WALLET only — deliberately independent of `status`/`onHold`
   *  (which blocks ALL ordering). Written only by a rider's refusal report (FoodDebtService). */
  cashBanned: boolean;
  cashBanReason: string | null;
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
  /** The order's route label (falls back to its id). */
  order: string;
  /** Optional: older API builds omit it. */
  orderId?: string;
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
  riderId?: string | null;
  customerId?: string | null;
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
  /** Optional: older API builds omit it. */
  raisedByName?: string | null;
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
 * refund-netting, record-payment or overdue state (all removed with the old cash-settlement engine).
 * The prepaid wallet + top-ups shipped 2026-07-15 (`apps/api/src/wallet/*`,
 * docs/archive/plans/2026-rider-wallet-design.md) — only the rate itself is still 0%. All monetary values are
 * API-owned strings.
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
  /** D-75: false when the account has no national ID on file. New riders type none: the ID check
   *  supplies it, and approving adopts it. Optional: an older API omits it, and the console then shows
   *  no notice. */
  idOnFile?: boolean;
  /** D-75: the national ID number the ID check verified (decrypted for the reviewer), or null when none
   *  was stored. With no ID on file, approving makes it the account's national ID. */
  verifiedIdNumber?: string | null;
  /** D-75: true when the account has no national ID and the number the ID check verified is already on
   *  another live account, so the API refuses the approval (409) until that account is resolved. */
  verifiedIdInUse?: boolean;
  /** True when the rider finished the Didit check and it was held for a manual review. Optional: an
   *  older API omits it (and `kycVendorStatus`), and the console then makes no claim about progress. */
  kycHeld?: boolean;
  /** Didit's own session status ("Approved", "In Review", "Declined", "Not Started", "In Progress",
   *  "Abandoned", "Expired"), or null when no Didit result was ever recorded. */
  kycVendorStatus?: string | null;
  /** Owner 2026-10-15, verified bikers only: null = the selfie was checked as normal; `unverified` = verified on
   *  the ID with a selfie the phone's camera couldn't make checkable; `recheck_requested` = ops asked for a new
   *  selfie (a reminder — it never blocks going online). Optional: an older API omits it. */
  selfieCheck?: "unverified" | "recheck_requested" | null;
  /** Why it was flagged (`camera_quality`), or why the latest re-check didn't pass (a decline-reason key). */
  selfieCheckReason?: string | null;
  /** When it was flagged, or when the re-check was asked for (ISO). */
  selfieCheckAt?: string | null;
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
  /** X1: "parcel" | "merchant" — drives whether `food` below is populated. */
  orderType?: "parcel" | "merchant";
  route: string;
  status: string;
  stuck?: boolean;
  stuckNote?: string;
  deliveryOtpAttempts?: number;
  /** Whether the customer/rider has an open (unresolved) issue filed against this order (A-05). */
  hasOpenIssue?: boolean;
  /** Ids for linking to /riders, /customers and /merchants. Optional: older API builds omit them. */
  riderId?: string | null;
  customerId?: string;
  merchantId?: string | null;
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
  /** X1: the food money-evidence panel — merchant, payment rail, R-01 debt, R-04/R-05 handshake, D-12
   *  refund. Null for a parcel order. */
  food?: FoodOrderPanel | null;
}

/** X1: food-order evidence surfaced on the order detail page (`GET /admin/orders/:id`, orderType
 *  ===merchant only — see admin-orders.service.ts getOrderDetail). */
export interface FoodOrderPanel {
  merchant: string | null;
  merchantPhase: string | null;
  rejectionReason: string | null;
  paymentMethod: "cash" | "wallet" | null;
  paymentConfirmedAt: string | null;
  cashRule: "collect_and_return" | "pay_upfront" | null;
  goodsTotal: string | null;
  deliveryFee: string | null;
  /** D-71: the part of the rider's fee the business paid (free delivery); null = the customer paid it. */
  merchantDeliveryShare?: string | null;
  debt: {
    status: "open" | "settled_cash" | "settled_goods" | "written_off";
    amount: string | null;
    openedAt: string | null;
    settledAt: string | null;
  } | null;
  /** Present only for a CASH order. A live R-05 dispute is `frozenAt` set with `riderConfirmedAt` null. */
  handshake: {
    amount: string | null;
    customerConfirmedAt: string | null;
    riderConfirmedAt: string | null;
    deadlineAt: string | null;
    frozenAt: string | null;
  } | null;
  refund: { reference: string | null; amount: string | null; refundedAt: string } | null;
}

/* ── Merchants (X1) ─────────────────────────────────────────── */
/** Admin console v2 §5: where a business is in its application (@lynia/shared MERCHANT_APPLICATION_STATUSES). */
export type MerchantApplicationStatus = "applied" | "reviewing" | "approved" | "live" | "rejected" | "suspended";
export type MerchantApplicationSla = "ok" | "amber" | "red";

export interface Merchant {
  id: string;
  name: string;
  cashRule: "collect_and_return" | "pay_upfront";
  pilotEnabled: boolean;
  busyMode: boolean;
  cuisineTags: string[];
  /** Merchant web upgrade L1: what the business sells, fixed at sign-up. */
  businessType: "restaurant" | "shop";
  /** A shop's kind (`pharmacy`, `auto_parts`, …); null for a restaurant. */
  shopKind: string | null;
  /** The landmark riders look for, from the sign-up pin. */
  landmark: string | null;
  /** The business contact phone, masked in the directory (in full on the detail page). */
  contactPhoneMasked: string | null;
  orders: number;
  openDebtAmount: string;
  openDebtCount: number;
  joined: string;
  /** Admin console v2 §5. Optional: older API builds omit it. */
  applicationStatus?: MerchantApplicationStatus;
  /** Queue rows only (`?status=`): when it signed up, how long it has waited, the SLA and the checklist score. */
  appliedAt?: string;
  ageMs?: number;
  sla?: MerchantApplicationSla | null;
  score?: { passed: number; total: number };
}

export type MerchantApplicationAction = "review" | "approve" | "reject" | "go_live" | "suspend" | "resume";

export interface MerchantChecklistRow {
  key: "location" | "hours" | "owner" | "menu" | "shopfront" | "team" | "licence" | "call";
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
  warning?: string;
}

/** `GET /admin/merchants/:id/application`. */
export interface MerchantApplication {
  merchantId: string;
  status: MerchantApplicationStatus;
  statusAt: string | null;
  rejectReason: string | null;
  appliedAt: string;
  approvedAt: string | null;
  sla: MerchantApplicationSla | null;
  ageMs: number;
  isPharmacy: boolean;
  checklist: MerchantChecklistRow[];
  score: { passed: number; total: number };
  canApprove: boolean;
  actions: MerchantApplicationAction[];
  licence: {
    licenceNumber: string | null;
    pharmacistName: string | null;
    reference: string | null;
    recordedBy: string;
    recordedAt: string;
    verifiedAt: string | null;
    verifiedBy: string | null;
  } | null;
  calls: { id: string; outcome: string | null; note: string | null; at: string }[];
  history: { step: string; at: string }[];
}

/** `GET /admin/merchants/:id/metrics` — null wherever there is no data yet. */
export interface MerchantMetrics {
  since: string;
  short: boolean;
  windowDays: number;
  orders: number;
  acceptMedianSeconds: number | null;
  acceptSample: number;
  missedPct: number | null;
  missed: number;
  prepMedianMinutes: number | null;
  promisedMedianMinutes: number | null;
  prepSample: number;
  outOfStockPct: number | null;
  outOfStockLines: number;
  lines: number;
  hoursOpen: number | null;
  hoursScheduled: number | null;
  rating: { avg: number; count: number } | null;
  openDebtAmount: string;
  openDebtCount: number;
}

export interface MerchantDebtLedgerRow {
  id: string;
  orderId: string;
  riderId: string;
  /** Optional: older API builds omit it. */
  riderName?: string | null;
  type: "opened" | "settled_cash" | "settled_goods" | "written_off";
  amount: string;
  note: string | null;
  actor: string | null;
  at: string;
}

/** What customers will see, for the reviewer (owner, 2026-10-18). Photo URLs are signed for an hour; null
 *  when there is no photo or it couldn't be signed (`has*` says which). */
export interface MerchantShopFront {
  logoUrl: string | null;
  coverPhotoUrl: string | null;
  hasLogo: boolean;
  hasCover: boolean;
  about: string | null;
  tags: string[];
  priceLevel: number | null;
  /** Mon–Sun; a closed day has no times. */
  hours: { day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"; open: string | null; close: string | null }[];
  itemCount: number;
  /** The first items as listed, drafts included. */
  items: { id: string; name: string; category: string; priceUsd: string; photoUrl: string | null; hasPhoto: boolean; draft: boolean }[];
}

export interface MerchantDetail extends Merchant {
  description: string | null;
  priceLevel: number | null;
  /** The number ops calls before switching a restaurant on (go-live runbook), in full. */
  contactPhone: string | null;
  /** The sign-up pin riders are sent to. */
  pin: { lat: number; lng: number } | null;
  trail: TripRow[];
  debtLedger: MerchantDebtLedgerRow[];
  /** LC-D-T1: last entry id of this debt-ledger page, for `?debtCursor=` — present only when older
   *  entries exist. */
  debtLedgerNextCursor: string | null;
  /** Merchant web upgrade L2: the customer account every booking is made as (created at the first
   *  booking, so null before it). Holding it holds the whole business's bookings. Absent on an API that
   *  can't book riders yet. */
  bookingAccount?: { id: string; onHold: boolean } | null;
  /** Auto-accept: new orders skip the restaurant's accept; ops confirms each by phone before a rider. */
  autoAccept?: boolean;
  /** Auto-accept: customers see the restaurant's number (only once the restaurant agreed). */
  showPhoneToCustomers?: boolean;
  /** D-71: the business pays the delivery fee on new cash orders (customers pay $0 delivery). */
  freeDelivery?: boolean;
  /** Absent on an API from before the shop-front review. */
  shopFront?: MerchantShopFront;
}

/* ── Orders to confirm (auto-accept: GET /admin/kitchen-confirmations) ── */
export interface KitchenConfirmationLine {
  /** The order line's id — what `POST /admin/orders/:id/edit-items` takes as `itemId`. */
  itemId: string;
  name: string;
  priceUsd: number;
  quantity: number;
  note: string | null;
  /** Taken off the order (quantity 0 in an edit) — shown struck through. */
  removed: boolean;
}

export interface KitchenConfirmationRow {
  orderId: string;
  placedAt: string;
  waitingMinutes: number;
  /** Waited past `escalateAfterMinutes` without the kitchen confirming. */
  urgent: boolean;
  restaurant: { id: string | null; name: string; phone: string | null };
  customer: { name: string; phone: string | null };
  dropoffLandmark: string | null;
  items: KitchenConfirmationLine[];
  goodsTotal: number;
  deliveryFee: number;
  total: number;
  prepMinutes: number | null;
  /** ISO timestamps of each "No answer" ops logged, oldest first. */
  noAnswerCalls: string[];
  itemsEdited: boolean;
}

export interface KitchenConfirmations {
  orders: KitchenConfirmationRow[];
  escalateAfterMinutes: number;
}

/* ── Support dispute queue (X1: GET /admin/merchant-disputes) ── */
export interface HandshakeDisputeRow {
  orderId: string;
  merchant: string;
  customer: string;
  rider: string | null;
  amount: string | null;
  customerConfirmedAt: string | null;
  frozenAt: string;
}

export interface RefundOverdueRow {
  orderId: string;
  merchant: string;
  customer: string;
  amount: string | null;
  terminalAt: string;
  overdue: boolean;
  overdueMinutes: number;
}

/** D3 (2026-10-07, MJ-RH1): a merchant reported goods / cash as not returned. The debt is still open and
 *  the rider is not suspended — support follows it up and an admin decides (write off, suspend the rider). */
export interface NonReturnReportRow {
  orderId: string;
  merchant: string;
  riderId: string | null;
  rider: string | null;
  amount: string | null;
  orderStatus: string;
  reportedAt: string;
}

export interface FoodDisputes {
  handshakeDisputes: HandshakeDisputeRow[];
  refundsOverdue: RefundOverdueRow[];
  /** Absent on an API from before D3. */
  nonReturnReports?: NonReturnReportRow[];
}

/* ── Rider detail (kit riders.html) ────────────────────────── */
/** First Run v2 E4 (D-82): the bike plate's check. */
export type PlateStatus = "none" | "checking" | "verified";

export interface RiderDetail {
  id: string;
  name: string;
  phone: string;
  bike: string;
  /** First Run v2 E4 (D-82): ops' check of `bike` — `checking` until POST plate-verify. Absent on older APIs. */
  plateStatus?: PlateStatus;
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
  /** X1: R-05 frozen handshakes + N-12 refund-overdue orders — the /merchants/disputes queue count. */
  foodDisputes: number;
  /** Admin console v2 §5: merchant applications waiting on ops past the 24h SLA. Optional: older APIs omit it. */
  merchantApplications?: number;
  /** Own bikers (OB-A1): fleets with a bill past its due day. Filled by the layout from `/admin/alerts`. */
  fleetsOverdue?: number;
}

/* ── Rider prepaid wallet (DOC-16-03 — GET /admin/riders/:id/wallet) ── */
/** One append-only commission-ledger row (credit +, debit −). `type` mirrors the API's
 *  CommissionEntryType; `actor` is "system" or the admin profile id that wrote a manual credit.
 *  `free_job` (admin console v2 §3) is the $0 receipt for one of the biker's commission-free first jobs. */
export interface WalletLedgerEntry {
  id: string;
  type: "ride_commission" | "topup" | "grace" | "adjustment" | "reversal" | "free_job";
  amount: string;
  balanceAfter: string;
  note: string | null;
  actor: string | null;
  orderId: string | null;
  at: string;
  /* Admin console v2 §6 (the biker statement). Optional: an older API doesn't send them. */
  /** The actor's name when it is an admin profile id; otherwise the actor as written ("system", an email). */
  actorName?: string | null;
  /** A commission / free-job row's rate (%) and basis (the fare it was worked out on). */
  ratePct?: string | null;
  fare?: string | null;
  /** On a reversal: the credit it took back. On a credit: how much of it has been reversed so far. */
  reversesId?: string | null;
  reversed?: string | null;
  topUp?: { id: string; rail: string; manual: boolean; ref: string | null; charged: string | null; fee: string | null } | null;
}

/** The biker statement header (admin console v2 §6). */
export interface StatementSummary {
  ratePct: number;
  commissionActive: boolean;
  tripsCount: number;
  freeJobsLeft: number;
  /** Commission still to come on jobs delivered but not yet closed (a projection; "0.00" while the rate is 0%). */
  pendingCommission: string;
  pendingJobs: number;
  lastTopup: { id: string; amount: string; rail: string; manual: boolean; at: string } | null;
}

/* ── Admin console v2 §6: top-ups, money panel, money owed ── */
export type TopupFilter = "pending" | "confirmed" | "declined" | "expired" | "short_paid" | "paid_on_declined";

export interface AdminTopupRow {
  id: string;
  riderId: string;
  riderName: string;
  amount: string;
  fee: string | null;
  charged: string | null;
  rail: string;
  providerRef: string | null;
  status: "pending" | "confirmed" | "declined" | "expired";
  declineReason: string | null;
  initiatedAt: string;
  resolvedAt: string | null;
  credited: string | null;
  manual: boolean;
  anomaly: { kind: "short_paid" | "paid_on_declined"; paid: number | null; at: string; resolved: boolean } | null;
}

export interface AdminTopupsPage {
  rows: AdminTopupRow[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts: Record<TopupFilter, number>;
}

export interface MoneyDay {
  day: string;
  topupsIn: string;
  fees: string;
  commission: string;
  manualCredits: string;
  reversals: string;
  freeJobs: number;
}

export interface MoneyPanel {
  days: number;
  ratePct: number;
  rows: MoneyDay[];
  totals: Omit<MoneyDay, "day">;
  float: string;
  receivable: string;
  owedCount: number;
  integrity: { at: string; ok: boolean; totalDrift: number; accountsChecked: number; drift: Record<string, number> } | null;
}

export interface OwedRow {
  riderId: string;
  name: string;
  phone: string | null;
  owed: string;
  negativeSince: string | null;
  lastJobAt: string | null;
  lastTopupAt: string | null;
}

export interface OwedList {
  rows: OwedRow[];
  total: string;
}

export interface WalletView {
  /** Prepaid commission balance (negative ⇒ owed). API-owned string. */
  balance: string;
  ledger: WalletLedgerEntry[];
  /** LC-D07: last entry id of this page, for `?cursor=` — present only when older entries exist. */
  nextCursor: string | null;
  /** Admin console v2 §6: the statement header. Absent on an older API. */
  summary?: StatementSummary;
  /**
   * The `commission_freeze` wallet hold (design OV-4A: a freeze is a `Rider.heldReason =
   * "commission_freeze"` hold — there is deliberately no `CommissionAccount.status` column).
   *
   * **NOT SERVED BY THE API TODAY — always `undefined` at the time of writing.** `GET
   * /admin/riders/:id/wallet` (`AdminRidersService.walletView`) selects only `balance` + ledger rows,
   * and `GET /admin/riders/:id` (`getRiderDetail`) selects `onHold` but never `heldReason`, so no admin
   * read surface reports WHY a rider is held. `@lynia/shared`'s `HeldReason` union is still
   * `reliability | velocity` — nothing anywhere writes `"commission_freeze"`.
   *
   * Three-state on purpose, and the UI must respect it:
   *   `true`      — a freeze is in place (top-ups blocked, admin-clear-only),
   *   `false`     — the API affirmatively reports no freeze,
   *   `undefined` — the API does not report freeze state at all. The console must say so rather than
   *                 render "not frozen", which would be a guess about a money-gating flag.
   * Optional so the wallet card lights up automatically the day the API starts returning it.
   */
  frozen?: boolean;
}

/* ── Rider roster row (GET /admin/riders) ──────────────────── */
/**
 * One row of the rider directory. Mirrors `AdminRidersService.listRiders`, which hard-caps at
 * `take: 100` ordered by `updatedAt desc` — any consumer counting rows off this endpoint is reading a
 * capped sample, not a fleet total, and must disclose that (see the bulk seed-credit preview).
 */
export interface RiderRosterRow {
  profileId: string;
  name: string;
  kycStatus: "pending" | "verified" | "failed" | "expired";
  isOnline: boolean;
  accountStatus: "active" | "suspended" | "banned";
  /** Separate reliability-hold flag (accountStatus has no on_hold member). */
  onHold: boolean;
  tripsCount: number;
  cooldownUntil: string | null;
}

/* ── Audit viewer, search, timelines (admin console v2 PR 3, plan §4 / §8) ─────────────── */

/** What an audit row's `target` names (GET /admin/audit). `other` = a free-text target with no record behind it. */
export type AuditTargetType = "rider" | "customer" | "order" | "merchant" | "issue" | "sos" | "topup" | "other";

export interface AuditRow {
  id: string;
  at: string;
  actor: { id: string; name: string; href: string | null };
  action: string;
  /** Short past-tense label ("Suspended"), server-written. */
  actionLabel: string;
  target: { type: AuditTargetType; id: string; label: string; href: string | null };
  reasonCode: string | null;
  note: string | null;
  amount: string | null;
  before: unknown;
  after: unknown;
}

/** GET /admin/audit — newest first; pass `nextCursor` back as `?cursor=` for the next page. */
export interface AuditList {
  rows: AuditRow[];
  nextCursor: string | null;
}

export interface SearchHit {
  id: string;
  label: string;
  sub: string;
  href: string;
}

/** GET /admin/search?q= — capped per group. */
export interface SearchResults {
  q: string;
  tooShort: boolean;
  total: number;
  groups: { bikers: SearchHit[]; customers: SearchHit[]; merchants: SearchHit[]; orders: SearchHit[]; topups: SearchHit[] };
}

export type TimelineKind = "order" | "event" | "kyc" | "audit" | "topup" | "wallet";

export interface TimelineRow {
  key: string;
  at: string;
  kind: TimelineKind;
  line: string;
  tone: "good" | "bad" | "mut" | "";
  ref: { label: string; href: string } | null;
  by: string | null;
}

/** GET /admin/people/:id/timeline and /admin/merchants/:id/timeline. */
export interface TimelinePage {
  rows: TimelineRow[];
  nextCursor: string | null;
}

/* ── Admin console v2 §4 (PR 5): funnels, stuck lists, Nudge ─────────────────────────────────────── */

export type FunnelKind = "biker" | "customer" | "merchant";
export type FunnelRange = "today" | "7d" | "30d";

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** count ÷ cohort, 0–100. */
  pctOfCohort: number | null;
  /** count ÷ the previous step's count, 0–100. */
  conversionPct: number | null;
  /** Median time from the previous timed step, ms. */
  medianMs: number | null;
  timedCount: number;
  /** Counts are complete only from this Harare day (YYYY-MM-DD). */
  since: string | null;
  /** Times are complete only from this Harare day. */
  timesSince: string | null;
  /** The stuck list of the people who didn't reach this step. */
  stuckList: string | null;
}

/** GET /admin/funnels?kind=&range=. */
export interface FunnelView {
  kind: FunnelKind;
  range: FunnelRange;
  from: string;
  to: string;
  cohort: number;
  truncated: boolean;
  steps: FunnelStep[];
}

export interface StuckRow {
  id: string;
  name: string;
  href: string;
  profileId: string | null;
  phone: string | null;
  since: string;
  detail: string | null;
  link: { href: string; label: string } | null;
  hasPush: boolean;
  lastNudgeAt: string | null;
  nudgedToday: boolean;
}

/** GET /admin/stuck?list=. */
export interface StuckList {
  key: string;
  kind: FunnelKind;
  title: string;
  line: string;
  nudge: boolean;
  /** The push a Nudge sends from this list. */
  copy: { title: string; body: string } | null;
  rows: StuckRow[];
  count: number;
  capped: boolean;
  queue: { href: string; label: string; count: number } | null;
  note: string | null;
}

/** GET /admin/stuck?kind=: every list of a side, counts only. */
export interface StuckSummary {
  kind: FunnelKind;
  lists: Array<Omit<StuckList, "rows">>;
}

/** POST /admin/nudge. */
export type NudgeResult =
  | { result: "sent"; at: string }
  | { result: "not_delivered"; at: string }
  | { result: "already_sent"; at: string }
  | { result: "no_push" };

/* ── Admin console v2 §7: live ops (GET /admin/live/orders, /admin/live/fleet, /admin/alerts, /admin/config) ── */

export type LiveBreach = "ok" | "warn" | "breach";

/** One active order in the monitor: its stage, when the stage started, its SLA limit and breach status. */
export interface LiveOrderRow {
  id: string;
  orderType: string;
  status: string;
  merchantPhase: string | null;
  stage: string;
  stageLabel: string;
  stageStartedAt: string;
  limitMs: number;
  elapsedMs: number;
  breach: LiveBreach;
  createdAt: string;
  customer: { id: string; name: string };
  rider: { id: string; name: string } | null;
  merchant: { id: string; name: string } | null;
}

export interface LiveOrders {
  generatedAt: string;
  /** `total` = timed rows; `active` = every not-ended order (QA-B03); `untimed` = active orders with no clock. */
  counts: { total: number; breach: number; warn: number; active?: number; untimed?: number };
  rows: LiveOrderRow[];
}

export interface FleetPoint {
  lat: number;
  lng: number;
}

export interface FleetRider {
  riderId: string;
  name: string;
  /** Null when the biker is online but has never sent a position. */
  position: (FleetPoint & { at: string | null; fresh: boolean }) | null;
  orderId: string | null;
}

export interface FleetOrder {
  orderId: string;
  orderType: string;
  status: string;
  breach: LiveBreach | null;
  riderId: string | null;
  pickup: FleetPoint | null;
  dropoff: FleetPoint | null;
}

export interface Fleet {
  generatedAt: string;
  riders: FleetRider[];
  orders: FleetOrder[];
}

/** The alert strip above every page. */
export interface LiveAlerts {
  sosPending: number;
  topupAnomalies: number;
  kitchenConfirmations: number;
  merchantApplications: number;
  ordersBreaching: number;
  /** Own bikers (OB-A4 tile): fleets switched on, their bikers online, bills and fleets past due. Older APIs omit it
   *  (and `overdueFleets`). */
  ownBikers?: { fleets: number; bikersOnline: number; overdueBills: number; overdueFleets?: number };
}

/** The read-only settings panel. */
export interface AdminConfig {
  environment: string;
  penaltiesSuspended: boolean;
  commission: { ratePct: number; freeFirstJobs: number; minTopUp: number; maxTopUp: number };
  topUps: { paymentRail: string; rails: string[]; feePct: number; feeMode: string };
  wallet: { manualCreditCapUsd: number; reversalCapUsd: number };
  kyc: { mode: string; provider: string };
  verticals: {
    restaurants: boolean;
    shops: boolean;
    pharmacy: boolean;
    prescriptions: boolean;
    autoDispatch: boolean;
    merchantWallet: boolean;
    notificationsFeed: boolean;
  };
  gpsRetentionDays: number;
  sla: Array<{ stage: string; label: string; limitMinutes: number; note: string | null }>;
}

/* ── Biker referrals (D-112): GET /admin/referrals, GET /admin/riders/:id/referral ─────────────────── */

/** joined = became a biker; verified = passed the ID check; riding = verified and finished a job. */
export type ReferralStage = "joined" | "verified" | "riding";
export type ReferralFlag = "same_device" | "same_id" | "duplicate_id" | "referrer_not_verified" | "not_active";

export interface AdminReferralRow {
  id: string;
  createdAt: string;
  referrer: { id: string; name: string; code: string };
  friend: { id: string; name: string; kycStatus: string; verifiedAt: string | null; trips: number; accountStatus: string };
  stage: ReferralStage;
  flags: ReferralFlag[];
  paid: { at: string; amount: string } | null;
}

export interface AdminReferrerRow {
  id: string;
  name: string;
  code: string;
  referred: number;
  verified: number;
  riding: number;
  unpaidVerified: number;
  paidCount: number;
  paidTotal: string;
}

export interface AdminReferrals {
  totals: {
    referred: number;
    verified: number;
    riding: number;
    unpaidVerified: number;
    paidCount: number;
    paidTotal: string;
    links: number;
  };
  referrers: AdminReferrerRow[];
  rows: AdminReferralRow[];
  capped: boolean;
}

export interface RiderReferralSummary {
  code: string | null;
  link: string | null;
  referred: number;
  verified: number;
  paidCount: number;
}
