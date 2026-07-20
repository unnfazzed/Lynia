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
});
