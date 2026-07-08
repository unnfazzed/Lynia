import { Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { AdminOrSchedulerGuard } from "../auth/admin-or-scheduler.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { PrivacyService } from "./privacy.service";

@Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Right to erasure (CDPA): the caller deletes their own account. Scoped to the JWT subject. */
  @Delete("auth/me")
  @UseGuards(JwtAuthGuard)
  erase(@CurrentUser() profileId: string) {
    return this.privacy.eraseAccount(profileId);
  }

  /** Retention sweep — admin JWT or the daily Cloud Scheduler's Google OIDC token
   *  (SCHEDULER_SERVICE_ACCOUNT pins the caller; see AdminOrSchedulerGuard). */
  @Post("admin/retention/purge")
  @UseGuards(AdminOrSchedulerGuard)
  purge() {
    return this.privacy.purgeExpiredData();
  }
}
