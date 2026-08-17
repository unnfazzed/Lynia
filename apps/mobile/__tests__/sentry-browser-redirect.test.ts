import path from "path";
import { shouldRedirect, stubPath, STUBBED_PACKAGES } from "../metro-shims/sentry-browser-redirect";

// eslint-disable-next-line @typescript-eslint/no-var-requires -- the stub is a CJS Proxy module
const stub = require("../metro-shims/sentry-browser-stub");

describe("sentry-browser-redirect (MOB-BOOT-03-SIB-1)", () => {
  const browserIndex =
    "/repo/node_modules/.pnpm/@sentry+browser@8.55.0/node_modules/@sentry/browser/build/npm/cjs/index.js";

  it("redirects the three browser-only packages when Sentry imports them", () => {
    for (const pkg of STUBBED_PACKAGES) {
      expect(shouldRedirect(pkg, browserIndex)).toBe(true);
    }
  });

  it("does NOT redirect @sentry-internal/browser-utils — live on-device via breadcrumbsIntegration", () => {
    expect(shouldRedirect("@sentry-internal/browser-utils", browserIndex)).toBe(false);
  });

  it("does not redirect the same names imported from outside Sentry's packages", () => {
    expect(shouldRedirect("@sentry-internal/replay", "/repo/apps/mobile/src/telemetry/sentry.ts")).toBe(false);
    expect(shouldRedirect("@sentry-internal/replay", "/repo/node_modules/some-lib/index.js")).toBe(false);
  });

  it("does not redirect Sentry's other imports", () => {
    expect(shouldRedirect("@sentry/core", browserIndex)).toBe(false);
    expect(shouldRedirect("./userfeedback.js", browserIndex)).toBe(false);
  });

  it("stub path points at the on-disk stub module", () => {
    expect(stubPath).toBe(path.join(__dirname, "..", "metro-shims", "sentry-browser-stub.js"));
  });

  describe("the stub is callable-by-construction (no symbol can be undefined)", () => {
    it("known integration factories return an inert named integration", () => {
      const integration = stub.replayIntegration();
      expect(integration.name).toBe("Replay");
      expect(() => integration.setupOnce()).not.toThrow();
      expect(stub.replayCanvasIntegration().name).toBe("ReplayCanvas");
      expect(stub.feedbackIntegration().name).toBe("Feedback");
    });

    it("buildFeedbackIntegration (feedbackSync/Async's factory-factory) composes safely", () => {
      const built = stub.buildFeedbackIntegration();
      expect(built().name).toBe("Feedback");
    });

    it("getters return undefined instead of a fake instance", () => {
      expect(stub.getReplay()).toBeUndefined();
      expect(stub.getFeedback()).toBeUndefined();
    });

    it("a symbol a future Sentry bump references is still a callable no-op, never undefined", () => {
      const unknown = stub.someFutureBrowserOnlyIntegration;
      expect(typeof unknown).toBe("function");
      expect(unknown().name).toBe("someFutureBrowserOnlyIntegration");
    });

    it("module-interop probes stay honest (no phantom default export)", () => {
      expect(stub.__esModule).toBeUndefined();
      expect(stub.default).toBeUndefined();
    });
  });
});
