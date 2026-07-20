import { Global, Module } from "@nestjs/common";
import { PAYMENT_RAIL } from "./payment-rail.interface";
import { StubPaymentRail } from "./stub-payment-rail";

/**
 * Payment-rail seam (roadmap 2.5). Binds {@link PAYMENT_RAIL} to the inert {@link StubPaymentRail} —
 * the only impl until the live EcoCash client (wallet PR2) lands, at which point this grows a selector
 * (env-driven, mirroring `selectPush`/`selectKycVendor`) that swaps in the real client.
 *
 * `@Global` + registered in `app.module.ts`, matching its direct adapter siblings (Push/Storage/Secrets)
 * so the token is injectable app-wide with no per-module import. Purely additive today: nothing injects
 * `PAYMENT_RAIL`, so this changes no existing DI or wallet behavior — it only creates and binds the seam.
 */
@Global()
@Module({
  providers: [{ provide: PAYMENT_RAIL, useClass: StubPaymentRail }],
  exports: [PAYMENT_RAIL],
})
export class PaymentsModule {}
