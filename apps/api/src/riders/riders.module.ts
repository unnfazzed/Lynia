import { Logger, Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DiditKycVendor } from "../kyc/didit-kyc-vendor";
import { KYC_VENDOR, type KycVendor, StubKycVendor } from "../kyc/kyc-vendor";
import { KycController } from "../kyc/kyc.controller";
import { RidersController } from "./riders.controller";
import { RiderService } from "./rider.service";

/**
 * Select the KYC vendor and make any degraded/insecure mode LOUD in the logs rather than silent.
 * We deliberately don't hard-fail: KYC_PROVIDER=stub is the documented vendor-free QA mode that runs
 * on the prod deployment (NODE_ENV=production), so blocking it would break testing — but it must
 * never be mistaken for real onboarding, so it warns.
 */
function selectKycVendor(env: Env): KycVendor {
  const log = new Logger("KycVendor");
  if (env.KYC_PROVIDER === "didit") {
    if (env.DIDIT_API_KEY) return new DiditKycVendor(env);
    log.warn("KYC_PROVIDER=didit but DIDIT_API_KEY is unset — falling back to the STUB vendor; riders will NOT be Didit-verified.");
    return new StubKycVendor();
  }
  if (env.NODE_ENV === "production") {
    log.warn("KYC vendor is STUB (auto-verify) in production — vendor-free QA only, NOT real onboarding.");
  }
  return new StubKycVendor();
}

@Module({
  controllers: [RidersController, KycController],
  providers: [
    RiderService,
    {
      provide: KYC_VENDOR,
      inject: [ENV],
      useFactory: selectKycVendor,
    },
  ],
})
export class RidersModule {}
