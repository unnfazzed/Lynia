import { Module } from "@nestjs/common";
import { TrackingController } from "./tracking.controller";
import { TrackingGateway } from "./tracking.gateway";
import { TrackingService } from "./tracking.service";

@Module({
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGateway],
  exports: [TrackingGateway],
})
export class TrackingModule {}
