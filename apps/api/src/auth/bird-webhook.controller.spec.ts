import { createHmac } from "node:crypto";
import { Logger, type RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import { BirdWebhookController } from "./bird-webhook.controller";

const RAW_KEY = Buffer.from("bird-webhook-signing-key-0123456789");
const SECRET = `whsec_${RAW_KEY.toString("base64")}`;
const ID = "msg_2b1c";

const nowSec = () => Math.floor(Date.now() / 1000);

function signed(raw: string, ts: string = String(nowSec()), id: string = ID): Record<string, string> {
  const signature = `v1,${createHmac("sha256", RAW_KEY).update(`${id}.${ts}.${raw}`, "utf8").digest("base64")}`;
  return { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": signature };
}
function req(raw: string, headers: Record<string, string> = {}): RawBodyRequest<Request> {
  return { rawBody: Buffer.from(raw, "utf8"), headers } as unknown as RawBodyRequest<Request>;
}
function fakeMetrics() {
  const failed: Array<{ status: string; code: string }> = [];
  return {
    metrics: {
      incBirdOtpDeliveryFailed: (status: string, code: string) => failed.push({ status, code }),
    } as unknown as MetricsService,
    failed,
  };
}
const ctl = (env: Partial<Env>, metrics: MetricsService) => new BirdWebhookController(env as Env, metrics);
const armed = { BIRD_WEBHOOK_SECRET: SECRET, OTP_CHANNEL: "bird" } as Partial<Env>;

const failureBody = JSON.stringify({
  type: "sms.failed",
  data: { sms_id: "sms_01kyd", error: { code: "E12003" }, to: "+263771234567" },
});

afterEach(() => vi.restoreAllMocks());

describe("BirdWebhookController.receive", () => {
  it("counts a signed non-delivery so a dropped OTP is visible", () => {
    const { metrics, failed } = fakeMetrics();
    const res = ctl(armed, metrics).receive(req(failureBody, signed(failureBody)));
    expect(res).toEqual({ received: true });
    expect(failed).toEqual([{ status: "failed", code: "E12003" }]);
  });

  it("does not count a successful delivery", () => {
    const body = JSON.stringify({ type: "sms.delivered", data: { sms_id: "sms_01kyd" } });
    const { metrics, failed } = fakeMetrics();
    ctl(armed, metrics).receive(req(body, signed(body)));
    expect(failed).toEqual([]);
  });

  it("rejects an unsigned or forged delivery", () => {
    const { metrics, failed } = fakeMetrics();
    const controller = ctl(armed, metrics);
    expect(() => controller.receive(req(failureBody))).toThrow(/invalid webhook signature/i);
    const forged = { ...signed(failureBody), "webhook-signature": "v1,Zm9yZ2Vk" };
    expect(() => controller.receive(req(failureBody, forged))).toThrow(/invalid webhook signature/i);
    expect(failed).toEqual([]);
  });

  // A captured delivery keeps a valid signature forever; only the timestamp window stops the replay.
  it("rejects a replayed delivery from outside the timestamp window", () => {
    const stale = String(nowSec() - 301);
    const { metrics, failed } = fakeMetrics();
    expect(() => ctl(armed, metrics).receive(req(failureBody, signed(failureBody, stale)))).toThrow(
      /replay window/i,
    );
    expect(failed).toEqual([]);
  });

  // An unverifiable receiver is worse than none: anyone could forge "delivered" or spam the metric.
  it("fails closed when the secret is missing in production or while Bird is the live channel", () => {
    const { metrics } = fakeMetrics();
    expect(() => ctl({ OTP_CHANNEL: "bird" }, metrics).receive(req(failureBody))).toThrow(/not configured/i);
    expect(() =>
      ctl({ NODE_ENV: "production", OTP_CHANNEL: "whatsapp" } as Partial<Env>, metrics).receive(req(failureBody)),
    ).toThrow(/not configured/i);
  });

  it("no-ops when unconfigured off-production and Bird is not the live channel", () => {
    const { metrics, failed } = fakeMetrics();
    const env = { NODE_ENV: "test", OTP_CHANNEL: "console" } as Partial<Env>;
    expect(ctl(env, metrics).receive(req(failureBody))).toEqual({ received: true });
    expect(failed).toEqual([]);
  });

  // 500ing back at Bird would trigger its retry storm for a fault that is purely ours.
  it("swallows a malformed body on an authentic delivery rather than 500ing", () => {
    const bad = "not json";
    const { metrics, failed } = fakeMetrics();
    expect(ctl(armed, metrics).receive(req(bad, signed(bad)))).toEqual({ received: true });
    expect(failed).toEqual([]);
  });

  it("never logs the recipient's phone number", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const { metrics } = fakeMetrics();
    ctl(armed, metrics).receive(req(failureBody, signed(failureBody)));
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("sms_01kyd");
    expect(logged).not.toContain("263771234567");
  });
});
