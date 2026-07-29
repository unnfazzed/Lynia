import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ConfirmMerchantPickupRequest,
  MerchantAcceptOrderRequest,
  MerchantConfirmPaymentRequest,
  MerchantRejectOrderRequest,
  MerchantReleaseUnpaidRequest,
  MerchantRequestPaymentRequest,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { FoodDispatchService } from "./food-dispatch.service";
import { FoodOrderService } from "./food-order.service";
import { MerchantGuard } from "./merchant.guard";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Merchant kitchen-side food order lifecycle (Lane C, C2) + food dispatch (C3). Every route requires
 * a merchant JWT (MerchantGuard) EXCEPT `confirm-pickup` and the `dispatch/*` rider actions, which
 * are the assigned/candidate RIDER's own actions (N-16, N-08) — checked inside the service by
 * caller-id comparison, not by role, mirroring how order-lifecycle.service.ts's confirmDelivery needs
 * no MerchantGuard-shaped role gate either.
 */
@Controller("merchant/orders")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class MerchantOrderController {
  constructor(
    private readonly foodOrders: FoodOrderService,
    private readonly dispatch: FoodDispatchService,
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
}
