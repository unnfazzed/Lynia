import { Module } from "@nestjs/common";
import { KycModule } from "../kyc/kyc.module";
import { KycController } from "../kyc/kyc.controller";
import { KycReconcileService } from "../kyc/kyc-reconcile.service";
import { TrackingModule } from "../tracking/tracking.module";
import { RidersController } from "./riders.controller";
import { RiderProfileService } from "./rider-profile.service";
import { RiderService } from "./rider.service";

@Module({
  // TrackingModule (exports TrackingService) so setOnline(false) can evict the rider from the geo
  // index. Acyclic: TrackingModule doesn't depend on RidersModule.
  //
  // KycModule owns the KYC_VENDOR binding (it moved out of here so AuthModule can share the same
  // instance for the pending-state derivation — see that module's note).
  imports: [TrackingModule, KycModule],
  controllers: [RidersController, KycController],
  // KYC-R26-03 / -08: the lost-webhook reconciler and the ID-expiry sweep. Here, not in KycModule, because
  // they write through RiderService (KycModule must stay free of it — AuthModule imports KycModule).
  providers: [RiderService, RiderProfileService, KycReconcileService],
})
export class RidersModule {}
