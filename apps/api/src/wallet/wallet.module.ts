import { Module } from "@nestjs/common";
import { PaynowWebhookController } from "./paynow-webhook.controller";
import { TopupReconcileService } from "./topup-reconcile.service";
import { WalletIntegrityController } from "./wallet-integrity.controller";
import { WalletIntegrityService } from "./wallet-integrity.service";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

/**
 * The prepaid commission wallet (design docs/archive/plans/2026-rider-wallet-design.md — PR1 core). Exports
 * WalletService so the order-completion paths (OrdersModule) can call `chargeCommission` inside the
 * completion transaction, and the admin console (AdminModule) can drive the manual-credit path.
 *
 * WalletIntegrityService/Controller add the nightly ledger-completeness sweep (roadmap 1.3) — the
 * AdminOrSchedulerGuard it uses is provided by the @Global AuthModule, so no extra import wiring.
 *
 * PaynowWebhookController + TopupReconcileService are the Paynow top-up rail's two ways of hearing back
 * (docs/plans/2026-10-paynow-biker-wallet.md); PAYMENT_RAIL comes from the @Global PaymentsModule.
 */
@Module({
  controllers: [WalletController, WalletIntegrityController, PaynowWebhookController],
  providers: [WalletService, WalletIntegrityService, TopupReconcileService],
  exports: [WalletService],
})
export class WalletModule {}
