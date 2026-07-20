import { describe, expect, it, vi } from "vitest";
import { captureException, initSentry, isSentryEnabled } from "./sentry";

// The SDK must never be initialized without a DSN — that's the inert-when-unconfigured contract that
// keeps dev/test/unprovisioned envs quiet. We assert on the exported enabled flag + capture no-op.
vi.mock("@sentry/node", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe("initSentry (inert without a DSN)", () => {
  it("does not enable Sentry when no DSN is provided", () => {
    initSentry({ dsn: undefined, tracesSampleRate: 0.1 });
    expect(isSentryEnabled()).toBe(false);
  });

  it("captureException is a safe no-op while disabled", () => {
    // Should not throw even though the SDK was never initialized.
    expect(() => captureException(new Error("boom"), { correlationId: "abc" })).not.toThrow();
  });
});
