import { Module } from "@nestjs/common";
import { KycModule } from "../kyc/kyc.module";
import { KycController } from "../kyc/kyc.controller";
import { TrackingModule } from "../tracking/tracking.module";
import { RidersController } from "./riders.controller";
import { RiderService } from "./rider.service";

@Module({
  // TrackingModule (exports TrackingService) so setOnline(false) can evict the rider from the geo
  // index. Acyclic: TrackingModule doesn't depend on RidersModule.
  //
  // KycModule owns the KYC_VENDOR binding (it moved out of here so AuthModule can share the same
  // instance for the pending-state derivation — see that module's note).
  imports: [TrackingModule, KycModule],
  controllers: [RidersController, KycController],
  providers: [RiderService],
})
export class RidersModule {}
