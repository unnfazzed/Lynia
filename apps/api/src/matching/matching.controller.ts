import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { MatchingService, type SelectResult } from "./matching.service";

// Guarded: selection assigns the order and returns the one-time delivery code — only the
// authenticated customer may call it (without this, x-user-id spoofing hijacks orders + steals the OTP).
@Controller("orders/:orderId/offers/:offerId")
@UseGuards(JwtAuthGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  /** Customer selects this offer; assignment is the guarded CAS (ET1/ET2/ET3). */
  @Post("select")
  async select(
    @Param("orderId", ParseUUIDPipe) orderId: string,
    @Param("offerId", ParseUUIDPipe) offerId: string,
    @CurrentUser() customerId: string,
  ): Promise<SelectResult> {
    return this.matching.selectOffer(orderId, offerId, customerId);
  }
}
