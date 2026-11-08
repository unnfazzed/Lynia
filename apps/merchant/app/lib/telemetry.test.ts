// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const sentryInit = vi.fn();
const posthogInit = vi.fn();
vi.mock("@sentry/browser", () => ({ init: sentryInit }));
vi.mock("posthog-js", () => ({ default: { init: posthogInit, register: vi.fn() } }));

describe("merchant telemetry (free plans)", () => {
  it("is inert without keys: neither SDK starts", async () => {
    vi.resetModules();
    const { startTelemetry } = await import("./telemetry");
    startTelemetry();
    await new Promise((r) => setTimeout(r, 0));
    expect(sentryInit).not.toHaveBeenCalled();
    expect(posthogInit).not.toHaveBeenCalled();
  });

  it("with keys: Sentry errors only (no tracing, no PII, capped), PostHog page views only", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://k@o1.ingest.us.sentry.io/1");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { startTelemetry, MAX_ERRORS_PER_PAGE } = await import("./telemetry");
    startTelemetry();
    await vi.waitFor(() => expect(sentryInit).toHaveBeenCalled());
    await vi.waitFor(() => expect(posthogInit).toHaveBeenCalled());
    const s = sentryInit.mock.calls[0]![0];
    expect(s.tracesSampleRate).toBe(0);
    expect(s.sendDefaultPii).toBe(false);
    for (let i = 0; i < MAX_ERRORS_PER_PAGE; i++) expect(s.beforeSend({})).toEqual({});
    expect(s.beforeSend({})).toBeNull();
    const [key, opts] = posthogInit.mock.calls[0]!;
    expect(key).toBe("phc_test");
    expect(opts).toMatchObject({ autocapture: false, disable_session_recording: true, api_host: "https://eu.i.posthog.com" });
    vi.unstubAllEnvs();
  });
});
