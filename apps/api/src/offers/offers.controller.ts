import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { MakeOfferRequest } from "@lynia/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { OffersService } from "./offers.service";

// orderId comes from the path, so the body omits it.
const MakeOfferBody = MakeOfferRequest.omit({ orderId: true });

@Controller("orders/:orderId/offers")
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
