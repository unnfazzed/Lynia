import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../config/env";
import { buildFcmMessage, FCM_CREDENTIAL_FIX, FcmPush } from "./fcm.push";
import { NoopPush } from "./noop.push";
import { selectPush } from "./push.module";
import { maskToken } from "./push.interface";

const base = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_URL: "postgresql://localhost/lynia",
  CLOUD_PROVIDER: "gcp",
  STORAGE_BUCKET: "lynia-media",
  OTEL_SERVICE_NAME: "lynia-api",
  PUSH_PROVIDER: "noop",
} as Env;

describe("push adapter selection (D7 portability)", () => {
  it("selects the log-only noop by default (dev/test/unprovisioned)", () => {
    expect(selectPush({ ...base, PUSH_PROVIDER: "noop" })).toBeInstanceOf(NoopPush);
  });

  it("selects FCM when PUSH_PROVIDER=fcm — a config-only switch", () => {
    expect(selectPush({ ...base, PUSH_PROVIDER: "fcm" })).toBeInstanceOf(FcmPush);
  });

  it("on GCP, fcm without FCM_PROJECT_ID still boots (ADC supplies the project) — warning only", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      expect(selectPush({ ...base, PUSH_PROVIDER: "fcm" })).toBeInstanceOf(FcmPush);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("FCM_PROJECT_ID is unset"));
    } finally {
      warn.mockRestore();
    }
  });

  it("noop never trips the off-GCP boot-guard, even with no Firebase config (the cutover setting)", () => {
    expect(selectPush({ ...base, CLOUD_PROVIDER: "azure", PUSH_PROVIDER: "noop" })).toBeInstanceOf(NoopPush);
  });

  describe("off-GCP boot-guard (C5): fcm requires FCM_PROJECT_ID + a service account (inline JSON or file)", () => {
    const azure = { ...base, CLOUD_PROVIDER: "azure", PUSH_PROVIDER: "fcm" } as Env;
    const fix = FCM_CREDENTIAL_FIX;
    // Shape-only fake (no real key material): parseServiceAccount checks fields, not the key itself.
    const saJson = JSON.stringify({
      project_id: "lynia-fcm",
      client_email: "push@lynia-fcm.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n",
    });

    it("boots with FcmPush when both are set", () => {
      expect(
        selectPush({ ...azure, FCM_PROJECT_ID: "lynia-fcm", GOOGLE_APPLICATION_CREDENTIALS: "/mnt/secrets/fcm.json" }),
      ).toBeInstanceOf(FcmPush);
    });

    it("fails boot when FCM_PROJECT_ID is missing, in the one-line X4 format", () => {
      expect(() => selectPush({ ...azure, GOOGLE_APPLICATION_CREDENTIALS: "/mnt/secrets/fcm.json" })).toThrow(
        `Missing FCM_PROJECT_ID: every FCM push send fails (no Firebase project to address). ${fix}`,
      );
    });

    it("fails boot when no credential is set, in the one-line X4 format", () => {
      expect(() => selectPush({ ...azure, FCM_PROJECT_ID: "lynia-fcm" })).toThrow(
        `Missing FCM_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS: every FCM push send fails (no Firebase credential off GCP). ${fix}`,
      );
    });

    it("boots with FcmPush on an inline service account (Azure: Key Vault → FCM_SERVICE_ACCOUNT_JSON)", () => {
      expect(selectPush({ ...azure, FCM_PROJECT_ID: "lynia-fcm", FCM_SERVICE_ACCOUNT_JSON: saJson })).toBeInstanceOf(FcmPush);
    });

    it("fails boot on inline JSON that is not JSON, without echoing it", () => {
      const run = () => selectPush({ ...azure, FCM_PROJECT_ID: "lynia-fcm", FCM_SERVICE_ACCOUNT_JSON: "secret-not-json" });
      expect(run).toThrow(/^Invalid FCM_SERVICE_ACCOUNT_JSON: not valid JSON\./);
      expect(run).not.toThrow(/secret-not-json/);
    });

    it("fails boot on inline JSON missing the key fields", () => {
      expect(() =>
        selectPush({ ...azure, FCM_PROJECT_ID: "lynia-fcm", FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "x" }) }),
      ).toThrow(/^Invalid FCM_SERVICE_ACCOUNT_JSON: missing client_email or private_key/);
    });

    it("fails boot when both are missing (names FCM_PROJECT_ID first)", () => {
      expect(() => selectPush(azure)).toThrow(/^Missing FCM_PROJECT_ID: /);
    });
  });

  it("constructing FcmPush does no network/credential work (lazy init)", () => {
    // Must not throw despite no ADC / firebase-admin init — the SDK only loads on first send.
    expect(() => new FcmPush("test-project")).not.toThrow();
  });

  it("noop send resolves to an ok, non-dead result", async () => {
    await expect(new NoopPush().send({ token: "t", title: "x", body: "y" })).resolves.toEqual({
      ok: true,
      invalidToken: false,
    });
  });

  it("noop sendEach returns one ok result per message, in order", async () => {
    const out = await new NoopPush().sendEach([
      { token: "a", title: "x", body: "y" },
      { token: "b", title: "x", body: "y" },
    ]);
    expect(out).toEqual([
      { ok: true, invalidToken: false },
      { ok: true, invalidToken: false },
    ]);
  });

  it("noop sendEach on an empty batch resolves to an empty array", async () => {
    await expect(new NoopPush().sendEach([])).resolves.toEqual([]);
  });
});

