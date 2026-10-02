import path from "path";
import {
  shouldRedirect,
  stubPath,
  STUBBED_BROWSER_INDEX_IMPORTS,
  STUBBED_BROWSER_UTILS_INDEX_IMPORTS,
  STUBBED_PACKAGES,
  STUBBED_REACT_INDEX_IMPORTS,
} from "../metro-shims/sentry-browser-redirect";

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

  describe("bundle trim (2026-10-02): web-only modules re-exported by the package indexes", () => {
    const browserEsmIndex =
      "/repo/node_modules/.pnpm/@sentry+browser@10.12.0/node_modules/@sentry/browser/build/npm/esm/index.js";
    const reactIndex = "/repo/node_modules/.pnpm/@sentry+react@10.12.0/node_modules/@sentry/react/build/esm/index.js";
    const utilsIndex =
      "/repo/node_modules/.pnpm/@sentry-internal+browser-utils@10.12.0/node_modules/@sentry-internal/browser-utils/build/esm/index.js";

    it("redirects the browser index's web-only re-exports", () => {
      for (const mod of STUBBED_BROWSER_INDEX_IMPORTS) {
        expect(shouldRedirect(mod, browserEsmIndex)).toBe(true);
        expect(shouldRedirect(mod, browserIndex)).toBe(true);
      }
    });

    it("redirects @sentry/react's router instrumentation only from its index", () => {
      for (const mod of STUBBED_REACT_INDEX_IMPORTS) expect(shouldRedirect(mod, reactIndex)).toBe(true);
      expect(shouldRedirect("./reactrouterv6.js", "/repo/node_modules/@sentry/react/build/esm/reactrouterv7.js")).toBe(false);
    });

    it("redirects browser-utils' page-load metrics only from its index", () => {
      for (const mod of STUBBED_BROWSER_UTILS_INDEX_IMPORTS) expect(shouldRedirect(mod, utilsIndex)).toBe(true);
      expect(shouldRedirect("./metrics/inp.js", "/repo/node_modules/@sentry-internal/browser-utils/build/esm/metrics/instrument.js")).toBe(
        false,
      );
    });

    it("keeps every module the RN SDK's live code calls into", () => {
      // tracing/request.js (instrumentOutgoingRequests), breadcrumbs, httpclient, the fetch transport,
      // the browser session integration, and browser-utils' XHR/DOM/history instrumentation.
      for (const mod of [
        "./tracing/request.js",
        "./integrations/breadcrumbs.js",
        "./integrations/httpclient.js",
        "./integrations/browsersession.js",
        "./transports/fetch.js",
        "./sdk.js",
      ]) {
        expect(shouldRedirect(mod, browserEsmIndex)).toBe(false);
      }
      for (const mod of ["./metrics/instrument.js", "./metrics/resourceTiming.js", "./instrument/xhr.js", "./instrument/dom.js"]) {
        expect(shouldRedirect(mod, utilsIndex)).toBe(false);
      }
      for (const mod of ["./profiler.js", "./errorboundary.js", "./redux.js", "./sdk.js"]) {
        expect(shouldRedirect(mod, reactIndex)).toBe(false);
      }
    });

    it("does not redirect the same relative names from an unrelated package", () => {
      expect(shouldRedirect("./report-dialog.js", "/repo/node_modules/some-lib/build/npm/esm/index.js")).toBe(false);
    });
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
