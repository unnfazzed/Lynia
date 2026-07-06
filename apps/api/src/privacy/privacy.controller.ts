import { Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
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

  /** Retention sweep — admin-only; intended for a daily Cloud Scheduler (OIDC) call. */
  @Post("admin/retention/purge")
  @UseGuards(JwtAuthGuard, AdminGuard)
  purge() {
    return this.privacy.purgeExpiredData();
  }
}
