import { Body, Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  EditMerchantOrderItemsRequest,
  KycStatus,
  MERCHANT_APPLICATION_STATUSES,
  OrderStatus,
  OrderType,
  PlateStatus,
  TransferMerchantOwnerRequest,
} from "@lynia/shared";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { SettlementsService } from "../settlements/settlements.service";
import { SosService } from "../sos/sos.service";
import { REVERSAL_CAP_USD, WalletService } from "../wallet/wallet.service";
import { AdminAuditReadService } from "./admin-audit-read.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminKitchenService } from "./admin-kitchen.service";
import { AdminKycReviewService } from "./admin-kyc-review.service";
import { AdminMerchantApplicationService, CALL_OUTCOMES } from "./admin-merchant-application.service";
import { AdminMerchantsService } from "./admin-merchants.service";
import type { ApplicationAction } from "./merchant-application";
import { AdminMoneyService, TOPUP_FILTERS, type TopupFilter } from "./admin-money.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminRidersService } from "./admin-riders.service";
import { AdminSearchService } from "./admin-search.service";
import { AdminTimelineService } from "./admin-timeline.service";
import { AdminService } from "./admin.service";

const KYC_VALUES = Object.values(KycStatus) as string[];
const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];
const ORDER_TYPE_VALUES = Object.values(OrderType) as string[];
const CUSTOMER_FILTERS = ["active", "flagged", "banned", "on_hold"] as const;

// A-01 audit-action payload (mirrors submitAdminAction in apps/admin). action + target are required;
// reasonCode + note are the ConfirmModal justification (nullable — some actions carry neither). Capped,
// not enum-bound, so the admin's reason-code taxonomy can evolve without 400ing the audit write.
const AuditAction = z.object({
  action: z.string().min(1).max(80),
  target: z.string().min(1).max(200),
  reasonCode: z.string().max(160).nullish(),
  note: z.string().max(2000).nullish(),
});

// A-04/D-2 mutation bodies. `reason` is the ConfirmModal justification recorded as the audit
// reasonCode; `note` is the optional free-text. Reason is REQUIRED for the destructive actions
// (suspend/ban/cancel/fare) and optional for a lift. Bounds mirror the AuditAction payload.
const ReasonRequired = z.object({
  reason: z.string().min(1).max(160),
  note: z.string().max(2000).nullish(),
});
/** L1 go-live switch body: on/off plus an optional ops note for the audit row. */
// Auto-accept: ops sets how a restaurant takes orders on its behalf (at least one field).
const SetMerchantOrderSettings = z
  .object({
    autoAccept: z.boolean().optional(),
    showPhoneToCustomers: z.boolean().optional(),
    // D-71: free delivery paid by the venue.
    freeDelivery: z.boolean().optional(),
    note: z.string().max(2000).nullish(),
  })
  .refine((v) => v.autoAccept !== undefined || v.showPhoneToCustomers !== undefined || v.freeDelivery !== undefined, {
    message: "Nothing to change",
  });

const OptionalNote = z.object({ note: z.string().max(2000).nullish() });

const SetMerchantPilot = z
  .object({
    enabled: z.boolean(),
    note: z.string().max(2000).nullish(),
  })
  .strict();
// Admin console v2 §5: an ops call to an applying business, and a pharmacy's licence as ops recorded it.
const LogMerchantCall = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().max(2000).nullish(),
});
const RecordMerchantLicence = z.object({
  licenceNumber: z.string().trim().min(1).max(60),
  pharmacistName: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(300).nullish(),
  note: z.string().max(2000).nullish(),
});
/** The application actions reachable by URL (`POST /admin/merchants/:id/application/:action`). */
const APPLICATION_ACTIONS: readonly ApplicationAction[] = ["review", "approve", "reject", "go_live", "suspend", "resume"];
const ReasonOptional = z.object({
  reason: z.string().max(160).nullish(),
  note: z.string().max(2000).nullish(),
});
// First Run v2 E4 (D-82): the plate ops checked, in the stored form (upper-case, single spaces).
const PlateVerify = z.object({
  plate: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .transform((v) => v.replace(/\s+/g, " ").toUpperCase()),
  reason: z.string().max(160).nullish(),
  note: z.string().max(2000).nullish(),
});
// Positive money value for a manual fare correction. Constrained to whole cents (matches the
// CreateOrderRequest / MakeOfferRequest contracts) so a sub-cent value can't silently round on the way
// into NUMERIC(10,2) and diverge from the value echoed back to the admin.
const FareAdjust = z.object({
  agreedFare: z.number().positive().max(100000).multipleOf(0.01),
  reason: z.string().min(1).max(160),
  note: z.string().max(2000).nullish(),
});
// Ops manual commission-wallet credit (design Flow 4). `idempotencyKey` is minted when the admin form
// OPENS, so a double-submit is structurally harmless; `amount` is capped server-side; `rail` records
// which off-app channel the rider actually paid on. Reason optional (a top-up isn't a punitive action).
const WalletCredit = z.object({
  amount: z.number().positive().max(1000).multipleOf(0.01),
  rail: z.enum(["ecocash", "innbucks", "omari", "manual"]),
  idempotencyKey: z.string().uuid(),
  note: z.string().max(2000).nullish(),
});

