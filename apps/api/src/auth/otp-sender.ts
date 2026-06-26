import { Logger } from "@nestjs/common";
import type { Env } from "../config/env";

export type OtpChannel = "whatsapp" | "sms" | "console";

/** Send-adapter (E4): the channel is a flag, so an SMS/console fallback is config-only insurance
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
    // TODO: call the WhatsApp BSP template-message API (deferred — WhatsApp on hold).
    this.logger.debug(`WhatsApp OTP → ${phone}: ${code}`);
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
      return new WhatsAppOtpSender();
  }
}
