/**
 * MOB-BOOT-04 regression (docs/COLD-START-CRASH-RCA-2026-08-21.md).
 *
 * Internal-track build #31 installed and then died on every cold start. The fault was native, but the
 * FATALITY was this file's shape: `app/_layout.tsx` runs Sentry init, the splash hold and the font /
 * boot prewarm at module scope, and expo-router evaluates it EAGERLY while building the route tree —
 * `getRoutes()` calls `loadRoute()` for every `_layout`. The `Try` boundary that catches render errors
 * for the whole app is built FROM that load, so it cannot catch it; `Sentry.wrap` is not a boundary and
 * Expo's `registerRootComponent` adds one only in dev. A synchronous throw in that block is therefore a
 * process kill — uncaught JS → `DefaultJSExceptionHandler` rethrows on the native thread → Android's
 * "LyniaGo keeps stopping" — rather than a recoverable error screen.
 *
 * These tests make each boot step hostile in turn and assert the module still evaluates. None of the
 * steps is a correctness precondition: fonts fall back to the system face, prewarm's consumers call it
 * again from their own effects, and the splash hides on first paint regardless. A degraded boot beats
 * no boot.
 *
 * Deliberately asserts on `require`, not on render: the failure being pinned is module EVALUATION, and
 * a test that only rendered would pass even if the module scope were unguarded again.
 */
import { tokens } from "@lynia/shared/tokens";

jest.mock("../../src/telemetry/sentry", () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (c: unknown) => c,
}));

const boom = (): never => {
  throw new Error("native module unavailable at cold start");
};

/** Evaluate app/_layout.tsx fresh, with the named seams mocked for this load only. */
function loadLayout(seams: () => void): { module: unknown; captured: unknown[] } {
  let module: unknown;
  const captured: unknown[] = [];
  jest.isolateModules(() => {
    jest.doMock("../../src/telemetry/sentry", () => ({
      initSentry: jest.fn(),
      captureException: jest.fn((error: unknown) => captured.push(error)),
      addBreadcrumb: jest.fn(),
      wrap: (c: unknown) => c,
    }));
    seams();
    module = require("../_layout");
  });
  return { module, captured };
}

const healthySplash = {
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
};
const healthyPrewarm = {
  prewarmBootReads: jest.fn(() => ({
    session: Promise.resolve(null),
    onboardingSeen: Promise.resolve(false),
    rolePref: Promise.resolve(null),
    coldStartData: Promise.resolve(null),
  })),
};
const healthyFonts = {
  prewarmFonts: jest.fn(),
  useAppFonts: jest.fn(() => [true, null]),
  fontFamilies: { regular: "Inter_400Regular", semibold: "Inter_600SemiBold", bold: "Inter_700Bold" },
  interFamily: jest.fn(() => "Inter_400Regular"),
  applyInterToTextComponents: jest.fn(),
};

describe("root layout module scope survives a hostile boot step (MOB-BOOT-04)", () => {
  afterEach(() => {
    jest.dontMock("expo-splash-screen");
    jest.dontMock("../../src/boot/prewarm");
    jest.dontMock("../../src/ui/fonts");
    jest.dontMock("../../src/telemetry/sentry");
    jest.clearAllMocks();
  });

  it("evaluates when SplashScreen.setOptions throws (a sync native call with no catch of its own)", () => {
    const { module, captured } = loadLayout(() => {
      jest.doMock("expo-splash-screen", () => ({ ...healthySplash, setOptions: boom }));
      jest.doMock("../../src/boot/prewarm", () => healthyPrewarm);
      jest.doMock("../../src/ui/fonts", () => healthyFonts);
    });

    expect(module).toBeDefined();
    // Swallowed is not enough — it must be REPORTED, or the next incident is diagnosed from a photo again.
    expect(captured).toHaveLength(1);
  });

  it("evaluates when preventAutoHideAsync throws synchronously rather than rejecting", () => {
    // The existing `.catch()` covers a REJECTED promise; it cannot cover a synchronous throw from the
    // native call, which is a different failure and the one that kills a launch.
    const { module, captured } = loadLayout(() => {
      jest.doMock("expo-splash-screen", () => ({ ...healthySplash, preventAutoHideAsync: boom }));
      jest.doMock("../../src/boot/prewarm", () => healthyPrewarm);
      jest.doMock("../../src/ui/fonts", () => healthyFonts);
    });

    expect(module).toBeDefined();
    expect(captured).toHaveLength(1);
  });

  it("evaluates when prewarmBootReads throws (keystore / notification native reads)", () => {
    const { module, captured } = loadLayout(() => {
      jest.doMock("expo-splash-screen", () => healthySplash);
      jest.doMock("../../src/boot/prewarm", () => ({ prewarmBootReads: boom }));
      jest.doMock("../../src/ui/fonts", () => healthyFonts);
    });

    expect(module).toBeDefined();
    expect(captured).toHaveLength(1);
  });

  it("evaluates when prewarmFonts throws, and still exports a usable navigator config", () => {
    const { module, captured } = loadLayout(() => {
      jest.doMock("expo-splash-screen", () => healthySplash);
      jest.doMock("../../src/boot/prewarm", () => healthyPrewarm);
      jest.doMock("../../src/ui/fonts", () => ({ ...healthyFonts, prewarmFonts: boom }));
    });

    expect(captured).toHaveLength(1);
    // The module is not merely importable, it is still correct: a guard that produced a half-built
    // module would trade a crash for a subtler bug.
    const { stackScreenOptions } = module as { stackScreenOptions: { contentStyle: { backgroundColor: string } } };
    expect(stackScreenOptions.contentStyle.backgroundColor).toBe(tokens.color.accentWash);
  });

  it("evaluates even when the error REPORTER itself throws", () => {
    // The nastiest shape, and the one a naive guard gets wrong: bootStep catches the step's throw and
    // hands it to captureException, so a reporter that throws escapes the catch and kills the launch
    // anyway. Guarded inside src/telemetry/sentry.ts; asserted here from the outside.
    let module: unknown;
    jest.isolateModules(() => {
      jest.doMock("../../src/telemetry/sentry", () => ({
        initSentry: jest.fn(),
        captureException: jest.fn(() => {
          throw new Error("reporting blew up while reporting");
        }),
        addBreadcrumb: jest.fn(),
        wrap: (c: unknown) => c,
      }));
      jest.doMock("expo-splash-screen", () => ({ ...healthySplash, setOptions: boom }));
      jest.doMock("../../src/boot/prewarm", () => ({ prewarmBootReads: boom }));
      jest.doMock("../../src/ui/fonts", () => healthyFonts);
      module = require("../_layout");
    });

    expect(module).toBeDefined();
  });

  it("evaluates when EVERY boot step throws at once", () => {
    const { module, captured } = loadLayout(() => {
      jest.doMock("expo-splash-screen", () => ({
        ...healthySplash,
        preventAutoHideAsync: boom,
        setOptions: boom,
      }));
      jest.doMock("../../src/boot/prewarm", () => ({ prewarmBootReads: boom }));
      jest.doMock("../../src/ui/fonts", () => ({ ...healthyFonts, prewarmFonts: boom }));
    });

    expect(module).toBeDefined();
    // One report per failed step: a guard that stopped at the first would hide the rest.
    expect(captured).toHaveLength(4);
  });
});
