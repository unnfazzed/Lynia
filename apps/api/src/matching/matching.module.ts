import { Module } from "@nestjs/common";
import { MatchingController } from "./matching.controller";
import { MatchingService } from "./matching.service";
import { OfferExpiryService } from "./offer-expiry.service";

@Module({
  controllers: [MatchingController],
  providers: [MatchingService, OfferExpiryService],
  exports: [MatchingService, OfferExpiryService],
})
export class MatchingModule {}
