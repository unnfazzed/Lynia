import { Module } from "@nestjs/common";
import { TrackingGateway } from "./tracking.gateway";
import { RiderNudgeService } from "./rider-nudge.service";
import { TrackingService } from "./tracking.service";

@Module({
  providers: [TrackingService, TrackingGateway, RiderNudgeService],
  exports: [TrackingGateway, TrackingService, RiderNudgeService],
})
export class TrackingModule {}
