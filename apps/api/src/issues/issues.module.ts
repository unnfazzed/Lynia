import { Module } from "@nestjs/common";
import { TrackingModule } from "../tracking/tracking.module";
import { AdminIssuesController } from "./admin-issues.controller";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";

/**
 * Trip issues / disputes (A-05). PrismaService + NotificationsService are global, so they need no imports;
 * TrackingModule is imported so resolve() can evict a dispute-strike-limited rider from the live-supply
 * planes through TrackingGateway.evictRiderFromSupply (DS17-02). Exposes the party-facing raise endpoint
 * and the admin queue/detail/resolve endpoints.
 */
@Module({
  imports: [TrackingModule],
  controllers: [IssuesController, AdminIssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
