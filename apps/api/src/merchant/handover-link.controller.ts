import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { HandoverLinkConfirmRequest } from "@lynia/shared";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { FoodOrderService } from "./food-order.service";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Merchant v2 (ledger D-77): the offline-rider hand-over fallback's public side. A rider who can't use the
 * app opens the signed link the counter sent them (`<merchant web>/h?t=<token>`) and types the pickup code
 * the counter reads out. No login: the token is the authority (signed, 15-minute, bound to the order's
 * current rider and pickup code), and the code is checked exactly as in the app, with the same attempt
 * cap. Both routes are throttled per IP.
 */
@Controller("handover")
@UseGuards(RestaurantsEnabledGuard)
export class HandoverLinkController {
  constructor(private readonly foodOrders: FoodOrderService) {}

  @Get(":token")
  @Throttle({ limit: 30, windowSec: 300, keyPrefix: "handover-link-read" })
  info(@Param("token") token: string) {
    return this.foodOrders.handoverLinkInfo(token);
  }

  @Post(":token/confirm")
  @Throttle({ limit: 10, windowSec: 300, keyPrefix: "handover-link-confirm" })
  confirm(@Param("token") token: string, @Body(new ZodBody(HandoverLinkConfirmRequest)) body: HandoverLinkConfirmRequest) {
    return this.foodOrders.confirmHandoverLink(token, body.code);
  }
}
