// Fresh module load per test so the module-level `enabled`/`loadAttempted` flags reset; the
// @react-native-firebase mocks (jest.config moduleNameMapper) give us the spies.
//
// The SDKs are required OUTSIDE `isolateModules`, for the same reason the sibling sentry.test.ts
// documents: ../crashlytics defers BOTH requires into loadSdk(), which runs from initCrashlytics()
// after this callback has returned — so they resolve against the normal module registry, not the
// isolated one. Capturing them inside the isolation would hand the test a DIFFERENT instance of each
// mock than the code under test actually calls, and every spy assertion would silently see zero calls.
//
// Spelled out rather than `Record<string, jest.Mock>`: an index signature is `| undefined` under this
// project's noUncheckedIndexedAccess, so every `fb.recordError` assertion below would need a `!`.
interface CrashlyticsMock {
  getCrashlytics: jest.Mock;
  setCrashlyticsCollectionEnabled: jest.Mock;
  log: jest.Mock;
  setAttributes: jest.Mock;
  recordError: jest.Mock;
  didCrashOnPreviousExecution: jest.Mock;
  crash: jest.Mock;
}

describe("mobile Crashlytics helper (inert until a google-services.json is provisioned)", () => {
  // Scoped INSIDE the describe deliberately. This file has no top-level import/export, so tsc reads
  // it as a SCRIPT sharing one global scope with every other script test file — and the sibling
  // sentry.test.ts declares its own top-level `load()`. At file scope these collide and `pnpm
  // typecheck` fails with "Duplicate function implementation"; jest never notices, because it wraps
  // each file in a CommonJS closure. The describe body is that closure's equivalent for tsc.
  const app = require("@react-native-firebase/app") as { getApps: jest.Mock };
  const fb = require("@react-native-firebase/crashlytics") as CrashlyticsMock;

  /** The sentinel the mock's getCrashlytics returns, captured before any test can mutate it. Every
   *  modular call takes the instance as its FIRST argument, so asserting on it is what proves the
   *  module threads the right one through rather than a fresh/undefined handle. */
  const INSTANCE = fb.getCrashlytics();

  function load(): typeof import("../crashlytics") {
    let mod!: typeof import("../crashlytics");
    jest.isolateModules(() => {
      mod = require("../crashlytics");
    });
    return mod;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes recorded calls but NOT implementations, so a mockReturnValue set by one
    // test would leak into the next. Re-pin both seams to their provisioned defaults each time.
    app.getApps.mockReturnValue([{ name: "[DEFAULT]" }]);
    fb.getCrashlytics.mockReturnValue(INSTANCE);
    fb.didCrashOnPreviousExecution.mockResolvedValue(false);
  });

  // The unprovisioned case is the one that actually ships today: dev, jest and the QA APK lane all
  // build without a google-services.json, so `getApps()` is empty and NOTHING here may touch the SDK.
  describe("with no Firebase app configured", () => {
    beforeEach(() => app.getApps.mockReturnValue([]));

    it("never loads the crashlytics SDK, and reports itself disabled", () => {
      const mod = load();
      mod.initCrashlytics();
      expect(fb.getCrashlytics).not.toHaveBeenCalled();
      expect(fb.setCrashlyticsCollectionEnabled).not.toHaveBeenCalled();
      expect(mod.isCrashlyticsEnabled()).toBe(false);
    });

    it("no-ops every reporting call without throwing", () => {
      const mod = load();
      mod.initCrashlytics();
      expect(() => mod.recordError(new Error("x"))).not.toThrow();
      expect(() => mod.logCrumb("crumb")).not.toThrow();
      expect(() => mod.setCrashKeys({ a: "b" })).not.toThrow();
      expect(fb.recordError).not.toHaveBeenCalled();
      expect(fb.log).not.toHaveBeenCalled();
      expect(fb.setAttributes).not.toHaveBeenCalled();
    });

    it("resolves didCrashOnPreviousExecution to false rather than rejecting", async () => {
      const mod = load();
      mod.initCrashlytics();
      await expect(mod.didCrashOnPreviousExecution()).resolves.toBe(false);
      expect(fb.didCrashOnPreviousExecution).not.toHaveBeenCalled();
    });
  });

  describe("once provisioned", () => {
    it("settles the collection switch explicitly and arms the JS half", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      expect(fb.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(INSTANCE, true);
      expect(mod.isCrashlyticsEnabled()).toBe(true);
    });

    it("stamps the environment as a custom key so preview and production reports separate", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true, environment: "preview" });
      expect(fb.setAttributes).toHaveBeenCalledWith(INSTANCE, { environment: "preview" });
    });

    it("forwards a handled error, threading the instance and the grouping name", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      const err = new Error("compose-map-not-loaded");
      mod.recordError(err, "boot-step");
      expect(fb.recordError).toHaveBeenCalledWith(INSTANCE, err, "boot-step");
    });

    // `recordError` is called from bootStep's catch, where the thrown value is `unknown` — a string
    // or an object thrown by a third-party SDK would otherwise reach the native bridge as a non-Error
    // and be dropped, losing exactly the boot failure this module was added to witness.
    it("wraps a non-Error thrown value rather than passing it through", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      mod.recordError("plain string failure");
      const [, recorded] = fb.recordError.mock.calls[0] as [unknown, Error];
      expect(recorded).toBeInstanceOf(Error);
      expect(recorded.message).toBe("plain string failure");
    });

    it("forwards logs and custom keys", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      mod.logCrumb("opened /send");
      mod.setCrashKeys({ screen: "send" });
      expect(fb.log).toHaveBeenCalledWith(INSTANCE, "opened /send");
      expect(fb.setAttributes).toHaveBeenCalledWith(INSTANCE, { screen: "send" });
    });
  });

  // The kill switch is EXPO_PUBLIC_* on purpose (OTA-shippable to an installed binary) — see the
  // CrashlyticsConfig doc comment. It must write through to native in BOTH directions, because the
  // native side persists the last value into preferences that outlive the process.
  describe("kill switch", () => {
    it("disables collection natively and reports itself off", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: false });
      expect(fb.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(INSTANCE, false);
      expect(mod.isCrashlyticsEnabled()).toBe(false);
      mod.recordError(new Error("x"));
      expect(fb.recordError).not.toHaveBeenCalled();
    });

    it("re-enables explicitly, so a build that once shipped disabled does not stay disabled", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      expect(fb.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(INSTANCE, true);
    });
  });

  // This module is armed from app/_layout.tsx module scope, where expo-router has not yet built the
  // error boundary that would catch a throw — so a throw here is a process kill, not an error screen.
  // That is the failure MOB-BOOT-04 (docs/COLD-START-CRASH-RCA-2026-08-21.md) was opened for, and it
  // would be a poor joke for the module added to observe it to reproduce it.
  it("never throws when the native SDK does, and degrades to reporting nothing", () => {
    fb.getCrashlytics.mockImplementation(() => {
      throw new Error("No Firebase App '[DEFAULT]' has been created");
    });
    const mod = load();
    expect(() => mod.initCrashlytics({ enabled: true })).not.toThrow();
    expect(mod.isCrashlyticsEnabled()).toBe(false);
    expect(() => mod.recordError(new Error("x"))).not.toThrow();
    expect(fb.recordError).not.toHaveBeenCalled();
  });

  // Mirrors the Sentry nativeCrash contract: a tester on an unprovisioned build must get an honest
  // "nothing would be reported" instead of a hard crash that silently reports nothing.
  describe("the QA crash test", () => {
    it("refuses to crash, and reports false, when Crashlytics is inert", () => {
      app.getApps.mockReturnValue([]);
      const mod = load();
      mod.initCrashlytics();
      expect(mod.crashNow()).toBe(false);
      expect(fb.crash).not.toHaveBeenCalled();
    });

    it("fires the native crash once Crashlytics is armed", () => {
      const mod = load();
      mod.initCrashlytics({ enabled: true });
      expect(mod.crashNow()).toBe(true);
      expect(fb.crash).toHaveBeenCalledWith(INSTANCE);
    });
  });

  it("surfaces a previous-execution crash once armed (the crash-loop signal)", async () => {
    fb.didCrashOnPreviousExecution.mockResolvedValue(true);
    const mod = load();
    mod.initCrashlytics({ enabled: true });
    await expect(mod.didCrashOnPreviousExecution()).resolves.toBe(true);
    expect(fb.didCrashOnPreviousExecution).toHaveBeenCalledWith(INSTANCE);
  });
});
