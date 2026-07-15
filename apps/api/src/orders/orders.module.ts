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
})
export class OrdersModule {}
