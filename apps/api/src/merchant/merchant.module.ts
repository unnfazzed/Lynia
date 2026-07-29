import { Module } from "@nestjs/common";
import { MerchantController } from "./merchant.controller";
import { MerchantGuard } from "./merchant.guard";
import { MerchantService } from "./merchant.service";
import { RestaurantsController } from "./restaurants.controller";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Restaurants vertical (Lane C). Registered unconditionally in AppModule — the fail-safe-OFF
 * discipline lives in RestaurantsEnabledGuard (checked first, on every route in both controllers),
 * not in whether this module loads. This is what lets the golden matrix
 * (merchant-routes-dead.e2e.spec.ts) prove "dead when off" from real HTTP behavior (503) rather
 * than from route absence — the shape the plan calls for once real flagged surfaces exist.
 */
@Module({
  controllers: [MerchantController, RestaurantsController],
  providers: [MerchantService, MerchantGuard, RestaurantsEnabledGuard],
  // Exported so UploadsModule can gate the merchant dish/banner photo mints (D-32) behind the same
  // two guards every other merchant route uses, without duplicating them.
  exports: [MerchantGuard, RestaurantsEnabledGuard],
})
export class MerchantModule {}
