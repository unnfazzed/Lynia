import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AdvanceStatusRequest, CancelRequest, ConfirmDeliveryRequest, RateRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OrderLifecycleService } from "./order-lifecycle.service";

/** Post-assignment delivery lifecycle. Authority is derived in the service: the rider drives the
 *  forward steps, the customer rates and re-issues the code. */
@Controller("orders/:orderId")
@UseGuards(JwtAuthGuard)
export class LifecycleController {
  constructor(private readonly lifecycle: OrderLifecycleService) {}

  /** Rider advances one step: confirmed → en_route_pickup → picked_up → en_route_dropoff. */
  @Post("status")
  advance(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(AdvanceStatusRequest)) body: AdvanceStatusRequest,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.advance(orderId, riderId, body.to);
  }

  /** Rider confirms the handover with the recipient's delivery code → delivered. */
  @Post("deliver")
  deliver(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ConfirmDeliveryRequest)) body: ConfirmDeliveryRequest,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.confirmDelivery(orderId, riderId, body.code);
  }

  /** Customer rates the rider → completed. */
  @Post("rating")
  rate(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RateRequest)) body: RateRequest,
    @CurrentUser() customerId: string,
  ) {
    return this.lifecycle.rate(orderId, customerId, body.score, body.comment);
  }

  /** Customer re-issues the delivery code (after a lockout or a lost code). */
  @Post("delivery-code/rotate")
  rotate(@Param("orderId", ParseUUIDPipe) orderId: string, @CurrentUser() customerId: string) {
    return this.lifecycle.rotateDeliveryCode(orderId, customerId);
  }

  /** Either party cancels an in-flight order (a rider cancel is a no-show strike). */
  @Post("cancel")
  cancel(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(CancelRequest)) body: CancelRequest,
    @CurrentUser() callerId: string,
  ) {
    return this.lifecycle.cancel(orderId, callerId, body.reason);
  }
}
