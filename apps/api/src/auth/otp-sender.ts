import { Logger } from "@nestjs/common";
import type { Env } from "../config/env";

export type OtpChannel = "whatsapp" | "sms";

/** Send-adapter (E4): the channel is a flag, so an SMS fallback is config-only insurance
 *  against WhatsApp BSP onboarding delay — the auth subsystem is identical either way. */
export interface OtpSender {
  channel(): OtpChannel;
  send(phone: string, code: string): Promise<void>;
}

export const OTP_SENDER = Symbol("OTP_SENDER");

export class WhatsAppOtpSender implements OtpSender {
  private readonly logger = new Logger("WhatsAppOtpSender");
  channel(): OtpChannel {
    return "whatsapp";
  }
  async send(phone: string, code: string): Promise<void> {
    // TODO(auth lane finalize): call the WhatsApp BSP template-message API.
    this.logger.debug(`WhatsApp OTP → ${phone}: ${code}`);
  }
}

export class SmsOtpSender implements OtpSender {
  private readonly logger = new Logger("SmsOtpSender");
  channel(): OtpChannel {
    return "sms";
  }
  async send(phone: string, code: string): Promise<void> {
    // TODO(auth lane finalize): call the SMS gateway.
    this.logger.debug(`SMS OTP → ${phone}: ${code}`);
  }
}

export function selectOtpSender(env: Env): OtpSender {
  return env.OTP_CHANNEL === "sms" ? new SmsOtpSender() : new WhatsAppOtpSender();
}
