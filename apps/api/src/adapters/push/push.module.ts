import { Global, Logger, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { FCM_CREDENTIAL_FIX, FcmPush, parseServiceAccount } from "./fcm.push";
import { NoopPush } from "./noop.push";
import { PUSH, type PushAdapter } from "./push.interface";

/**
 * Off GCP there is no ambient ADC: without an explicit project AND a service account (inline JSON or a
 * file path) every send fails silently. So PUSH_PROVIDER=fcm off GCP is a hard boot failure unless both are set (C5) —
 * run PUSH_PROVIDER=noop until the Firebase credential exists.
 */
function assertOffGcpPushConfig(env: Env): void {
  if (!env.FCM_PROJECT_ID) {
    throw new Error(
      `Missing FCM_PROJECT_ID: every FCM push send fails (no Firebase project to address). ${FCM_CREDENTIAL_FIX}`,
    );
  }
  if (env.FCM_SERVICE_ACCOUNT_JSON) {
    parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
    return;
  }
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      `Missing FCM_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS: every FCM push send fails (no Firebase credential off GCP). ${FCM_CREDENTIAL_FIX}`,
    );
  }
}

/** FCM when armed (PUSH_PROVIDER=fcm), else a log-only noop (dev/test/unprovisioned). Same seam (D7). */
export function selectPush(env: Env): PushAdapter {
  if (env.PUSH_PROVIDER !== "fcm") return new NoopPush();
  if (env.CLOUD_PROVIDER !== "gcp") {
    assertOffGcpPushConfig(env);
  } else if (!env.FCM_PROJECT_ID) {
    // ADC supplies the project on Cloud Run, so this is fine there — but off Cloud Run (or before the
    // Firebase project is linked) every send fails silently. Surface it at boot rather than in the dark.
    new Logger("PushModule").warn(
      "PUSH_PROVIDER=fcm but FCM_PROJECT_ID is unset — relying on ADC's ambient project (fine on Cloud Run; pushes fail anywhere without one).",
    );
  }
  return new FcmPush(env.FCM_PROJECT_ID, env.FCM_SERVICE_ACCOUNT_JSON);
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
