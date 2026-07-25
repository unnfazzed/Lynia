import { randomUUID } from "node:crypto";
import { Logger, ServiceUnavailableException } from "@nestjs/common";
import { maskPhone } from "../common/phone-mask";
import type { Env } from "../config/env";

export type OtpChannel = "whatsapp" | "sms" | "bird" | "local-sms" | "console";

/** Send-adapter (E4): the channel is a flag, so an SMS/console fallback is config-only insurance
 *  against WhatsApp BSP onboarding delay — the auth subsystem is identical either way. */
export interface OtpSender {
  channel(): OtpChannel;
  send(phone: string, code: string): Promise<void>;
}

export const OTP_SENDER = Symbol("OTP_SENDER");

/** Ceiling on the outbound WhatsApp Graph call. Without it a hung Meta endpoint stalls the OTP-request
 *  path for every user with no bound, and connections pile up under retries. */
const OTP_SEND_TIMEOUT_MS = 10_000;

/**
 * Pure builder for the WhatsApp Cloud API template-message body. Extracted so the payload contract
 * (phone normalization + the authentication-template components) is unit-tested with no network or
 * token in play. Graph wants the recipient as digits only (no '+'). The OTP code goes in the body
 * parameter and — for Meta "authentication" templates — also in the one-tap/copy-code URL button.
 */
export function buildWhatsAppOtpRequest(
  phone: string,
  code: string,
  opts: { template: string; lang: string; copyCodeButton: boolean },
): Record<string, unknown> {
  const components: Record<string, unknown>[] = [{ type: "body", parameters: [{ type: "text", text: code }] }];
  if (opts.copyCodeButton) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] });
  }
  return {
    messaging_product: "whatsapp",
    to: phone.replace(/\D/g, ""),
    type: "template",
    template: { name: opts.template, language: { code: opts.lang }, components },
  };
}

/**
 * Sends the OTP as a WhatsApp template message via Meta's Cloud API. Fails LOUD: if the channel is
 * whatsapp but the credentials/template aren't configured, or Meta rejects the send, it throws — so
 * requestOtp surfaces an error instead of a false "sent" with no code delivered. The OTP code is
 * never logged here (only Meta's error body is), unlike the dev console channel.
 */
export class WhatsAppOtpSender implements OtpSender {
  private readonly logger = new Logger("WhatsAppOtpSender");
  constructor(private readonly env: Env) {}
  channel(): OtpChannel {
    return "whatsapp";
  }
  async send(phone: string, code: string): Promise<void> {
    const phoneId = this.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = this.env.WHATSAPP_ACCESS_TOKEN;
    const template = this.env.WHATSAPP_TEMPLATE_NAME;
    if (!phoneId || !token || !template) {
      this.logger.error(
        "WhatsApp OTP not configured — set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, and WHATSAPP_TEMPLATE_NAME (or change OTP_CHANNEL).",
      );
      throw new ServiceUnavailableException("Couldn't send the verification code — try again shortly.");
    }
    const body = buildWhatsAppOtpRequest(phone, code, {
      template,
      lang: this.env.WHATSAPP_TEMPLATE_LANG,
      copyCodeButton: this.env.WHATSAPP_OTP_COPY_CODE_BUTTON === "true",
    });
    const url = `${this.env.WHATSAPP_GRAPH_BASE_URL}/${this.env.WHATSAPP_GRAPH_VERSION}/${phoneId}/messages`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OTP_SEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`WhatsApp OTP network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Log Meta's error (bad template name, expired token, unverified number…) but never the code.
      this.logger.error(`WhatsApp OTP send failed: ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
  }
}

/**
 * Canonical autofill-friendly OTP SMS text, shared by every SMS-delivering channel (Bird, local A2P).
 * Kept separate so the two things that decide whether the code auto-fills — the brand wording and the
 * optional Android SMS-Retriever hash — are unit-tested with no network in play. The code is placed
 * first so iOS Security-Code AutoFill and Android's autofill heuristics can find it. When `appHash` is
 * set it is appended on its own line: the SMS Retriever API requires the message to end with the app's
 * 11-char hash and stay ≤140 bytes, which lets the mobile app read the code with zero taps. Leave
 * `appHash` unset to keep the SMS clean — iOS (textContentType=oneTimeCode) and Android
 * (autoComplete=sms-otp) autofill still work without it.
 */
