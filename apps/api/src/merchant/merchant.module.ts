import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { TrackingModule } from "../tracking/tracking.module";
import { DISPATCH_STRATEGY, NearestRiderDispatchStrategy } from "./dispatch-strategy";
import { FoodDebtService } from "./food-debt.service";
import { FoodDispatchService } from "./food-dispatch.service";
import { FoodOrderController } from "./food-order.controller";
import { FoodOrderService } from "./food-order.service";
import { MerchantController } from "./merchant.controller";
import { MerchantGuard } from "./merchant.guard";
import { MerchantOrderController } from "./merchant-order.controller";
import { MerchantService } from "./merchant.service";
import { RestaurantReopenService } from "./restaurant-reopen.service";
import { RestaurantsController } from "./restaurants.controller";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

/**
 * Restaurants vertical (Lane C). Registered unconditionally in AppModule — the fail-safe-OFF
 * discipline lives in RestaurantsEnabledGuard (checked first, on every route in both controllers),
 * not in whether this module loads. This is what lets the golden matrix
 * (merchant-routes-dead.e2e.spec.ts) prove "dead when off" from real HTTP behavior (503) rather
 * than from route absence — the shape the plan calls for once real flagged surfaces exist.
 *
 * C2 adds FoodOrderService (the pre-dispatch order lifecycle) + its two controllers: FoodOrderController
 * (customer-facing, under `restaurants`) and MerchantOrderController (kitchen-facing, under
 * `merchant/orders`). TokenService/NotificationsService are both @Global (AuthModule/
 * NotificationsModule), so no extra imports are needed to inject them into FoodOrderService.
 *
 * C3 adds FoodDispatchService (the ready_for_pickup → assigned hand-off) + its DispatchStrategy seam
 * — the default NearestRiderDispatchStrategy is bound here so a future ETA-ranked strategy is a
 * one-line provider swap, no FoodDispatchService change. TrackingGateway/TrackingService are both
 * exported from TrackingModule, already imported globally by AppModule for the Express matching path.
 *
 * C4 adds FoodDebtService (the doorstep handshake + collect-and-return debt ledger). It reuses
 * OrderLifecycleService.markUndelivered verbatim for the N-10/R-08 doorstep-failure paths, so
 * OrdersModule joins the imports — the sanctioned merchant→shared direction (express-no-merchant-
 * coupling only forbids the reverse). FoodOrderService also depends on FoodDebtService directly
 * (confirmPickup opens the debt inside its own transaction), so no import-order concern either way.
 */
@Module({
  imports: [TrackingModule, OrdersModule],
  controllers: [MerchantController, RestaurantsController, FoodOrderController, MerchantOrderController],
  providers: [
    MerchantService,
    MerchantGuard,
    RestaurantsEnabledGuard,
    FoodOrderService,
    FoodDispatchService,
    FoodDebtService,
    RestaurantReopenService,
    { provide: DISPATCH_STRATEGY, useClass: NearestRiderDispatchStrategy },
  ],
  // Exported so UploadsModule can gate the merchant dish/banner photo mints (D-32) behind the same
  // two guards every other merchant route uses, without duplicating them.
  exports: [MerchantGuard, RestaurantsEnabledGuard],
})
export class MerchantModule {}
