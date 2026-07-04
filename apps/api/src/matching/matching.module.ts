import { Module } from "@nestjs/common";
import { TrackingModule } from "../tracking/tracking.module";
import { MatchingController } from "./matching.controller";
import { MatchingService } from "./matching.service";
import { OfferExpiryService } from "./offer-expiry.service";

@Module({
  imports: [TrackingModule],
  controllers: [MatchingController],
  providers: [MatchingService, OfferExpiryService],
  exports: [MatchingService, OfferExpiryService],
})
export class MatchingModule {}
