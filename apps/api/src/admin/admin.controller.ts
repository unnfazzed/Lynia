import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { KycStatus, OrderStatus } from "@lynia/shared";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { AdminService } from "./admin.service";

const KYC_VALUES = Object.values(KycStatus) as string[];
const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];
const CUSTOMER_FILTERS = ["active", "flagged", "banned"] as const;

// A-01 audit-action payload (mirrors submitAdminAction in apps/admin). action + target are required;
// reasonCode + note are the ConfirmModal justification (nullable — some actions carry neither). Capped,
// not enum-bound, so the admin's reason-code taxonomy can evolve without 400ing the audit write.
const AuditAction = z.object({
  action: z.string().min(1).max(80),
  target: z.string().min(1).max(200),
  reasonCode: z.string().max(160).nullish(),
  note: z.string().max(2000).nullish(),
});

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview() {
    return this.admin.overview();
  }

  /** Rider roster / KYC review queue. `?kyc=pending|verified|failed` filters; unknown values are ignored. */
  @Get("riders")
  riders(@Query("kyc") kyc?: string) {
    const filter = kyc && KYC_VALUES.includes(kyc) ? (kyc as KycStatus) : undefined;
    return this.admin.listRiders(filter);
  }

  /** KYC doc-review detail for one rider (A-02). 404s when the profile isn't a rider. */
  @Get("riders/:profileId/kyc")
  async kycReview(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const review = await this.admin.getKycReview(profileId);
    if (!review) throw new NotFoundException("Rider not found");
    return review;
  }

  /** Order monitor. `?status=<OrderStatus>` filters; unknown values are ignored. */
  @Get("orders")
  orders(@Query("status") status?: string) {
    const filter = status && ORDER_STATUS_VALUES.includes(status) ? (status as OrderStatus) : undefined;
    return this.admin.listOrders(filter);
  }

  /** Order detail (D-2): 8-step timeline, parcel, fares, masked people. 404s when not found. */
  @Get("orders/:id")
  async orderDetail(@Param("id", ParseUUIDPipe) id: string) {
    const order = await this.admin.getOrderDetail(id);
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /** Rider detail (D-2): stats, strikes, cooldown, bike, recent trips; phone masked off a live order. */
  @Get("riders/:profileId")
  async riderDetail(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const rider = await this.admin.getRiderDetail(profileId);
    if (!rider) throw new NotFoundException("Rider not found");
    return rider;
  }

  /** Customers directory (D-2). `?filter=active|flagged|banned`; unknown values fall back to all. */
  @Get("customers")
  customers(@Query("filter") filter?: string) {
    const f = (CUSTOMER_FILTERS as readonly string[]).includes(filter ?? "")
      ? (filter as (typeof CUSTOMER_FILTERS)[number])
      : undefined;
    return this.admin.listCustomers(f);
  }

  /** Customer detail (D-2): aggregates + recent orders. 404s when the id isn't a customer. */
  @Get("customers/:profileId")
  async customerDetail(@Param("profileId", ParseUUIDPipe) profileId: string) {
    const customer = await this.admin.getCustomerDetail(profileId);
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  /**
   * A-01 audit-action write path — every destructive ConfirmModal in the console POSTs here. Records
   * the action server-side (actor = the authenticated admin) and returns `{ id }`. Closes the UI-only
   * seam: audit actions are now actually persisted and queryable.
   */
  @Post("audit-actions")
  auditAction(
    @Body(new ZodBody(AuditAction)) body: z.infer<typeof AuditAction>,
    @CurrentUser() actor: string,
  ) {
    return this.admin.recordAuditAction(actor, body);
  }
}
