import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AdvanceStatusRequest, CancelRequest, ConfirmDeliveryRequest, ConfirmItemsRequest, MarkUndeliveredRequest, RateRequest, RateSenderRequest } from "@lynia/shared";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OrderLifecycleService } from "./order-lifecycle.service";

// Local zod body like riders.controller.ts's `Become` — a rider-only additive endpoint old clients
// never call, so no shared-contract change is needed (the wire stays a pure superset). The key length
// bound matches the KYC photoUrl cap.
const AttachPickupPhotoRequest = z.object({ key: z.string().min(1).max(256) });

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

  /** Rider ticks off the sender's items at pickup (pickup item verification). Persists the collected
   *  set; the rider's next tap advances to picked_up. */
  @Post("items/confirm")
  confirmItems(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(ConfirmItemsRequest)) body: ConfirmItemsRequest,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.confirmItems(orderId, riderId, body.confirmedIndexes);
  }

  /** Rider attaches the optional proof-of-pickup photo (§5c) — the already-uploaded object key from
   *  POST /uploads/pickup-photo. Never gates the collect; idempotent (re-attaching replaces). */
  @Post("pickup-photo")
  attachPickupPhoto(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(AttachPickupPhotoRequest)) body: z.infer<typeof AttachPickupPhotoRequest>,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.attachPickupPhoto(orderId, riderId, body.key);
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

  /** Rider marks a hand-off as failed → terminal `undelivered` (C6/F-02). Allowed only post-pickup. */
  @Post("undelivered")
  undelivered(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MarkUndeliveredRequest)) body: MarkUndeliveredRequest,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.markUndelivered(orderId, riderId, body.reason);
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

  /** Rider rates the sender (rider-journey 4·7) — recorded-only, doesn't change the order status. */
  @Post("sender-rating")
  rateSender(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(RateSenderRequest)) body: RateSenderRequest,
    @CurrentUser() riderId: string,
  ) {
    return this.lifecycle.rateSender(orderId, riderId, body.score, body.comment);
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
