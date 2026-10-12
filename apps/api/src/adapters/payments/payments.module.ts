import { Global, Logger, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { PAYMENT_RAIL, type PaymentRail } from "./payment-rail.interface";
import { PaynowRail } from "./paynow-rail";
import { StubPaymentRail } from "./stub-payment-rail";

/**
 * Pick the top-up rail (mirrors `selectKycVendor`). `PAYMENT_RAIL=paynow` is the live Paynow express
 * checkout (docs/plans/2026-10-paynow-biker-wallet.md); its settings are validated together at boot
 * (config/env.ts), so a half-configured Paynow never reaches here. Anything else is the inert stub, which
 * charges nothing and never confirms: every top-up runs its window down and expires, as before Paynow.
 */
export function selectPaymentRail(env: Env): PaymentRail {
  if (env.PAYMENT_RAIL === "paynow" && env.PAYNOW_INTEGRATION_ID && env.PAYNOW_INTEGRATION_KEY && env.PAYNOW_AUTH_EMAIL && env.PAYNOW_RESULT_URL) {
    return new PaynowRail({
      PAYNOW_BASE_URL: env.PAYNOW_BASE_URL,
      PAYNOW_RETURN_URL: env.PAYNOW_RETURN_URL,
      integrationId: env.PAYNOW_INTEGRATION_ID,
      integrationKey: env.PAYNOW_INTEGRATION_KEY,
      authEmail: env.PAYNOW_AUTH_EMAIL,
      resultUrl: env.PAYNOW_RESULT_URL,
    });
  }
  if (env.NODE_ENV === "production") {
    new Logger("PaymentRail").warn("Top-up rail is STUB: no top-up charges anyone, and every one expires. Set PAYMENT_RAIL=paynow to take payments.");
  }
  return new StubPaymentRail();
}

/** `@Global` + registered in `app.module.ts`, matching its adapter siblings (Push/Storage/Secrets). */
@Global()
@Module({
  providers: [{ provide: PAYMENT_RAIL, inject: [ENV], useFactory: selectPaymentRail }],
  exports: [PAYMENT_RAIL],
})
export class PaymentsModule {}
