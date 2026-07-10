import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { KycStatus, OrderStatus } from "@lynia/shared";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminActor } from "../common/admin-actor.decorator";
import { ZodBody } from "../common/zod.pipe";
import { SettlementsService } from "../settlements/settlements.service";
import { AdminAuditService } from "./admin-audit.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminOrdersService } from "./admin-orders.service";
import { AdminRidersService } from "./admin-riders.service";
import { AdminService } from "./admin.service";

const KYC_VALUES = Object.values(KycStatus) as string[];
const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];
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
const ReasonOptional = z.object({
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
@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly ordersService: AdminOrdersService,
    private readonly ridersService: AdminRidersService,
    private readonly customersService: AdminCustomersService,
    private readonly audit: AdminAuditService,
    private readonly settlements: SettlementsService,
  ) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  /** Rider roster / KYC review queue. `?kyc=pending|verified|failed` filters; unknown values are ignored. */
  @Get("riders")
  riders(@Query("kyc") kyc?: string) {
    const filter = kyc && KYC_VALUES.includes(kyc) ? (kyc as KycStatus) : undefined;
    return this.ridersService.listRiders(filter);
  }

  /** KYC doc-review detail for one rider (A-02). 404s when the profile isn't a rider. */
  @Get("riders/:profileId/kyc")
  async kycReview(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const review = await this.ridersService.getKycReview(profileId);
    if (!review) throw new NotFoundException("Rider not found");
    return review;
  }

  /** Order monitor. `?status=<OrderStatus>` filters; unknown values are ignored. */
  @Get("orders")
  orders(@Query("status") status?: string) {
    const filter = status && ORDER_STATUS_VALUES.includes(status) ? (status as OrderStatus) : undefined;
    return this.ordersService.listOrders(filter);
  }

  /** Order detail (D-2): 8-step timeline, parcel, fares, masked people. 404s when not found. */
  @Get("orders/:id")
  async orderDetail(@Param("id", ParseUUIDPipe) id: string) {
    const order = await this.ordersService.getOrderDetail(id);
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /** Rider detail (D-2): stats, strikes, cooldown, bike, recent trips; phone masked off a live order. */
  @Get("riders/:profileId")
  async riderDetail(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const rider = await this.ridersService.getRiderDetail(profileId);
    if (!rider) throw new NotFoundException("Rider not found");
    return rider;
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

  /* ── Commission (prepaid per-ride, delegated to SettlementsService) ──────────────────────── */

  /**
   * Read-only commission overview in the console's `CommissionOverview` shape: current rate (0% at
   * launch), ride volume and the commission that would accrue at that rate. The prepaid model has no
   * weekly billing, record-payment or auto-pause — those were removed with the old cash-settlement
   * engine; the prepaid wallet (top-ups + per-ride deduction) is a later build.
   */
  @Get("cash/settlements")
  cashSettlements() {
    return this.settlements.commissionOverview();
  }
}
