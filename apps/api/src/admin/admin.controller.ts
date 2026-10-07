import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { EditMerchantOrderItemsRequest, KycStatus, OrderStatus, OrderType, PlateStatus, TransferMerchantOwnerRequest } from "@lynia/shared";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { SettlementsService } from "../settlements/settlements.service";
import { SosService } from "../sos/sos.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminKitchenService } from "./admin-kitchen.service";
import { AdminKycReviewService } from "./admin-kyc-review.service";
import { AdminMerchantsService } from "./admin-merchants.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminRidersService } from "./admin-riders.service";
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
  ) {}

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
   *  First Run v2 E4 (D-82): `?plate=checking` is the plate review queue (also none|verified). */
  @Get("riders")
  riders(@Query("kyc") kyc?: string, @Query("plate") plate?: string) {
    const filter = kyc && KYC_VALUES.includes(kyc) ? (kyc as KycStatus) : undefined;
    const plateFilter = plate && (Object.values(PlateStatus) as string[]).includes(plate) ? (plate as PlateStatus) : undefined;
    return this.ridersService.listRiders(filter, plateFilter);
  }

  /** KYC doc-review detail for one rider (A-02). 404s when the profile isn't a rider. */
  @Get("riders/:profileId/kyc")
  async kycReview(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const review = await this.kycReviewService.getKycReview(profileId);
    if (!review) throw new NotFoundException("Rider not found");
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
    if (!rider) throw new NotFoundException("Rider not found");
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
    return this.ridersService.walletView(profileId, cursor);
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
  merchants(@Query("filter") filter?: string) {
    return this.merchantsService.listMerchants(filter);
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

  /** Support dispute queue (X1): R-05 frozen doorstep handshakes needing `resolve-handshake`, plus
   *  N-12 refund-overdue visibility (Q6 mocked default — escalation is visibility only, no penalty). */
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
}
