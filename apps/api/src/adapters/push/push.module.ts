import { Global, Logger, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { FcmPush } from "./fcm.push";
import { NoopPush } from "./noop.push";
import { PUSH, type PushAdapter } from "./push.interface";

/** FCM when armed (PUSH_PROVIDER=fcm), else a log-only noop (dev/test/unprovisioned). Same seam (D7). */
export function selectPush(env: Env): PushAdapter {
  if (env.PUSH_PROVIDER !== "fcm") return new NoopPush();
  if (!env.FCM_PROJECT_ID) {
    // ADC supplies the project on Cloud Run, so this is fine there — but off Cloud Run (or before the
    // Firebase project is linked) every send fails silently. Surface it at boot rather than in the dark.
    new Logger("PushModule").warn(
      "PUSH_PROVIDER=fcm but FCM_PROJECT_ID is unset — relying on ADC's ambient project (fine on Cloud Run; pushes fail anywhere without one).",
    );
  }
  return new FcmPush(env.FCM_PROJECT_ID);
}

@Global()
@Module({
  providers: [
    {
      provide: PUSH,
      inject: [ENV],
      useFactory: (env: Env): PushAdapter => selectPush(env),
    },
  ],
  exports: [PUSH],
})
export class PushModule {}
