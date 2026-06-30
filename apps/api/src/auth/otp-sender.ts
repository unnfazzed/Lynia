import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Env } from "../config/env";

export type OtpChannel = "whatsapp" | "sms" | "console";

/** Send-adapter (E4): the channel is a flag, so an SMS/console fallback is config-only insurance
 *  against WhatsApp BSP onboarding delay — the auth subsystem is identical either way. */
export interface OtpSender {
  channel(): OtpChannel;
  send(phone: string, code: string): Promise<void>;
}

export const OTP_SENDER = Symbol("OTP_SENDER");

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
      throw new ServiceUnavailableException("OTP delivery is not configured");
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
      });
    } catch (err) {
      this.logger.error(`WhatsApp OTP network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("Couldn't reach the OTP provider");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Log Meta's error (bad template name, expired token, unverified number…) but never the code.
      this.logger.error(`WhatsApp OTP send failed: ${res.status} ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Couldn't send the verification code");
    }
  }
}

export class SmsOtpSender implements OtpSender {
  private readonly logger = new Logger("SmsOtpSender");
  channel(): OtpChannel {
    return "sms";
  }
  async send(phone: string, code: string): Promise<void> {
    // TODO: call the SMS gateway.
    this.logger.debug(`SMS OTP → ${phone}: ${code}`);
  }
}

/** Dev/test channel: logs the code (no provider). Pair with the non-prod devCode in requestOtp. */
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger("ConsoleOtpSender");
  channel(): OtpChannel {
    return "console";
  }
  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`DEV OTP for ${phone}: ${code}`);
  }
}

export function selectOtpSender(env: Env): OtpSender {
  switch (env.OTP_CHANNEL) {
    case "console":
      return new ConsoleOtpSender();
    case "sms":
      return new SmsOtpSender();
    default:
      return new WhatsAppOtpSender(env);
  }
}
