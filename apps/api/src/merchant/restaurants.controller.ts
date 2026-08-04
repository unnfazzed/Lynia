import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MerchantService } from "./merchant.service";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Customer-facing restaurant read API (D1 "Restaurants near you" / browse). Gated on
 * RestaurantsEnabledGuard (global kill switch) — the per-merchant `pilotEnabled` allowlist is
 * enforced inside MerchantService, so a merchant onboarded but not yet allowlisted for the pilot
 * corridor is invisible here even with the vertical globally on.
 */
@Controller("restaurants")
@UseGuards(RestaurantsEnabledGuard, JwtAuthGuard)
export class RestaurantsController {
  constructor(private readonly merchant: MerchantService) {}

  /** B-O10: `cursor` (opaque, the last id from a previous page's `nextCursor`) pages through the
   *  corridor's catalog instead of one unbounded fetch. */
  @Get()
  list(@Query("cursor") cursor?: string) {
    return this.merchant.listRestaurants(cursor);
  }

  @Get(":id/menu")
  menu(@Param("id", ParseUUIDPipe) id: string) {
    return this.merchant.getRestaurantMenu(id);
  }
}
