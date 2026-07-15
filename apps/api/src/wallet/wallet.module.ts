import { Module } from "@nestjs/common";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

/**
 * The prepaid commission wallet (design docs/plans/2026-rider-wallet-design.md — PR1 core). Exports
 * WalletService so the order-completion paths (OrdersModule) can call `chargeCommission` inside the
 * completion transaction, and the admin console (AdminModule) can drive the manual-credit path.
 */
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
