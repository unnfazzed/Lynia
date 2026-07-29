import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
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

  @Get()
  list() {
    return this.merchant.listRestaurants();
  }

  @Get(":id/menu")
  menu(@Param("id", ParseUUIDPipe) id: string) {
    return this.merchant.getRestaurantMenu(id);
  }
}