describe("maskToken — never log a whole device token", () => {
  it("keeps a short head + tail and elides the middle", () => {
    expect(maskToken("abcdefgh12345678ijklmnop")).toBe("abcdefgh…mnop");
  });
  it("fully elides a short token", () => {
    expect(maskToken("short")).toBe("…");
  });
});

describe("buildFcmMessage — payload contract", () => {
  it("maps a PushMessage to an FCM message with a notification block", () => {
    expect(buildFcmMessage({ token: "tok", title: "Order update", body: "Rider en route" })).toEqual({
      token: "tok",
      notification: { title: "Order update", body: "Rider en route" },
    });
  });

  it("includes the data map only when it has entries", () => {
    expect(buildFcmMessage({ token: "tok", title: "t", body: "b", data: { orderId: "o1" } }).data).toEqual({
      orderId: "o1",
    });
    expect(buildFcmMessage({ token: "tok", title: "t", body: "b" }).data).toBeUndefined();
    expect(buildFcmMessage({ token: "tok", title: "t", body: "b", data: {} }).data).toBeUndefined();
  });

  it("sets no TTL by default (provider default lifetime) — Fix 5 is opt-in per kind", () => {
    const m = buildFcmMessage({ token: "tok", title: "t", body: "b" });
    expect(m.android).toBeUndefined();
    expect(m.apns).toBeUndefined();
  });

  it("maps ttlSeconds to android.ttl (MILLISECONDS) and an absolute apns-expiration (epoch SECONDS)", () => {
    const now = 1_770_000_000; // fixed epoch seconds
    const spy = vi.spyOn(Date, "now").mockReturnValue(now * 1000);
    try {
      const m = buildFcmMessage({ token: "tok", title: "t", body: "b", ttlSeconds: 90 });
      // firebase-admin's AndroidConfig.ttl is milliseconds.
      expect(m.android).toEqual({ ttl: 90_000 });
      // apns-expiration is an absolute unix epoch (seconds) at which to drop, i.e. now + ttl.
      expect(m.apns?.headers["apns-expiration"]).toBe(String(now + 90));
    } finally {
      spy.mockRestore();
    }
  });

  it("sets no collapse key by default (D-O3 is opt-in per kind)", () => {
    const m = buildFcmMessage({ token: "tok", title: "t", body: "b" });
    expect(m.android).toBeUndefined();
    expect(m.apns).toBeUndefined();
  });

  it("maps collapseKey to android.collapseKey and apns-collapse-id (D-O3)", () => {
    const m = buildFcmMessage({ token: "tok", title: "t", body: "b", collapseKey: "order:o1:assigned" });
    expect(m.android).toEqual({ collapseKey: "order:o1:assigned" });
    expect(m.apns?.headers["apns-collapse-id"]).toBe("order:o1:assigned");
  });

  it("carries both ttlSeconds and collapseKey together without one clobbering the other's android/apns fields", () => {
    const now = 1_770_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(now * 1000);
    try {
      const m = buildFcmMessage({ token: "tok", title: "t", body: "b", ttlSeconds: 90, collapseKey: "order:o1:assigned" });
      expect(m.android).toEqual({ ttl: 90_000, collapseKey: "order:o1:assigned" });
      expect(m.apns?.headers["apns-expiration"]).toBe(String(now + 90));
      expect(m.apns?.headers["apns-collapse-id"]).toBe("order:o1:assigned");
    } finally {
      spy.mockRestore();
    }
  });
});
