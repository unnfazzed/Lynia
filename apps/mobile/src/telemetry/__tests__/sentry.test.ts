// Fresh module load per test so the module-level `enabled` flag resets; the @sentry/react-native mock
// (jest.config moduleNameMapper) gives us init/captureException spies. initSentry takes an explicit
// config here because EXPO_PUBLIC_* env vars are inlined at build time and can't be varied at runtime.
function load() {
  let mod!: typeof import("../sentry");
  let sentry!: typeof import("@sentry/react-native");
  jest.isolateModules(() => {
    sentry = require("@sentry/react-native");
    mod = require("../sentry");
  });
  return { mod, sentry };
}

describe("mobile Sentry helper (roadmap 1.1 — inert without a DSN)", () => {
  afterEach(() => jest.clearAllMocks());

  it("does not initialize, and captureException is a no-op, when no DSN is provided", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: undefined });
    expect(sentry.init).not.toHaveBeenCalled();
    expect(mod.isSentryEnabled()).toBe(false);
    expect(() => mod.captureException(new Error("x"))).not.toThrow();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("initializes with the DSN, no PII, and perf tracing OFF by default (metered-data market)", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://key@o1.ingest.sentry.io/2",
        tracesSampleRate: 0,
        sendDefaultPii: false,
      }),
    );
    expect(mod.isSentryEnabled()).toBe(true);
    mod.captureException(new Error("boom"));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("passes through an explicit non-zero traces-sample-rate when opted in", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2", tracesSampleRate: 0.2 });
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0.2 }));
  });

  // The QA crash test (src/ui TestBuildBanner) must not hard-crash a build that would report nothing —
  // a tester would read the crash itself as proof the pipeline works.
  it("nativeCrash refuses to crash, and reports false, when Sentry is inert", () => {
    const { mod, sentry } = load();
    expect(mod.nativeCrash()).toBe(false);
    expect(sentry.nativeCrash).not.toHaveBeenCalled();
  });

  it("nativeCrash fires the native crash once Sentry is armed", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
    expect(mod.nativeCrash()).toBe(true);
    expect(sentry.nativeCrash).toHaveBeenCalledTimes(1);
  });

  // Structured detail, added after the Sentry issue `compose-map-not-loaded (onMapReady=true)` proved
  // undiagnosable: the varying part rode in the MESSAGE, which Sentry fingerprints on, so one failure
  // opened an issue per value and the fields worth filtering by were stuck inside a string.
  it("forwards tags/extra as the per-event capture context, leaving no scope pushed", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
    const err = new Error("compose-map-not-loaded");
    mod.captureException(err, { tags: { map_load_signal: "onMapLoaded" } });
    expect(sentry.captureException).toHaveBeenCalledWith(err, {
      tags: { map_load_signal: "onMapLoaded" },
    });
  });

  it("captures without context when none is given, so existing callers are unaffected", () => {
    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
    const err = new Error("boom");
    mod.captureException(err);
    expect(sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });

  // A native crash carries no JS state of its own — breadcrumbs are the only trail it gets.
  it("records breadcrumbs once armed, and drops them silently when inert", () => {
    const inert = load();
    inert.mod.addBreadcrumb("compose-map-retry", { attempt: 2 });
    expect(inert.sentry.addBreadcrumb).not.toHaveBeenCalled();

    const { mod, sentry } = load();
    mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
    mod.addBreadcrumb("compose-map-retry", { attempt: 2 });
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: "compose-map-retry",
      data: { attempt: 2 },
      level: "info",
    });
  });
});
