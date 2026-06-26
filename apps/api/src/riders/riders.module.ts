import { Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DiditKycVendor } from "../kyc/didit-kyc-vendor";
import { KYC_VENDOR, type KycVendor, StubKycVendor } from "../kyc/kyc-vendor";
import { KycController } from "../kyc/kyc.controller";
import { RidersController } from "./riders.controller";
import { RiderService } from "./rider.service";

@Module({
  controllers: [RidersController, KycController],
  providers: [
    RiderService,
    {
      provide: KYC_VENDOR,
      inject: [ENV],
      useFactory: (env: Env): KycVendor =>
        env.KYC_PROVIDER === "didit" && env.DIDIT_API_KEY ? new DiditKycVendor(env) : new StubKycVendor(),
    },
  ],
})
export class RidersModule {}
