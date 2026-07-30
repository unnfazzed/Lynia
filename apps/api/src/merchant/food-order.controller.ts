import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ApproveMerchantOrderItemsRequest,
  PlaceMerchantOrderRequest,
  SubmitMerchantPaymentReferenceRequest,
} from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Customer-facing food order lifecycle (Lane C, C2/C4). Sits alongside RestaurantsController under
 * the same `restaurants` prefix — same guard chain (RestaurantsEnabledGuard first, fail-safe OFF). No
 * MerchantGuard: every route here is driven by the CUSTOMER who placed the order, checked inside
 * FoodOrderService (findOwnAsCustomer) / FoodDebtService, not by role.
 */
@Controller("restaurants")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class FoodOrderController {
  constructor(
    private readonly foodOrders: FoodOrderService,
    private readonly debt: FoodDebtService,
  ) {}

  @Post(":merchantId/orders")
  placeOrder(
    @Param("merchantId", ParseUUIDPipe) merchantId: string,
    @Body(new ZodBody(PlaceMerchantOrderRequest)) body: PlaceMerchantOrderRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.placeOrder(profileId, merchantId, body);
  }

  @Get("orders/:orderId")
  getOrder(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.getMyOrder(orderId, profileId);
  }

  // D-23: one endpoint, `approve` carries the customer's choice — mirrors approve/decline being the
  // same decision surfaced twice in the design (5·b "one item unavailable").
  @Post("orders/:orderId/items-response")
  respondToItems(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ApproveMerchantOrderItemsRequest)) body: ApproveMerchantOrderItemsRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.approveItems(orderId, profileId, body.approve);
  }

  @Post("orders/:orderId/cancel")
  cancelUnpaid(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.foodOrders.cancelUnpaid(orderId, profileId);
  }

  @Post("orders/:orderId/payment-reference")
  submitPaymentReference(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(SubmitMerchantPaymentReferenceRequest)) body: SubmitMerchantPaymentReferenceRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.foodOrders.submitPaymentReference(orderId, profileId, body.reference);
  }

  // ── C4: doorstep handshake, customer side (R-04 "food first" — always first) ───────────────────────

  @Post("orders/:orderId/cash/customer-confirm")
  confirmCustomerCash(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() profileId: string) {
    return this.debt.confirmCustomerCash(orderId, profileId);
  }
}
