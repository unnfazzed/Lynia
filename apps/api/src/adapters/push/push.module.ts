import { Global, Logger, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { ApnsPush, type ApnsConfig } from "./apns.push";
import { FCM_CREDENTIAL_FIX, FcmPush, parseServiceAccount } from "./fcm.push";
import { NoopPush } from "./noop.push";
import { PUSH, type PushAdapter } from "./push.interface";
import { PlatformRoutedPush } from "./routed.push";

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

/** Fix hint for every APNs boot-guard message (plan §5a X4 format). */
export const APNS_CREDENTIAL_FIX =
  "Fix: set the APNS_KEY_ID and APNS_TEAM_ID Variables and Key Vault secret APNS-PRIVATE-KEY (the .p8 file's contents, exposed as APNS_PRIVATE_KEY), or unset all three — see docs/APP-STORE-SUBMISSION.md A5/B4.";

/** The .p8 PEM label. Interpolated rather than written out in one armor literal, so secret scanners
 *  (gitleaks `private-key`) don't read the template below as a committed key. */
const P8_LABEL = "PRIVATE KEY";

/**
 * The .p8 key as a PEM, whichever form survived the trip from Apple's download to the env: the file's
 * own text (Key Vault `--file` upload — the runbook's way), that text with literal "\n" escapes (a
 * one-line env value), or just the base64 body. Anything else is returned as-is for the check below.
 */
export function normalizeP8(raw: string): string {
  const text = raw.trim().replace(/\\n/g, "\n");
  if (text.includes(`BEGIN ${P8_LABEL}`)) return text;
  const body = text.replace(/\s+/g, "");
  if (body.length >= 64 && /^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    return `-----BEGIN ${P8_LABEL}-----\n${(body.match(/.{1,64}/g) ?? []).join("\n")}\n-----END ${P8_LABEL}-----\n`;
  }
  return text;
}

/**
 * The APNs config when armed, else undefined. All-or-nothing: a partial set (or a key that isn't a
 * .p8 PEM, or an id that isn't Apple's 10-character form) would fail every iOS send silently, so it
 * refuses to boot instead. The messages never echo the key.
 */
export function apnsConfigFrom(env: Env): ApnsConfig | undefined {
  const { APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId } = env;
  const privateKey = env.APNS_PRIVATE_KEY ? normalizeP8(env.APNS_PRIVATE_KEY) : env.APNS_PRIVATE_KEY;
  const set = [keyId, teamId, privateKey].filter((v) => v !== undefined && v !== "").length;
  if (set === 0) return undefined;
  if (!keyId || !teamId || !privateKey) {
    throw new Error(`Incomplete APNs config: APNS_KEY_ID, APNS_TEAM_ID and APNS_PRIVATE_KEY must all be set or all unset. ${APNS_CREDENTIAL_FIX}`);
  }
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error(`Invalid APNS_KEY_ID or APNS_TEAM_ID: both are Apple's 10-character upper-case ids. ${APNS_CREDENTIAL_FIX}`);
  }
  if (!privateKey.includes(`BEGIN ${P8_LABEL}`)) {
    throw new Error(`Invalid APNS_PRIVATE_KEY: expected the .p8 file's PEM text (-----BEGIN ${P8_LABEL}-----). ${APNS_CREDENTIAL_FIX}`);
  }
  return { keyId, teamId, privateKey, topic: env.APNS_TOPIC, sandbox: env.APNS_SANDBOX === "true" };
}

/**
 * Each device's push goes through its platform's transport (PlatformRoutedPush): Android (and legacy
 * rows with no platform) through FCM when armed (PUSH_PROVIDER=fcm), iOS through APNs when its key is
 * configured. Either side falls back to a log-only noop (dev/test/unprovisioned). Same seam (D7).
 */
export function selectPush(env: Env): PushAdapter {
  const apnsConfig = apnsConfigFrom(env);
  const apns: PushAdapter = apnsConfig ? new ApnsPush(apnsConfig) : new NoopPush();
  return new PlatformRoutedPush(selectFcm(env), apns);
}

/** FCM when armed (PUSH_PROVIDER=fcm), else a log-only noop. */
function selectFcm(env: Env): PushAdapter {
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
