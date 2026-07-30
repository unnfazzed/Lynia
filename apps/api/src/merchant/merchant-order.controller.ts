import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ConfirmMerchantPickupRequest,
  ConfirmMerchantReturnedCashRequest,
  MerchantAcceptOrderRequest,
  MerchantConfirmPaymentRequest,
  MerchantRejectOrderRequest,
  MerchantReleaseUnpaidRequest,
  MerchantRequestPaymentRequest,
  RefundMerchantOrderRequest,
  ReportMerchantNonReturnRequest,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { FoodDebtService } from "./food-debt.service";
import { FoodDispatchService } from "./food-dispatch.service";
import { FoodOrderService } from "./food-order.service";
import { MerchantGuard } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Merchant kitchen-side food order lifecycle (Lane C, C2) + food dispatch (C3) + the money evidence
 * layer (C4). Every route requires a merchant JWT (MerchantGuard) EXCEPT `confirm-pickup`, the
 * `dispatch/*` rider actions, and the C4 rider-side doorstep/handshake actions, which are the
 * assigned/candidate RIDER's own actions (N-16, N-08, R-04/N-10) — checked inside the service by
 * caller-id comparison, not by role, mirroring how order-lifecycle.service.ts's confirmDelivery needs
 * no MerchantGuard-shaped role gate either.
 */
@Controller("merchant/orders")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class MerchantOrderController {
  constructor(
    private readonly foodOrders: FoodOrderService,
    private readonly dispatch: FoodDispatchService,
    private readonly debt: FoodDebtService,
  ) {}

  @Get()
  @UseGuards(MerchantGuard)
  listQueue(@CurrentUser() profileId: string) {
    return this.foodOrders.listQueue(profileId);
  }

  @Get(":orderId")
  @UseGuards(MerchantGuard)
  getOrder(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.getQueueOrder(profileId, orderId);
  }

  @Post(":orderId/accept")
  @UseGuards(MerchantGuard)
  accept(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MerchantAcceptOrderRequest)) body: MerchantAcceptOrderRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.acceptOrder(profileId, orderId, body);
  }

  @Post(":orderId/reject")
  @UseGuards(MerchantGuard)
  reject(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MerchantRejectOrderRequest)) body: MerchantRejectOrderRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.rejectOrder(profileId, orderId, body.reason);
  }

  @Post(":orderId/log-call")
  @UseGuards(MerchantGuard)
  logCall(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.logCall(profileId, orderId);
  }

  @Post(":orderId/request-payment")
  @UseGuards(MerchantGuard)
  requestPayment(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MerchantRequestPaymentRequest)) body: MerchantRequestPaymentRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.requestPayment(profileId, orderId, body.overrideCallLog ?? false);
  }

  @Post(":orderId/confirm-payment")
  @UseGuards(MerchantGuard)
  confirmPayment(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MerchantConfirmPaymentRequest)) body: MerchantConfirmPaymentRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.confirmPayment(profileId, orderId, body);
  }

  @Post(":orderId/release-unpaid")
  @UseGuards(MerchantGuard)
  releaseUnpaid(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MerchantReleaseUnpaidRequest)) body: MerchantReleaseUnpaidRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.releaseUnpaid(profileId, orderId, body.reason);
  }

  @Post(":orderId/mark-ready")
  @UseGuards(MerchantGuard)
  markReady(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.markReady(profileId, orderId);
  }

  // N-16: the assigned RIDER's action, not the merchant's — no MerchantGuard (see class docstring).
  @Post(":orderId/confirm-pickup")
  confirmPickup(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ConfirmMerchantPickupRequest)) body: ConfirmMerchantPickupRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.confirmPickup(orderId, profileId, body.code);
  }

  // ── C3: food dispatch — rider actions (the candidate/assigned rider, no MerchantGuard) ────────────

  @Post(":orderId/dispatch/accept")
  acceptDispatch(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.dispatch.acceptDispatch(orderId, profileId);
  }

  @Post(":orderId/dispatch/decline")
  declineDispatch(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.dispatch.declineDispatch(orderId, profileId);
  }

  // D-33: pre-pickup only, enforced inside the service.
  @Post(":orderId/dispatch/drop")
  dropDispatch(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.dispatch.dropDispatch(orderId, profileId);
  }

  // ── C3: food dispatch — merchant D-34 hold-screen decisions ─────────────────────────────────────

  @Post(":orderId/dispatch/resume")
  @UseGuards(MerchantGuard)
  resumeDispatch(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.dispatch.resumeSearch(profileId, orderId);
  }

  @Post(":orderId/dispatch/cancel")
  @UseGuards(MerchantGuard)
  cancelDispatch(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.dispatch.cancelFromHold(profileId, orderId);
  }

  // ── C4: doorstep handshake + failure paths — the assigned RIDER's own actions, no MerchantGuard ───

  @Get(":orderId/mine")
  getAsRider(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.getAsRider(orderId, profileId);
  }

  @Post(":orderId/cash/rider-confirm")
  confirmRiderCash(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.confirmRiderCash(orderId, profileId);
  }

  @Post(":orderId/cash/dispute")
  disputeCash(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.disputeCash(orderId, profileId);
  }

  @Post(":orderId/doorstep/log-call")
  logDoorstepCall(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.logDoorstepCall(orderId, profileId);
  }

  @Post(":orderId/doorstep/no-show")
  reportNoShow(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.reportNoShow(orderId, profileId);
  }

  @Post(":orderId/doorstep/refused")
  reportCustomerRefused(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.reportCustomerRefused(orderId, profileId);
  }

  // ── C4: merchant debt settlement + refund ───────────────────────────────────────────────────────

  @Post(":orderId/debt/confirm-cash")
  @UseGuards(MerchantGuard)
  confirmReturnedCash(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ConfirmMerchantReturnedCashRequest)) body: ConfirmMerchantReturnedCashRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.debt.confirmReturnedCash(profileId, orderId, body.amount);
  }

  @Post(":orderId/debt/confirm-goods")
  @UseGuards(MerchantGuard)
  confirmGoodsReturned(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.confirmGoodsReturned(profileId, orderId);
  }

  @Post(":orderId/debt/report-non-return")
  @UseGuards(MerchantGuard)
  reportNonReturn(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ReportMerchantNonReturnRequest)) body: ReportMerchantNonReturnRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.debt.reportNonReturn(profileId, orderId, body.note);
  }

  @Post(":orderId/refund")
  @UseGuards(MerchantGuard)
  refundOrder(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RefundMerchantOrderRequest)) body: RefundMerchantOrderRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.debt.refundOrder(profileId, orderId, body.reference, body.amount);
  }
}
