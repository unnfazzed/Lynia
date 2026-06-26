import { Module } from "@nestjs/common";
import { KycController } from "../kyc/kyc.controller";
import { KYC_VENDOR, StubKycVendor } from "../kyc/kyc-vendor";
import { RidersController } from "./riders.controller";
import { RiderService } from "./rider.service";

@Module({
  controllers: [RidersController, KycController],
  providers: [RiderService, { provide: KYC_VENDOR, useClass: StubKycVendor }],
})
export class RidersModule {}
