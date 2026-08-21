// Fresh module load per test so the module-level `enabled`/`loadAttempted` flags reset; the
// @sentry/react-native mock (jest.config moduleNameMapper) gives us init/captureException spies.
// initSentry takes an explicit config here because EXPO_PUBLIC_* env vars are inlined at build time
// and can't be varied at runtime.
//
// The SDK is required OUTSIDE `isolateModules` on purpose. Since MOB-BOOT-04 the import is deferred:
// ../sentry requires the SDK lazily, from inside initSentry(), which runs after this callback has
// returned — so it resolves against the normal module registry, not the isolated one. Capturing the
// SDK inside the isolation would hand the test a DIFFERENT instance of the mock than the one the code
// under test actually calls, and every spy assertion would silently see zero calls.
function load() {
  const sentry = require("@sentry/react-native") as typeof import("@sentry/react-native");
  let mod!: typeof import("../sentry");
  jest.isolateModules(() => {
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

  /**
   * MOB-BOOT-04 regression (docs/COLD-START-CRASH-RCA-2026-08-21.md).
   *
   * These pin the ONE property that matters about this module: loading it, and arming it, must never
   * throw. `app/_layout.tsx` imports it at module scope, and expo-router evaluates that file eagerly
   * while building the route tree — BEFORE the `Try` boundary it derives from that same load exists.
   * So a throw here is a process kill, not an error screen.
   *
   * This is not theoretical. `@sentry/react-native`'s entry re-exports `./tracing` and
   * `./replay/CustomMask`, which make three unguarded module-scope `UIManager.hasViewManagerConfig()`
   * calls. Under Paper that call caught its own failure and returned false; under the New Architecture
   * it resolves to `unstable_hasComponent`, which throws. Nothing in the suite could see that, because
   * jest.config's moduleNameMapper swaps the whole SDK for a hand-written mock and RN's jest setup
   * replaces UIManager wholesale — so these tests make the SDK hostile on purpose instead.
   */
  describe("never takes the app down with it (MOB-BOOT-04)", () => {
    /**
     * Load ../sentry with an SDK that explodes the way the real one can.
     *
     * Deliberately `resetModules` + `require` rather than `isolateModules`: ../sentry requires the SDK
     * LAZILY, from inside initSentry(), which runs after this helper has returned. Inside
     * `isolateModules` that deferred require would resolve against a different registry than the one
     * `doMock` seeded here, and the hostile factory would silently not apply — the tests would then
     * pass for the wrong reason (an SDK that failed to load looks identical to one that loaded and
     * misbehaved). One registry throughout is what makes these assertions mean anything.
     */
    function loadWithHostileSdk(factory: () => unknown) {
      jest.resetModules();
      jest.doMock("@sentry/react-native", factory);
      return require("../sentry") as typeof import("../sentry");
    }

    afterEach(() => {
      jest.dontMock("@sentry/react-native");
      jest.resetModules();
    });

    it("stays inert instead of throwing when the SDK throws on import", () => {
      const mod = loadWithHostileSdk(() => {
        throw new Error("hasViewManagerConfig: unstable_hasComponent threw at module scope");
      });

      expect(() => mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" })).not.toThrow();
      expect(mod.isSentryEnabled()).toBe(false);
      expect(() => mod.captureException(new Error("x"))).not.toThrow();
      expect(() => mod.addBreadcrumb("x")).not.toThrow();
      expect(mod.nativeCrash()).toBe(false);
    });

    it("returns the root component unwrapped when the SDK could not be loaded", () => {
      const mod = loadWithHostileSdk(() => {
        throw new Error("boom");
      });
      const Root = (): null => null;

      mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
      // Passthrough, not a crash: an app root that renders unwrapped beats one that never renders.
      expect(mod.wrap(Root)).toBe(Root);
    });

    it("stays inert instead of throwing when the SDK loads but init() throws", () => {
      const mod = loadWithHostileSdk(() => ({
        init: () => {
          throw new Error("native module unavailable");
        },
        captureException: jest.fn(),
        addBreadcrumb: jest.fn(),
        nativeCrash: jest.fn(),
        wrap: (c: unknown) => c,
      }));

      expect(() => mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" })).not.toThrow();
      expect(mod.isSentryEnabled()).toBe(false);
    });

    /**
     * The reporter must not be able to defeat the guard that calls it.
     *
     * `app/_layout.tsx`'s `bootStep` calls `captureException` from inside the catch block whose whole
     * job is to stop a boot-step throw killing the launch. If the SDK is ARMED and its own
     * `captureException` throws, an unguarded call would escape that catch, reach module scope, and
     * kill the process — the guard undone by its own error handler. The inert path was never the
     * risky one; this is.
     */
    it("swallows a throw from an ARMED SDK's captureException", () => {
      const mod = loadWithHostileSdk(() => ({
        init: jest.fn(),
        captureException: () => {
          throw new Error("transport blew up mid-report");
        },
        addBreadcrumb: jest.fn(),
        nativeCrash: jest.fn(),
        wrap: (c: unknown) => c,
      }));

      mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
      expect(mod.isSentryEnabled()).toBe(true);
      expect(() => mod.captureException(new Error("the original boot failure"))).not.toThrow();
    });

    it("swallows a throw from an ARMED SDK's addBreadcrumb", () => {
      const mod = loadWithHostileSdk(() => ({
        init: jest.fn(),
        captureException: jest.fn(),
        addBreadcrumb: () => {
          throw new Error("scope unavailable");
        },
        nativeCrash: jest.fn(),
        wrap: (c: unknown) => c,
      }));

      mod.initSentry({ dsn: "https://key@o1.ingest.sentry.io/2" });
      // Documented as "safe to call unconditionally", and callers sprinkle it through hot paths
      // without wrapping it — so that promise has to hold even when the SDK is armed and broken.
      expect(() => mod.addBreadcrumb("compose-map-retry", { attempt: 2 })).not.toThrow();
    });

    // The load is deferred, so an unprovisioned build keeps the SDK off the cold-start graph
    // entirely — the same win analytics.tsx already took for PostHog. A hostile SDK that is never
    // required is the only way to assert "not loaded" from the outside.
    it("does not load the SDK at all when no DSN is configured", () => {
      // Asserted on the FACTORY, not on the outcome. A hostile factory alone proves nothing here:
      // loadSentry catches every throw from the require, so if the SDK were loaded regardless of the
      // DSN, the throw would be swallowed, `enabled` would stay false, and "does not throw" plus
      // "not enabled" would both still pass. Counting the invocation is the only thing that can tell
      // "never required" from "required and quietly failed".
      const required = jest.fn();
      const mod = loadWithHostileSdk(() => {
        required();
        throw new Error("must never be required without a DSN");
      });

      expect(() => mod.initSentry({ dsn: undefined })).not.toThrow();
      expect(mod.isSentryEnabled()).toBe(false);
      expect(required).not.toHaveBeenCalled();
    });
  });
});
