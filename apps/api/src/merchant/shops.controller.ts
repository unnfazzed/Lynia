import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { ShopService } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { customerVisibleShop, shopServiceEnabled } from "./merchant-lookup.util";
import { MerchantService } from "./merchant.service";
import { ShopsEnabledGuard } from "./shops-enabled.guard";

/**
 * Customer-facing Shops & Pharmacy read API (browse-v2 B2–B4, S3–S4; ledger D-58). The restaurant read
 * API's twin: list, search and one shop's catalogue. `service` picks the section — `pharmacy` is the
 * pharmacy kind, `shops` every other kind — and each section has its own kill switch
 * (SHOPS_ENABLED / PHARMACY_ENABLED). ShopsEnabledGuard answers 503 while both are off; a request for
 * a section that is off answers 503 too, the same "dead means dead" shape as RestaurantsEnabledGuard.
 * The per-shop `pilotEnabled` go-live switch is applied by `customerVisibleShop`.
 *
 * Orders are placed through the food order path since Order flow v2 (ledger D-59), on the same rule.
 */
@Controller("shops")
@UseGuards(ShopsEnabledGuard, JwtAuthGuard)
export class ShopsController {
  constructor(
    private readonly merchant: MerchantService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  list(@Query("service") service?: string, @Query("cursor") cursor?: string) {
    return this.merchant.listShops(this.visible(service), cursor);
  }

  /** Declared before `:id/*` so the static `search` segment can't be captured as an `:id`. */
  @Get("search")
  search(@Query("service") service?: string, @Query("q") q?: string) {
    return this.merchant.searchShops(this.visible(service), q);
  }

  /** Ledger D-72: one section's live shops ranked by recent delivered orders ("Popular shops" on Home, the
   *  "Recommended" sort). Empty on a thin section — the phone keeps nearest-open then. */
  @Get("popular")
  popular(@Query("service") service?: string) {
    const where = this.visible(service);
    return this.merchant.popularVenues(where, `shops:${service}`);
  }

  /** Either section's shop, while its section is on. */
  @Get(":id/catalogue")
  catalogue(@Param("id", ParseUUIDPipe) id: string) {
    return this.merchant.getShopCatalogue(customerVisibleShop(this.env), id);
  }

  private visible(raw: string | undefined) {
    const parsed = ShopService.safeParse(raw);
    // An unknown section is a 400-shaped mistake, but answering it 503 keeps one "not here" shape.
    if (!parsed.success || !shopServiceEnabled(this.env, parsed.data)) {
      throw new ServiceUnavailableException(parsed.success && parsed.data === "pharmacy" ? "Pharmacy is not available yet" : "Shops is not available yet");
    }
    return customerVisibleShop(this.env, parsed.data);
  }
}
