import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { maskPhone } from "../common/phone-mask";
import type { Env } from "../config/env";
import type { OtpDeliveryChannel } from "./otp-sender";

const logger = new Logger("BirdVerify");

/** Ceiling on a create/check call to Bird's Verify API. Mirrors OTP_SEND_TIMEOUT_MS in otp-sender.ts —
 *  without it a hung Bird endpoint stalls the OTP-request or -verify path for every user. */
const BIRD_VERIFY_TIMEOUT_MS = 10_000;

/**
 * WhatsApp first, SMS as the automatic fallback (docs.bird.com/api/verify-api): the 2026-07 product
 * decision that made plain-SMS-via-Bird the launch channel (otp-sender.ts BirdOtpSender) was working
 * AROUND a WhatsApp Business (BSP) onboarding delay, never a preference for SMS over WhatsApp — see that
 * file's and docs/BIRD-SETUP.md's "schedule insurance" language. Now that Bird's Verify product can
 * deliver over WhatsApp directly, SMS reverts to being the fallback it always should have been. Email
 * and Telegram are real Verify channels too but are never requested here — this app has no email/Telegram
 * identity to verify against.
 */
const CHANNELS = ["whatsapp", "sms"] as const;

export interface BirdVerifyCheckResult {
  success: boolean;
  /** Present only when success is false. */
  reason?: "invalid" | "expired" | "locked";
}

/**
 * Parses the region out of a Bird workspace key (`bk_<region>_…`) — Bird's Verify API is region-scoped
 * and the key prefix IS the region (`bird auth status` reports the same thing), so no separate base-url
 * config is needed the way BIRD_BASE_URL is for the plain-SMS product. Exported for unit testing; throws
 * on an unrecognized shape so a copy-pasted wrong key (or BIRD_ACCESS_KEY by mistake — a real, different
 * key from a different Bird product) fails loud at first use rather than silently hitting the wrong host.
 */
export function birdVerifyBaseUrl(apiKey: string): string {
  const m = /^bk_([a-z0-9]+)_/.exec(apiKey);
  if (!m) {
    throw new Error("BIRD_VERIFY_API_KEY doesn't look like a Bird workspace key (expected bk_<region>_…)");
  }
  return `https://${m[1]}.platform.bird.com`;
}

/** Bird's own channel vocabulary (whatsapp | sms | email | telegram) narrowed to what the UI can say.
 *  Only whatsapp/sms are ever requested (CHANNELS above), but this stays defensive — an unrecognized
 *  value falls back to "sms" rather than crashing a real sign-in over a vendor response shape this app
 *  didn't anticipate. */
function toDeliveryChannel(birdChannel: string | undefined): OtpDeliveryChannel {
  return birdChannel === "whatsapp" ? "whatsapp" : "sms";
}

function call(env: Env, key: string, path: string, body: unknown): Promise<Response> {
  return fetch(`${birdVerifyBaseUrl(key)}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(BIRD_VERIFY_TIMEOUT_MS),
  });
}

/**
 * Starts a Bird Verify verification for `phone` — Bird generates the 6-digit code itself and never
 * returns it (there is nothing to store here; docs.bird.com calls this "the verification API with
 * nothing to store"). Fails LOUD on missing config, a network error, or a non-2xx: requestOtp must
 * surface an error rather than a false "sent" with no code delivered, exactly like every OtpSender.
 */
export async function birdVerifyStart(env: Env, phone: string): Promise<{ channel: OtpDeliveryChannel }> {
  const key = env.BIRD_VERIFY_API_KEY;
  if (!key) {
    logger.error("Bird Verify not configured — set BIRD_VERIFY_API_KEY (or change OTP_CHANNEL).");
    throw new ServiceUnavailableException("Couldn't send the verification code — try again shortly.");
  }
  let res: Response;
  try {
    res = await call(env, key, "/v1/verify/verifications", {
      to: { phone_number: phone },
      // code_length pinned to 6: the app's code field, the API's zod schema (auth.controller.ts
      // VerifyOtp) and the mobile UI are all hardcoded to 6 digits, so this must never drift from
      // Bird's own default (documented as configurable 4-8, not stated as 6).
      options: { code_length: 6, channels: CHANNELS },
    });
  } catch (err) {
    logger.error(`Bird Verify create network error: ${err instanceof Error ? err.message : String(err)}`);
    throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error(`Bird Verify create failed: ${res.status} ${detail.slice(0, 300)}`);
    throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; last_channel?: string };
  logger.log(`Bird Verify sent → ${maskPhone(phone)} (verification_id=${body.id ?? "?"}, channel=${body.last_channel ?? "?"})`);
  return { channel: toDeliveryChannel(body.last_channel) };
}

/**
 * Checks a user-entered code against Bird. Bird finds the in-progress verification purely by recipient
 * ("Supply exactly the `to` set you created the verification with" — no verification id to pass), and
 * enforces its own expiry/attempt-limit/cooldown, so this — unlike the local OTP engine — has no store of
 * its own to consult first.
 *
 * A wrong/expired/locked code is a normal ANSWER (Bird returns 200 with `success:false`), never a thrown
 * error — mirrors the local engine's checkLocalOtp in auth.service.ts, which AuthService.verifyOtp maps
 * to the exact same three reasons regardless of which engine produced them. Only a genuine Bird-side
 * failure (network error, non-2xx) throws, so a vendor outage never gets silently counted as a wrong
 * guess against the caller's attempt budget.
 *
 * The one Bird-specific wrinkle: "a final verification cannot be checked again" — a SECOND check on an
 * already-resolved verification 404s. That is exactly the shape of a client that timed out on a
 * successful check and retried (§6 in auth.service.ts) — reporting it as "expired" (not a throw) routes
 * it into AuthService's existing post-verify retry grace, which by then already holds this code's hash
 * from the first, successful check.
 */
export async function birdVerifyCheck(env: Env, phone: string, code: string): Promise<BirdVerifyCheckResult> {
  const key = env.BIRD_VERIFY_API_KEY;
  if (!key) {
    logger.error("Bird Verify not configured — set BIRD_VERIFY_API_KEY (or change OTP_CHANNEL).");
    throw new ServiceUnavailableException("Couldn't verify the code — try again shortly.");
  }
  let res: Response;
  try {
    res = await call(env, key, "/v1/verify/verifications/check", { to: { phone_number: phone }, code });
  } catch (err) {
    logger.error(`Bird Verify check network error: ${err instanceof Error ? err.message : String(err)}`);
    throw new ServiceUnavailableException("Couldn't verify the code — try again in a moment.");
  }
  if (res.status === 404) return { success: false, reason: "expired" };
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error(`Bird Verify check failed: ${res.status} ${detail.slice(0, 300)}`);
    throw new ServiceUnavailableException("Couldn't verify the code — try again in a moment.");
  }
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; reason?: string };
  if (body.success) return { success: true };
  if (body.reason === "attempts_exhausted") return { success: false, reason: "locked" };
  if (body.reason === "expired") return { success: false, reason: "expired" };
  return { success: false, reason: "invalid" }; // incorrect_code, or an unrecognized reason
}
