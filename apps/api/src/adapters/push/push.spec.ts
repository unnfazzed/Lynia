import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env";
import { buildFcmMessage, FcmPush } from "./fcm.push";
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
});
