import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { CUSTOMER_VISIBLE_RESTAURANT } from "./merchant-lookup.util";
import { MerchantService } from "./merchant.service";
import { RestaurantReopenService } from "./restaurant-reopen.service";
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
  constructor(
    private readonly merchant: MerchantService,
    private readonly reopen: RestaurantReopenService,
  ) {}

  /** B-O10: `cursor` (opaque, the last id from a previous page's `nextCursor`) pages through the
   *  corridor's catalog instead of one unbounded fetch. */
  @Get()
  list(@Query("cursor") cursor?: string) {
    return this.merchant.listRestaurants(cursor);
  }

  /** #673 cross-restaurant search — PLACES (restaurant name) + DISHES (menu items corridor-wide).
   *  Declared before `:id/*` so the static `search` segment can't be captured as an `:id`. */
  @Get("search")
  search(@Query("q") q?: string) {
    return this.merchant.searchRestaurants(q);
  }

  /** Browse v2 X1 (D-57): the "Popular near you" search chips. Before `:id/*`, like `search`. */
  @Get("search/popular")
  searchPopular() {
    return this.merchant.searchPopular();
  }

  /** Ledger D-72: the live restaurants ranked by recent delivered orders ("Popular restaurants" on Home,
   *  the "Recommended" sort in browse). Empty on a thin corridor — the phone keeps nearest-open then. */
  @Get("popular")
  popular() {
    return this.merchant.popularVenues(CUSTOMER_VISIBLE_RESTAURANT, "restaurants");
  }

  @Get(":id/menu")
  menu(@Param("id", ParseUUIDPipe) id: string) {
    return this.merchant.getRestaurantMenu(id);
  }

  /** D1 `menu_closed`: is this customer waiting on this kitchen to open? Drives the button state. */
  @Get(":id/reopen-reminder")
  getReopenReminder(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.reopen.getReminder(profileId, id);
  }

  /** Ask to be told when it opens. Idempotent; answers `set:false, alreadyOpen:true` if it's open now. */
  @Post(":id/reopen-reminder")
  setReopenReminder(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.reopen.setReminder(profileId, id);
  }

  @Delete(":id/reopen-reminder")
  clearReopenReminder(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() profileId: string) {
    return this.reopen.clearReminder(profileId, id);
  }
}
