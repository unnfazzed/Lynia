import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { MakeOfferRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OffersService } from "./offers.service";

// orderId comes from the path, so the body omits it.
const MakeOfferBody = MakeOfferRequest.omit({ orderId: true });

// Guarded: make-offer attributes the offer to the caller (rider) and the list exposes rider PII —
// both must be the authenticated user, not a spoofable x-user-id header.
@Controller("orders/:orderId/offers")
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post()
  make(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Body(new ZodBody(MakeOfferBody)) body: Omit<MakeOfferRequest, "orderId">,
    @CurrentUser() riderId: string,
  ) {
    return this.offers.makeOffer({ ...body, orderId }, riderId);
  }

  @Get()
  list(@Param("orderId", ParseUUIDPipe) orderId: string) {
    return this.offers.listForOrder(orderId);
  }
}
