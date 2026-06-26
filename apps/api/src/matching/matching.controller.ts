import { Controller, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { MatchingService, type SelectResult } from "./matching.service";

@Controller("orders/:orderId/offers/:offerId")
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
