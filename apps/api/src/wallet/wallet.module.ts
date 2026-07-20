import { Module } from "@nestjs/common";
import { WalletIntegrityController } from "./wallet-integrity.controller";
import { WalletIntegrityService } from "./wallet-integrity.service";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

/**
 * The prepaid commission wallet (design docs/plans/2026-rider-wallet-design.md — PR1 core). Exports
 * WalletService so the order-completion paths (OrdersModule) can call `chargeCommission` inside the
 * completion transaction, and the admin console (AdminModule) can drive the manual-credit path.
 *
 * WalletIntegrityService/Controller add the nightly ledger-completeness sweep (roadmap 1.3) — the
 * AdminOrSchedulerGuard it uses is provided by the @Global AuthModule, so no extra import wiring.
 */
@Module({
  controllers: [WalletController, WalletIntegrityController],
  providers: [WalletService, WalletIntegrityService],
  exports: [WalletService],
})
export class WalletModule {}
