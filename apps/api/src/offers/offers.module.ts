import { Module } from "@nestjs/common";
import { TrackingModule } from "../tracking/tracking.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";

@Module({
  imports: [TrackingModule],
  controllers: [OffersController],
  providers: [OffersService],
  // Merchant web upgrade L2 (OV-7): a business's booking lists its offers through the same ownership-
  // and block-gated read as the customer app. The sanctioned merchant → Send direction; nothing here
  // imports merchant code.
  exports: [OffersService],
})
export class OffersModule {}
