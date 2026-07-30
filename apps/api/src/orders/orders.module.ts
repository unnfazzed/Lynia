import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { TrackingModule } from "../tracking/tracking.module";
import { WalletModule } from "../wallet/wallet.module";
import { LifecycleController } from "./lifecycle.controller";
import { OrderLifecycleService } from "./order-lifecycle.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  // WalletModule exports WalletService — the completion paths call chargeCommission inside the
  // completion transaction (per-ride prepaid commission debit). Acyclic: WalletModule imports nothing here.
  imports: [MatchingModule, TrackingModule, WalletModule],
  controllers: [OrdersController, LifecycleController],
  providers: [OrdersService, OrderLifecycleService],
  // AppBootstrapModule aggregates the cold-start reads (wave-2 W1) — it needs the same activeFor*
  // reads the /orders/mine endpoints serve. Acyclic: this module imports nothing from it.
  // OrderLifecycleService is also exported so merchant/food-debt.service.ts (C4) can reuse
  // markUndelivered verbatim for the N-10/R-08 doorstep-failure paths instead of re-deriving the
  // reliability-penalty/hold logic — the sanctioned merchant→shared import direction (the
  // `express-no-merchant-coupling` depcruise rule only forbids the reverse).
  exports: [OrdersService, OrderLifecycleService],
})
export class OrdersModule {}
