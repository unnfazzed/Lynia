import { createHmac } from "node:crypto";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";

const SECRET = "app_secret_test_0123456789";

function req(raw: string, headers: Record<string, string> = {}): RawBodyRequest<Request> {
  return { rawBody: Buffer.from(raw, "utf8"), headers } as unknown as RawBodyRequest<Request>;
}
function sign(raw: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
}
function fakeRes() {
  const calls: { status?: number; body?: string; type?: string } = {};
  const res = {
    status: vi.fn((code: number) => {
      calls.status = code;
      return res;
    }),
    type: vi.fn((t: string) => {
      calls.type = t;
      return res;
    }),
    send: vi.fn((body: string) => {
      calls.body = body;
      return res;
    }),
  } as unknown as Response;
  return { res, calls };
}
function fakeMetrics() {
  const failed: string[] = [];
  return { metrics: { incWhatsappOtpDeliveryFailed: (reason: string) => failed.push(reason) } as unknown as MetricsService, failed };
}
const ctl = (env: Partial<Env>, metrics: MetricsService) => new WhatsappWebhookController(env as Env, metrics);

describe("WhatsappWebhookController.verify (GET subscription handshake)", () => {
  it("echoes the challenge back (as text/plain) when mode+token match and the challenge is digits-only", () => {
    const { metrics } = fakeMetrics();
    const { res, calls } = fakeRes();
    ctl({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: "tok" }, metrics).verify("subscribe", "tok", "123456", res);
    expect(calls.status).toBe(200);
    expect(calls.body).toBe("123456");
    expect(calls.type).toBe("text/plain");
  });

  it("403s on a wrong token, wrong mode, missing challenge, a non-digits challenge, or no configured token at all", () => {
    const { metrics } = fakeMetrics();
    const c = ctl({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: "tok" }, metrics);
    const cases: Array<[string | undefined, string | undefined, string | undefined]> = [
      ["subscribe", "wrong", "123"],
      ["unsubscribe", "tok", "123"],
      ["subscribe", "tok", undefined],
      // Defense in depth: Meta's challenge is always digits-only — reject anything else even with a
      // matching token, rather than reflecting an attacker-shaped value (CodeQL reflected-XSS finding).
      ["subscribe", "tok", "<script>alert(1)</script>"],
    ];
    for (const [mode, token, challenge] of cases) {
      const { res, calls } = fakeRes();
      c.verify(mode, token, challenge, res);
      expect(calls.status).toBe(403);
    }
    const { res: res2, calls: calls2 } = fakeRes();
    ctl({ WHATSAPP_WEBHOOK_VERIFY_TOKEN: undefined }, metrics).verify("subscribe", "anything", "123", res2);
    expect(calls2.status).toBe(403);
  });
});

describe("WhatsappWebhookController.receive (POST delivery-status events)", () => {
  it("verifies the signature, logs + records a metric per failed status", async () => {
    const { metrics, failed } = fakeMetrics();
    const raw = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ status: "failed", errors: [{ title: "Message Undeliverable" }] }] } }] }],
    });
    const res = await ctl({ WHATSAPP_APP_SECRET: SECRET }, metrics).receive(
      req(raw, { "x-hub-signature-256": sign(raw) }),
    );
    expect(res).toEqual({ received: true });
    expect(failed).toEqual(["Message Undeliverable"]);
  });

  it("401s on an invalid/missing signature when a secret is configured", async () => {
    const { metrics } = fakeMetrics();
    const raw = JSON.stringify({ entry: [] });
    const c = ctl({ WHATSAPP_APP_SECRET: SECRET }, metrics);
    expect(() => c.receive(req(raw, { "x-hub-signature-256": "sha256=deadbeef" }))).toThrow(/invalid webhook signature/i);
    expect(() => c.receive(req(raw))).toThrow(/invalid webhook signature/i);
  });

  it("fails closed (401) when unconfigured in production or whatsapp-channel mode", () => {
    const { metrics } = fakeMetrics();
    const raw = JSON.stringify({ entry: [] });
    expect(() =>
      ctl({ WHATSAPP_APP_SECRET: undefined, NODE_ENV: "production" }, metrics).receive(req(raw)),
    ).toThrow(/not configured/i);
    expect(() =>
      ctl({ WHATSAPP_APP_SECRET: undefined, NODE_ENV: "test", OTP_CHANNEL: "whatsapp" }, metrics).receive(req(raw)),
    ).toThrow(/not configured/i);
  });

  it("no-ops (never throws) when unconfigured OUTSIDE production/whatsapp mode — dev/CI without a secret", () => {
    const { metrics } = fakeMetrics();
    const raw = JSON.stringify({ entry: [] });
    const res = ctl({ WHATSAPP_APP_SECRET: undefined, NODE_ENV: "test", OTP_CHANNEL: "console" }, metrics).receive(req(raw));
    expect(res).toEqual({ received: true });
  });

  it("never throws on a malformed body after a valid signature — logs and returns received", async () => {
    const { metrics } = fakeMetrics();
    const raw = "{not json";
    const res = await ctl({ WHATSAPP_APP_SECRET: SECRET }, metrics).receive(
      req(raw, { "x-hub-signature-256": sign(raw) }),
    );
    expect(res).toEqual({ received: true });
  });

  it("ignores non-failed statuses — no metric recorded", async () => {
    const { metrics, failed } = fakeMetrics();
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ status: "delivered" }] } }] }] });
    await ctl({ WHATSAPP_APP_SECRET: SECRET }, metrics).receive(req(raw, { "x-hub-signature-256": sign(raw) }));
    expect(failed).toEqual([]);
  });
});
