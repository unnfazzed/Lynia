import { Controller, Delete, Logger, Post, UseGuards } from "@nestjs/common";
import { StorageSweeper, type OrphanSweepResult } from "../adapters/storage/storage-sweeper";
import { AdminOrSchedulerGuard } from "../auth/admin-or-scheduler.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { PrivacyService } from "./privacy.service";

@Controller()
export class PrivacyController {
  private readonly logger = new Logger(PrivacyController.name);

  constructor(
    private readonly privacy: PrivacyService,
    // StorageModule is @Global, so Nest always injects it; TS-optional so a harness can omit it.
    private readonly sweeper?: StorageSweeper,
  ) {}

  /** Right to erasure (CDPA): the caller deletes their own account. Scoped to the JWT subject. */
  @Delete("auth/me")
  @UseGuards(JwtAuthGuard)
  erase(@CurrentUser() profileId: string) {
    return this.privacy.eraseAccount(profileId);
  }

  /** Retention sweep — admin JWT or the daily scheduler's OIDC token (SCHEDULER_SERVICE_ACCOUNT pins
   *  the caller; see AdminOrSchedulerGuard). Step 2 is the upload orphan sweep (C1 / E2): it runs here
   *  rather than as another in-process timer, and in its own try/catch so a storage failure never fails
   *  the DB retention purge that already committed. `orphanSweep: null` reports that it failed. */
  @Post("admin/retention/purge")
  @UseGuards(AdminOrSchedulerGuard)
  async purge(): Promise<Awaited<ReturnType<PrivacyService["purgeExpiredData"]>> & { orphanSweep?: OrphanSweepResult | null }> {
    const result = await this.privacy.purgeExpiredData();
    if (!this.sweeper) return result;
    let orphanSweep: OrphanSweepResult | null = null;
    try {
      orphanSweep = await this.sweeper.sweepOrphans();
    } catch (err) {
      this.logger.error(`Orphan upload sweep failed (retention purge unaffected): ${err instanceof Error ? err.message : String(err)}`);
    }
    return { ...result, orphanSweep };
  }
}
