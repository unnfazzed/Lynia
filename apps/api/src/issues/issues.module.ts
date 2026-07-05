import { Module } from "@nestjs/common";
import { AdminIssuesController } from "./admin-issues.controller";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";

/**
 * Trip issues / disputes (A-05). PrismaService + NotificationsService are global, so no imports are
 * needed. Exposes the party-facing raise endpoint and the admin queue/detail/resolve endpoints.
 */
@Module({
  controllers: [IssuesController, AdminIssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