export function buildOtpSmsText(code: string, opts: { brand: string; appHash?: string }): string {
  const base = `${code} is your ${opts.brand} verification code. Don't share it with anyone.`;
  return opts.appHash ? `${base}\n\n${opts.appHash}` : base;
}

/**
 * Pure builder for the Bird SMS-API request body (`POST /v1/sms/messages`). Bird addresses the
 * recipient as an E.164 phone number (the '+' is kept, unlike Meta's Graph API).
 *
 * `category` is REQUIRED on free-text sends and is always "authentication" here: it is how Bird
 * classifies the traffic for routing and carrier filtering, which is exactly what an OTP needs on a
 * route (Zimbabwe / Econet) where untagged bulk traffic is the first thing to be grey-listed.
 *
 * `from` is optional — omitted, Bird picks a sender from its shared pool. Set BIRD_SMS_FROM once a
 * dedicated alphanumeric sender ID or number is registered, so the SMS shows the brand instead of a
 * pool sender.
 *
 * NOTE: this replaced the older Channels API (`/workspaces/{ws}/channels/{ch}/messages`), which is
 * not routable on the regional hosts — it answers `RouteNotFound`. See docs/BIRD-SETUP.md.
 */
export function buildBirdSmsRequest(phone: string, text: string, opts?: { from?: string }): Record<string, unknown> {
  const body: Record<string, unknown> = { to: phone, text, category: "authentication" };
  if (opts?.from) body.from = opts.from;
  return body;
}

/**
 * Sends the OTP as a plain SMS via Bird's Channels API. This is a delivery pipe only: we keep
 * generating, hashing, and verifying the code ourselves (otp-store.ts), so the whole verify path,
 * rate-limits, and session issuance are identical to the WhatsApp channel — Bird is schedule insurance
 * against WhatsApp BSP onboarding delay (product decision 2026-07-18), and reverting is a one-line
 * OTP_CHANNEL flip. Fails LOUD: missing credentials or a non-2xx from Bird throws, so requestOtp
 * surfaces an error instead of a false "sent". The OTP code is never logged (only Bird's error body is).
 */
