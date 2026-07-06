import { Module } from "@nestjs/common";
import { SettlementsModule } from "../settlements/settlements.module";
import { TrackingModule } from "../tracking/tracking.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  // SettlementsModule exports SettlementsService — the admin cash endpoints delegate to it (A-06).
  // TrackingModule exports TrackingGateway — admin cancelOrder pushes job:cancelled to the assigned rider (P2-3).
  imports: [SettlementsModule, TrackingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
