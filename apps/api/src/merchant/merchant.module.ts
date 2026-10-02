import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { OffersModule } from "../offers/offers.module";
import { OrdersModule } from "../orders/orders.module";
import { TrackingModule } from "../tracking/tracking.module";
import { DISPATCH_STRATEGY, NearestRiderDispatchStrategy } from "./dispatch-strategy";
import { FoodDebtService } from "./food-debt.service";
import { FoodDispatchService } from "./food-dispatch.service";
import { FoodOrderController } from "./food-order.controller";
import { FoodOrderService } from "./food-order.service";
import { MerchantController } from "./merchant.controller";
import { MerchantBranchesController } from "./merchant-branches.controller";
import { MerchantBranchesService } from "./merchant-branches.service";
import { MerchantBookingController } from "./merchant-booking.controller";
import { MerchantBookingService } from "./merchant-booking.service";
import { MerchantGuard } from "./merchant.guard";
import { MerchantInvitesService } from "./merchant-invites.service";
import { MerchantOrderController } from "./merchant-order.controller";
import { MerchantRidersController } from "./merchant-riders.controller";
import { MerchantRidersService } from "./merchant-riders.service";
import { MerchantService } from "./merchant.service";
import { MerchantInvitesController, MerchantTeamController } from "./merchant-team.controller";
import { MerchantTeamService } from "./merchant-team.service";
import { RestaurantReopenService } from "./restaurant-reopen.service";
import { RestaurantsController } from "./restaurants.controller";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";
import { ShopsController } from "./shops.controller";
import { ShopsEnabledGuard } from "./shops-enabled.guard";
import { OrderFlowCustomerController, OrderFlowMerchantController } from "./order-flow-v2-b.controller";
import { OrderScheduleService } from "./order-schedule.service";
import { PrescriptionService } from "./prescription.service";

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
 *
 * Merchant web upgrade L2 adds Book a rider: MerchantBookingService drives Send's own services as the
 * business's booking account, so MatchingModule (selectOffer) and OffersModule (the offer list) join
 * the imports — the same sanctioned merchant → Send direction (plan §11 F1.3).
 *
 * L3 adds Your riders (MerchantRidersService); L4 adds Team: MerchantTeamService (the owner's side and
 * a staff member's Leave, which evicts the person's devices from the queue room through TrackingGateway)
 * and MerchantInvitesService (Join / Not me, for a caller who isn't on a business yet).
 *
 * Multi-branch owners (docs/plans/2026-09-30-multi-branch-owners.md) add MerchantBranchesService: list,
 * switch and open branches. It needs nothing new: a branch is an ordinary business row.
 *
 * Order flow v2 (ledger D-59, backend B) adds OrderScheduleService (slots + the ring sweep),
 * PrescriptionService (Rx behind RX_ENABLED) and their two controllers (order-flow-v2-b.controller.ts).
 */
@Module({
  imports: [TrackingModule, OrdersModule, MatchingModule, OffersModule],
  controllers: [
    MerchantController,
    RestaurantsController,
    ShopsController,
    FoodOrderController,
    MerchantOrderController,
    MerchantBookingController,
    MerchantRidersController,
    MerchantTeamController,
    MerchantInvitesController,
    MerchantBranchesController,
    OrderFlowCustomerController,
    OrderFlowMerchantController,
  ],
  providers: [
    MerchantService,
    MerchantBookingService,
    MerchantRidersService,
    MerchantTeamService,
    MerchantInvitesService,
    MerchantBranchesService,
    MerchantGuard,
    RestaurantsEnabledGuard,
    ShopsEnabledGuard,
    FoodOrderService,
    FoodDispatchService,
    FoodDebtService,
    RestaurantReopenService,
    OrderScheduleService,
    PrescriptionService,
    { provide: DISPATCH_STRATEGY, useClass: NearestRiderDispatchStrategy },
  ],
  // Exported so UploadsModule can gate the merchant dish/banner photo mints (D-32) behind the same
  // two guards every other merchant route uses, without duplicating them.
  exports: [MerchantGuard, RestaurantsEnabledGuard],
})
export class MerchantModule {}
