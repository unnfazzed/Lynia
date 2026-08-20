import { Logger, Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { DiditKycVendor } from "./didit-kyc-vendor";
import { KycPendingStateService } from "./kyc-pending-state.service";
import { KYC_VENDOR, type KycVendor, StubKycVendor } from "./kyc-vendor";

/**
 * Select the KYC vendor and make any degraded/insecure mode LOUD in the logs rather than silent.
 * We deliberately don't hard-fail: KYC_PROVIDER=stub is the documented vendor-free QA mode that runs
 * on the prod deployment (NODE_ENV=production), so blocking it would break testing — but it must
 * never be mistaken for real onboarding, so it warns.
 */
export function selectKycVendor(env: Env): KycVendor {
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

/**
 * The KYC vendor seam, in one place so both of its consumers share ONE vendor instance.
 *
 * It used to be declared inside RidersModule, which was fine while `RiderService` was the only
 * caller. `getProfile` now derives `rider.kycPendingState` from the same vendor (P0-1 / D6), and
 * AuthModule cannot reach a provider private to RidersModule. Two separate bindings would also mean
 * two `KycPendingStateService` caches, so a rider's poll would miss whichever one the last call
 * warmed — the coalescing this module exists to provide would quietly stop working.
 */
@Module({
  providers: [
    {
      provide: KYC_VENDOR,
      inject: [ENV],
      useFactory: selectKycVendor,
    },
    KycPendingStateService,
  ],
  exports: [KYC_VENDOR, KycPendingStateService],
})
export class KycModule {}
