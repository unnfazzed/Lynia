import { Controller, Post, UseGuards } from "@nestjs/common";
import { AdminOrSchedulerGuard } from "../auth/admin-or-scheduler.guard";
import { WalletIntegrityService } from "./wallet-integrity.service";

/**
 * The nightly wallet ledger integrity sweep (roadmap 1.3). Same auth shape as the retention purge
 * (PrivacyController): an admin JWT (manual "check the books now" from the console/ops) OR the daily
 * Cloud Scheduler's Google OIDC identity — see AdminOrSchedulerGuard + infra/terraform/scheduler.tf.
 *
 * Always returns 200 with the report; a nonzero drift is surfaced via the `wallet_integrity_drift_total`
 * metric and a WARN log (so the scheduler run itself is not marked failed), which 1.5's alert pages on.
 */
@Controller()
export class WalletIntegrityController {
  constructor(private readonly integrity: WalletIntegrityService) {}

  @Post("admin/wallet/integrity-check")
  @UseGuards(AdminOrSchedulerGuard)
  check() {
    return this.integrity.runIntegrityCheck();
  }
}
