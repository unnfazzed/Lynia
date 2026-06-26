import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { selectOtpSender } from "./otp-sender";

const env = (channel: Env["OTP_CHANNEL"]) => ({ OTP_CHANNEL: channel }) as Env;

describe("selectOtpSender", () => {
  it("selects the channel from config", () => {
    expect(selectOtpSender(env("console")).channel()).toBe("console");
    expect(selectOtpSender(env("sms")).channel()).toBe("sms");
    expect(selectOtpSender(env("whatsapp")).channel()).toBe("whatsapp");
  });
});