export class BirdOtpSender implements OtpSender {
  private readonly logger = new Logger("BirdOtpSender");
  constructor(private readonly env: Env) {}
  channel(): OtpChannel {
    return "bird";
  }
  async send(phone: string, code: string): Promise<void> {
    const key = this.env.BIRD_ACCESS_KEY;
    if (!key) {
      this.logger.error("Bird OTP not configured — set BIRD_ACCESS_KEY (or change OTP_CHANNEL).");
      throw new ServiceUnavailableException("Couldn't send the verification code — try again shortly.");
    }
    const text = buildOtpSmsText(code, {
      brand: this.env.BIRD_BRAND_NAME,
      appHash: this.env.BIRD_ANDROID_SMS_HASH || undefined,
    });
    const body = buildBirdSmsRequest(phone, text, { from: this.env.BIRD_SMS_FROM || undefined });
    const url = `${this.env.BIRD_BASE_URL}/v1/sms/messages`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          // Bird dedupes retries carrying the same key. A fresh key per attempt is deliberate: a
          // resend must produce a real second SMS (the user tapped "resend"), so this only makes a
          // future transport-level retry of THIS request safe — it never suppresses a resend.
          "idempotency-key": randomUUID(),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OTP_SEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Bird OTP network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Log Bird's error (revoked key, no eligible sender for the destination E12003, insufficient
      // wallet balance…) but never the code.
      this.logger.error(`Bird OTP send failed: ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
    // 202 Accepted means Bird TOOK the message, not that it landed: delivery is asynchronous and the
    // message can still end up undelivered/failed/expired. Nothing here can observe that — closing
    // that gap needs the delivery-status webhook (docs/BIRD-SETUP.md, "Agent tooling").
  }
}

/**
 * Pure builder for the local-A2P SMS request body. This is the ONE place the wire format lives so it is
 * trivial to align with whichever Zimbabwe provider you onboard (Econet A2P direct, or a local bulk-SMS
 * aggregator plugged into Econet/NetOne/Telecel) — their field names vary. The default encodes the most
 * common convention: recipient in E.164, an 11-char alphanumeric sender, and the message text. Adjust
 * the keys here (and the auth header in LocalSmsOtpSender) to match the provider's API doc.
 */
export function buildLocalSmsRequest(phone: string, text: string, senderId: string): Record<string, unknown> {
  return { to: phone, from: senderId, message: text };
}

/**
 * Sends the OTP as a plain SMS via a local A2P gateway — the Zimbabwe fallback for when an international
 * aggregator (Bird) is throttled on Econet's grey-route filtering (product decision 2026-07-18). Like
 * Bird it is a delivery pipe only: we keep generating/hashing/verifying the code ourselves, so the verify
 * path is unchanged and switching between "bird" and "local-sms" is a one-line OTP_CHANNEL flip. Fails
 * LOUD on missing credentials or a non-2xx, and never logs the code (only the gateway's error body).
 * The request shape + auth are deliberately generic (buildLocalSmsRequest + a Bearer key); confirm both
 * against your provider's API before going live.
 */
export class LocalSmsOtpSender implements OtpSender {
  private readonly logger = new Logger("LocalSmsOtpSender");
  constructor(private readonly env: Env) {}
  channel(): OtpChannel {
    return "local-sms";
  }
  async send(phone: string, code: string): Promise<void> {
    const url = this.env.LOCAL_SMS_API_URL;
    const key = this.env.LOCAL_SMS_API_KEY;
    if (!url || !key) {
      this.logger.error(
        "Local SMS OTP not configured — set LOCAL_SMS_API_URL and LOCAL_SMS_API_KEY (or change OTP_CHANNEL).",
      );
      throw new ServiceUnavailableException("Couldn't send the verification code — try again shortly.");
    }
    const text = buildOtpSmsText(code, {
      brand: this.env.LOCAL_SMS_SENDER_ID,
      appHash: this.env.LOCAL_SMS_ANDROID_HASH || undefined,
    });
    const body = buildLocalSmsRequest(phone, text, this.env.LOCAL_SMS_SENDER_ID);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OTP_SEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Local SMS OTP network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Log the gateway's error (bad sender id, unregistered sender, auth failure…) but never the code.
      this.logger.error(`Local SMS OTP send failed: ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Couldn't send the code — try again in a moment.");
    }
  }
}

export class SmsOtpSender implements OtpSender {
  private readonly logger = new Logger("SmsOtpSender");
  channel(): OtpChannel {
    return "sms";
  }
  async send(phone: string, _code: string): Promise<void> {
    // TODO: call the SMS gateway. NEVER log the live code (this is a real delivery channel that can
    // run in prod) and mask the number — a log is not an out-of-band OTP delivery mechanism.
    this.logger.debug(`SMS OTP → ${maskPhone(phone)} (code redacted)`);
  }
}

/** Dev/test channel: logs the code so a local developer can complete signup with no provider. The
 *  production boot-guard rejects OTP_CHANNEL=console (config/env.ts), so this only ever runs in
 *  dev/test/CI; even so we mask the phone number in the log line. */
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger("ConsoleOtpSender");
  channel(): OtpChannel {
    return "console";
  }
  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`DEV OTP for ${maskPhone(phone)}: ${code}`);
  }
}

export function selectOtpSender(env: Env): OtpSender {
  switch (env.OTP_CHANNEL) {
    case "console":
      return new ConsoleOtpSender();
    case "sms":
      return new SmsOtpSender();
    case "bird":
      return new BirdOtpSender(env);
    case "local-sms":
      return new LocalSmsOtpSender(env);
    default:
      return new WhatsAppOtpSender(env);
  }
}