// Admin console v2 §6: an admin reversal (a debit against a biker). Capped per action; the note is required
// (the biker sees it on their receipt); `entryId` optionally names the credit it corrects; the form-open key
// makes a retry harmless.
const WalletReversal = z.object({
  amount: z.number().positive().max(REVERSAL_CAP_USD).multipleOf(0.01),
  reason: z.string().min(1).max(160),
  note: z.string().trim().min(1).max(2000),
  entryId: z.string().uuid().nullish(),
  idempotencyKey: z.string().uuid(),
});

/** `?page=` as a 1-based page number (anything else is page 1). */
function pageOf(page?: string): number {
  const parsed = page != null ? Number.parseInt(page, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 10_000) : 1;
}

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ordersService: AdminOrdersService,
    private readonly ridersService: AdminRidersService,
    private readonly kycReviewService: AdminKycReviewService,
    private readonly customersService: AdminCustomersService,
    private readonly merchantsService: AdminMerchantsService,
    private readonly audit: AdminAuditService,
    private readonly settlements: SettlementsService,
    private readonly sos: SosService,
    private readonly wallet: WalletService,
    private readonly kitchen: AdminKitchenService,
    private readonly auditRead: AdminAuditReadService,
    private readonly search: AdminSearchService,
    private readonly timeline: AdminTimelineService,
    private readonly application: AdminMerchantApplicationService,
    private readonly money: AdminMoneyService,
  ) {}

  /* ── Admin console v2 PR 3: audit viewer, global search, timelines (plan §4, §8) ───────────── */

  /**
   * The audit trail, newest first, keyset-paged (`cursor` from the previous page's `nextCursor`). Filters:
   * `target` (an id), `targetType` (rider|customer|order|merchant|issue|sos), `actor`, `action` (exact, or a
   * family with a trailing dot: `rider.`), `from` / `to` (a Harare day `YYYY-MM-DD`, both inclusive, or an ISO
   * instant), `limit` (default 50, max 100). Read-only.
   */
  @Get("audit")
  auditLog(
    @Query("target") target?: string,
    @Query("targetType") targetType?: string,
    @Query("actor") actor?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditRead.list({ target, targetType, actor, action, from, to, cursor, limit });
  }

  /** The console search box: bikers, customers, merchants, orders and top-ups matching `q`, capped per group. */
  @Get("search")
  searchAll(@Query("q") q?: string) {
    return this.search.search(q);
  }

  /** One person's merged timeline, newest first. `as=customer|rider` picks the side (default: biker if they are one). */
  @Get("people/:profileId/timeline")
  async personTimeline(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Query("cursor") cursor?: string,
    @Query("as") as?: string,
  ) {
    const side = as === "customer" || as === "rider" ? as : undefined;
    const view = await this.timeline.personTimeline(profileId, cursor, side);
    if (!view) throw new NotFoundException("Person not found");
    return view;
  }

  /** A merchant's timeline: order steps, open/close/busy/hours, stock changes and audit rows. */
  @Get("merchants/:id/timeline")
  async merchantTimeline(@Param("id", ParseUUIDPipe) id: string, @Query("cursor") cursor?: string) {
    const view = await this.timeline.merchantTimeline(id, cursor);
    if (!view) throw new NotFoundException("Merchant not found");
    return view;
  }

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  /** Plan §5 C5: ops-only rides-per-active-rider, Express vs Restaurants, over the trailing `?days=`
   *  window (default 14, clamped [1, 90] in the service). NOT a merchant-facing surface. */
  @Get("utilization")
  utilization(@Query("days") days?: string) {
    const parsed = days != null ? Number.parseInt(days, 10) : Number.NaN;
    return this.admin.utilization(Number.isFinite(parsed) ? parsed : undefined);
  }

  /** Cheap sidebar attention badges (KYC backlog / open disputes / un-acked SOS) — rendered shell-wide. */
  @Get("nav-counts")
  navCounts() {
    return this.admin.navCounts();
  }

  /**
   * DS13-05: recent SOS events, newest first — the read-only ops surface that makes SOS no longer
   * write-only (its escalation push may reach zero registered admin devices). Strictly read-only.
   * `?limit=` is clamped to [1, 200] (default 50) in the service. AdminGuard is applied class-wide.
   */
  @Get("sos")
  recentSos(@Query("limit") limit?: string) {
    const parsed = limit != null ? Number.parseInt(limit, 10) : Number.NaN;
    return this.sos.listRecent(Number.isFinite(parsed) ? parsed : undefined);
  }

  /**
   * DS13-05: acknowledge an SOS — the ops write that makes the SOS feed actionable ("someone has this").
   * Idempotent + CAS-guarded in the service; writes an audit row on the null→now transition, attributed
   * to the real operator (`X-Operator`, else the token subject). Returns the updated `{ id, acknowledgedAt }`.
   * AdminGuard is applied class-wide.
   */
  @Post("sos/:id/ack")
  acknowledgeSos(@Param("id", ParseUUIDPipe) id: string, @AdminActor() actor: string) {
    return this.sos.acknowledge(id, actor);
  }

  /** Rider roster / KYC review queue. `?kyc=pending|verified|failed` filters; unknown values are ignored.
   *  First Run v2 E4 (D-82): `?plate=checking` is the plate review queue (also none|verified).
   *  `?page=N` (1-based, default 1) pages through it, 100 rows a page; the pending queue is oldest-first. */
  @Get("riders")
  riders(@Query("kyc") kyc?: string, @Query("plate") plate?: string, @Query("page") page?: string) {
    const filter = kyc && KYC_VALUES.includes(kyc) ? (kyc as KycStatus) : undefined;
    const plateFilter = plate && (Object.values(PlateStatus) as string[]).includes(plate) ? (plate as PlateStatus) : undefined;
    const parsed = page != null ? Number.parseInt(page, 10) : Number.NaN;
    return this.ridersService.listRiders(filter, plateFilter, Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 10_000) : 1);
  }

  /** KYC doc-review detail for one rider (A-02). 404s when the profile isn't a rider. */
  @Get("riders/:profileId/kyc")
  async kycReview(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const review = await this.kycReviewService.getKycReview(profileId);
    if (!review) throw new NotFoundException("Biker not found");
    return review;
  }

  /** Order monitor. `?status=<OrderStatus>` and/or `?type=parcel|merchant` filter; unknown values are
   *  ignored (X1: food-order visibility). */
  @Get("orders")
  orders(@Query("status") status?: string, @Query("type") type?: string) {
    const statusFilter = status && ORDER_STATUS_VALUES.includes(status) ? (status as OrderStatus) : undefined;
    const typeFilter = type && ORDER_TYPE_VALUES.includes(type) ? (type as OrderType) : undefined;
    return this.ordersService.listOrders(statusFilter, typeFilter);
  }

  /** Order detail (D-2): 8-step timeline, parcel, fares, masked people. 404s when not found. */
  @Get("orders/:id")
  async orderDetail(@Param("id", ParseUUIDPipe) id: string) {
    const order = await this.ordersService.getOrderDetail(id);
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /** Order flow v2 (BRIEF §13): the prescription pages on a pharmacy order (signed read URLs). */
  @Get("orders/:id/prescription")
  orderPrescription(@Param("id", ParseUUIDPipe) id: string) {
    return this.ordersService.getPrescriptionPhotos(id);
  }

  /** Rider detail (D-2): stats, strikes, cooldown, bike, recent trips; phone masked off a live order. */
  @Get("riders/:profileId")
  async riderDetail(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const rider = await this.ridersService.getRiderDetail(profileId);
    if (!rider) throw new NotFoundException("Biker not found");
    return rider;
  }

  /** Rider prepaid-wallet view (DOC-16-03): balance + a page of the ledger for the admin wallet UI.
   *  Read-only; the credit action is `POST riders/:id/wallet-credit`. `cursor` (LC-D07) is the last
   *  ledger row id from the previous page — pass it to page further back past the first 20 entries. */
  @Get("riders/:profileId/wallet")
  riderWallet(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    // The cursor is a ledger row id (@db.Uuid): validate it so a malformed ?cursor= is a clean 400, not
    // an unhandled Prisma uuid-cast 500 (same class as the path-param ParseUUIDPipe above).
    @Query("cursor", new ParseUUIDPipe({ optional: true })) cursor?: string,
  ) {
    // Admin console v2 §6: the biker statement — the old wallet view's fields, plus each row's order / top-up,
    // rate and basis, its actor, and a header (free jobs left, pending commission, last top-up).
    return this.money.statement(profileId, cursor);
  }

  /** Customers directory (D-2). `?filter=active|flagged|banned`; unknown values fall back to all. */
  @Get("customers")
  customers(@Query("filter") filter?: string) {
    const f = (CUSTOMER_FILTERS as readonly string[]).includes(filter ?? "")
      ? (filter as (typeof CUSTOMER_FILTERS)[number])
      : undefined;
    return this.customersService.listCustomers(f);
  }

  /** Customer detail (D-2): aggregates + recent orders. 404s when the id isn't a customer. */
  @Get("customers/:profileId")
  async customerDetail(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const customer = await this.customersService.getCustomerDetail(profileId);
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  /** S·2: place a customer on hold (blocks new broadcasts) + reason. Reason required. */
  @Post("customers/:id/hold")
  holdCustomer(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.customersService.holdCustomer(actor, id, body);
  }

  /** S·2: lift a customer hold → active, clearing the reason. Reason optional. */
  @Post("customers/:id/lift")
  liftCustomerHold(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonOptional)) body: z.infer<typeof ReasonOptional>,
    @AdminActor() actor: string,
  ) {
    return this.customersService.liftCustomerHold(actor, id, body);
  }

  /** X1/R-08: lift a food cash-ban → the customer can pay cash for food orders again. Reason optional
   *  (mirrors the hold/lift pair — a lift reverses a flag, it doesn't apply one). */
  @Post("customers/:id/cash-ban-lift")
  liftCashBan(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonOptional)) body: z.infer<typeof ReasonOptional>,
    @AdminActor() actor: string,
  ) {
    return this.customersService.liftCashBan(actor, id, body);
  }

  /**
   * A-01 audit-action write path — every destructive ConfirmModal in the console POSTs here. Records
   * the action server-side (actor = the real operator forwarded as `X-Operator`, else the admin token's
   * subject) and returns `{ id }`. Closes the UI-only seam: audit actions are now actually persisted.
   */
  @Post("audit-actions")
  auditAction(
    @Body(new ZodBody(AuditAction)) body: z.infer<typeof AuditAction>,
    @AdminActor() actor: string,
  ) {
    return this.audit.recordAuditAction(actor, body);
  }

  /* ── A-04 rider account state machine (mutation + audit in one $transaction) ─────────── */

  /** Suspend a rider (accountStatus=suspended + reason). Reason required. */
  @Post("riders/:id/suspend")
  suspendRider(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.ridersService.suspendRider(actor, id, body);
  }

  /** Lift a suspension → active, clearing the suspend reason. Reason optional. */
  @Post("riders/:id/lift")
  liftRider(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonOptional)) body: z.infer<typeof ReasonOptional>,
    @AdminActor() actor: string,
  ) {
    return this.ridersService.liftRider(actor, id, body);
  }

  /** Permanently ban a rider (accountStatus=banned + reason). Reason required. */
  @Post("riders/:id/ban")
  banRider(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.ridersService.banRider(actor, id, body);
  }

  /** Clear an auto reliability hold on an active rider (onHold=false) — the only escape for a rider
   *  the online-gate has locked out of ever earning back the completions that would clear it on their
   *  own. Reason optional, matching `lift`. */
  @Post("riders/:id/clear-hold")
  clearHold(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonOptional)) body: z.infer<typeof ReasonOptional>,
    @AdminActor() actor: string,
  ) {
    return this.ridersService.clearHold(actor, id, body);
  }

  /** First Run v2 E4 (D-82): confirm the bike plate a rider saved (plate_status checking → verified).
   *  `plate` is the plate ops looked at; if the rider changed it since, 409. */
  @Post("riders/:id/plate-verify")
  verifyPlate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(PlateVerify)) body: z.infer<typeof PlateVerify>,
    @AdminActor() actor: string,
  ) {
    return this.ridersService.verifyPlate(actor, id, body);
  }

  /* ── Order admin actions (mutation + event + audit in one $transaction) ──────────────── */

  /** Admin-cancel an order (status→cancelled, cancelledBy=admin, reason). Reason required. */
  @Post("orders/:id/cancel")
  cancelOrder(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.ordersService.cancelOrder(actor, id, body);
  }

  /** Adjust an order's agreed fare (manual correction / dispute). Reason required. */
  @Post("orders/:id/fare")
  adjustFare(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(FareAdjust)) body: z.infer<typeof FareAdjust>,
    @AdminActor() actor: string,
  ) {
    return this.ordersService.adjustFare(actor, id, body);
  }

  /** KB-POD-DISPUTE Phase B: adjudicate a rider-raised `undelivered` order as DELIVERED despite a
   *  withheld delivery code (ops decision on the proof-of-drop evidence). Force-completes + credits the
   *  rider + charges commission + audits. Ops-only (AdminGuard on the controller). Reason required. */
  @Post("orders/:id/adjudicate-delivered")
  adjudicateDelivered(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.ordersService.adjudicateDelivered(actor, id, body);
  }

  /* ── X1: merchant directory + support dispute queue ──────────────────────────────────────── */

  /** Merchant directory (X1): order volume + open collect-and-return debt per merchant.
   *  `filter=awaiting_go_live` (restaurants not switched on yet — the ops queue) or `filter=shops`
   *  (merchant web upgrade L1). */
  @Get("merchants")
  merchants(@Query("filter") filter?: string, @Query("status") status?: string) {
    // Admin console v2 §5: `status` is the application queue; an unknown value is ignored (the directory).
    const s = (MERCHANT_APPLICATION_STATUSES as readonly string[]).includes(status ?? "") ? (status as (typeof MERCHANT_APPLICATION_STATUSES)[number]) : undefined;
    return this.merchantsService.listMerchants(filter, s);
  }

  /** Admin console v2 §5: the application — a data-backed checklist, the licence, calls and the open actions. */
  @Get("merchants/:id/application")
  merchantApplication(@Param("id", ParseUUIDPipe) id: string) {
    return this.application.getApplication(id);
  }

  /** Admin console v2 §5: accept time, missed orders, prep vs promised, out of stock, hours, rating, debt. */
  @Get("merchants/:id/metrics")
  merchantMetrics(@Param("id", ParseUUIDPipe) id: string) {
    return this.application.getMetrics(id);
  }

  /** Log an ops call (reached / no answer). Audited; a call that reached someone ticks the checklist. */
  @Post("merchants/:id/application/call")
  logMerchantCall(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(LogMerchantCall)) body: z.infer<typeof LogMerchantCall>,
    @AdminActor() actor: string,
  ) {
    return this.application.logCall(actor, id, body);
  }

  /** Record a pharmacy's licence (number, pharmacist, where the copy is). Clears a verification it changes. */
  @Post("merchants/:id/application/licence")
  recordMerchantLicence(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(RecordMerchantLicence)) body: z.infer<typeof RecordMerchantLicence>,
    @AdminActor() actor: string,
  ) {
    return this.application.recordLicence(actor, id, body);
  }

  /** Mark the recorded pharmacy licence verified. Reason required. */
  @Post("merchants/:id/application/licence/verify")
  verifyMerchantLicence(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.application.verifyLicence(actor, id, body);
  }

  /** Move an application: review · approve (every required check ✅) · reject (a merchant-readable code) ·
   *  go_live (from approved) · suspend / resume. Reason required; audited with before/after. */
  @Post("merchants/:id/application/:action")
  moveMerchantApplication(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    if (!(APPLICATION_ACTIONS as readonly string[]).includes(action)) throw new NotFoundException("Unknown action");
    return this.application.transition(actor, id, action as ApplicationAction, body);
  }

  /** Merchant detail (X1): profile + recent orders + a page of the merchant's own debt-ledger trail.
   *  404s when the id isn't a merchant. `debtCursor` (LC-D-T1) is the last debt-ledger row id from the
   *  previous page — pass it to page further back past the first 30 entries. */
  @Get("merchants/:id")
  async merchantDetail(
    @Param("id", ParseUUIDPipe) id: string,
    // The debt-ledger cursor is a @db.Uuid row id: validate it so a malformed ?debtCursor= is a clean
    // 400, not an unhandled Prisma uuid-cast 500 (same class as the path-param ParseUUIDPipe above).
    @Query("debtCursor", new ParseUUIDPipe({ optional: true })) debtCursor?: string,
  ) {
    const merchant = await this.merchantsService.getMerchantDetail(id, debtCursor);
    if (!merchant) throw new NotFoundException("Merchant not found");
    return merchant;
  }

  /** The go-live switch (merchant web upgrade L1): the only writer of `pilotEnabled`, audit-logged.
   *  Refuses shops (they open with LyniaGo Shops) and a restaurant with no pin or no live dish. */
  @Post("merchants/:id/pilot")
  setMerchantPilot(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(SetMerchantPilot)) body: z.infer<typeof SetMerchantPilot>,
    @AdminActor() actor: string,
  ) {
    return this.merchantsService.setPilot(actor, id, body);
  }

  /** Hand a business to another person (merchant web upgrade L4): after support's identity check, by the
   *  new owner's phone, with a required note. The old owner stays on as Staff. Audit-logged. */
  @Post("merchants/:id/owner")
  transferMerchantOwner(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(TransferMerchantOwnerRequest)) body: TransferMerchantOwnerRequest,
    @AdminActor() actor: string,
  ) {
    return this.merchantsService.transferOwner(actor, id, body);
  }

  /* ── Auto-accept: the ops call list (docs/plans/2026-09-30-restaurant-auto-accept.md) ──────────── */

  /** Auto-accepted orders the kitchen hasn't confirmed yet — ops phones each restaurant. Urgent first. */
  @Get("kitchen-confirmations")
  kitchenConfirmations() {
    return this.kitchen.listToConfirm();
  }

  /** The restaurant confirmed on the phone: a rider may now be sent. */
  @Post("orders/:id/kitchen-confirm")
  confirmKitchen(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(OptionalNote)) body: z.infer<typeof OptionalNote>,
    @AdminActor() actor: string,
  ) {
    return this.kitchen.confirm(actor, id, body.note);
  }

  /** Nobody answered at the restaurant: logged on the order; call again. */
  @Post("orders/:id/kitchen-no-answer")
  kitchenNoAnswer(@Param("id", ParseUUIDPipe) id: string, @AdminActor() actor: string) {
    return this.kitchen.logNoAnswer(actor, id);
  }

  /** Change a food order's items as agreed by phone (before pickup). The customer is told the new total. */
  @Post("orders/:id/edit-items")
  editOrderItems(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(EditMerchantOrderItemsRequest)) body: EditMerchantOrderItemsRequest,
    @AdminActor() actor: string,
  ) {
    return this.kitchen.editItems(actor, id, body);
  }

  /** Take orders automatically / show the restaurant's number to customers, set by ops on its behalf. */
  @Post("merchants/:id/order-settings")
  setMerchantOrderSettings(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(SetMerchantOrderSettings)) body: z.infer<typeof SetMerchantOrderSettings>,
    @AdminActor() actor: string,
  ) {
    return this.kitchen.setOrderSettings(actor, id, body);
  }

  /** Support dispute queue (X1): R-05 frozen doorstep handshakes needing `resolve-handshake`, N-12
   *  refund-overdue visibility (Q6 mocked default — escalation is visibility only, no penalty), and D3's
   *  merchant non-return reports (open debts flagged for support; `write-off-debt` closes one). */
  @Get("merchant-disputes")
  merchantDisputes() {
    return this.merchantsService.listDisputes();
  }

  /** R-05 admin dispute resolution — the only lever out of a frozen doorstep handshake. Reason
   *  required (an override of a money mismatch is always justified in the audit trail). */
  @Post("orders/:id/resolve-handshake")
  resolveHandshake(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.merchantsService.resolveHandshake(actor, id, body);
  }

  /** D3 (2026-10-07, MJ-RH1): the only write-off of a food debt — an admin, reason required, after
   *  support followed up a merchant's non-return report. Suspending the rider is the separate rider action. */
  @Post("orders/:id/write-off-debt")
  writeOffDebt(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.merchantsService.writeOffDebt(actor, id, body);
  }

  /* ── Commission (prepaid per-ride, delegated to SettlementsService) ──────────────────────── */

  /**
   * Read-only commission overview in the console's `CommissionOverview` shape: current rate (0% at
   * launch), ride volume and the commission that would accrue at that rate. The prepaid model has no
   * weekly billing, record-payment or auto-pause — those were removed with the old cash-settlement
   * engine; the prepaid wallet (top-ups + per-ride deduction) is a later build.
   */
  @Get("cash/settlements")
  cashSettlements() {
    // Pass the SERVER-RESOLVED live rate (the env "flip" value), not the bundled constant, so the
    // console's rate + accrued figures track production once commission is switched on.
    return this.settlements.commissionOverview(new Date(), this.wallet.ratePct);
  }

  /**
   * Ops records an off-app rider payment as a commission-wallet credit (design Flow 4 — the launch rail
   * for InnBucks/O'mari and the EcoCash fallback). Idempotent by the form-open key; amount capped
   * server-side; the actor is recorded on the ledger row for the audit trail.
   */
  @Post("riders/:id/wallet-credit")
  creditWallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(WalletCredit)) body: z.infer<typeof WalletCredit>,
    @AdminActor() actor: string,
  ) {
    return this.wallet.creditManual({
      riderId: id,
      amount: body.amount,
      rail: body.rail,
      note: body.note ?? undefined,
      idemKey: body.idempotencyKey,
      actorProfileId: actor,
    });
  }

  /* ── Admin console v2 §6: top-ups, money panel, money owed, reversal ───────────────────────────── */

  /** Every top-up intent, newest first, 50 a page. `?filter=` is a status or an open anomaly
   *  (short_paid | paid_on_declined); unknown values list everything. */
  @Get("cash/topups")
  topups(@Query("filter") filter?: string, @Query("page") page?: string) {
    const f = filter && (TOPUP_FILTERS as readonly string[]).includes(filter) ? (filter as TopupFilter) : undefined;
    return this.money.listTopups(f, pageOf(page));
  }

  /** Ask Paynow about one top-up now (the sweep's own path). Reason required; audited. */
  @Post("topups/:id/repoll")
  repollTopup(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.money.repollTopup(actor, id, body);
  }

  /** Credit what Paynow reported paid on a short-paid / paid-on-declined top-up. Exactly once per top-up. */
  @Post("topups/:id/credit-paid")
  creditPaidTopup(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.money.creditTopupShortfall(actor, id, body);
  }

  /** Close a top-up anomaly without crediting it. Reason required; audited. */
  @Post("topups/:id/resolve")
  resolveTopup(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(ReasonRequired)) body: z.infer<typeof ReasonRequired>,
    @AdminActor() actor: string,
  ) {
    return this.money.resolveTopupAnomaly(actor, id, body);
  }

  /** The platform money panel by Harare day: `?days=7` (default) or `30`. */
  @Get("cash/money")
  moneyPanel(@Query("days") days?: string) {
    return this.money.moneyPanel(days === "30" ? 30 : 7);
  }

  /** The same days as CSV. */
  @Get("cash/money/csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="lynia-money.csv"')
  moneyCsv(@Query("days") days?: string) {
    return this.money.moneyCsv(days === "30" ? 30 : 7);
  }

  /** Bikers with a negative balance (money owed), the longest-owing first. */
  @Get("cash/owed")
  owed() {
    return this.money.owed();
  }

  /** An admin correction against a biker: a capped `reversal`, reason + note required, audited with the
   *  before / after balance. */
  @Post("riders/:id/wallet-reversal")
  reverseWallet(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(WalletReversal)) body: z.infer<typeof WalletReversal>,
    @AdminActor() actor: string,
  ) {
    return this.money.reverse(actor, id, body);
  }
}
