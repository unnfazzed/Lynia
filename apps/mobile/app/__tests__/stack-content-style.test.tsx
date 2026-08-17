/**
 * RCA §1.2 (docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md): the native-stack's default scene
 * background is WHITE, and it painted the cold-start splash→home gap — the reported green→white
 * flash. The fix is a contentStyle on the root Stack's screenOptions. This pins BOTH halves:
 * the wash is applied, and it is NOT white — `tokens.color.bg` is literally #FFFFFF, so a
 * well-meaning "use the background token" refactor would silently reintroduce the flash while
 * every other test stayed green (the outside-voice review caught exactly that in the plan).
 */
import { tokens } from "@lynia/shared/tokens";

// _layout.tsx runs module-scope boot work (Sentry init, splash hold, font/boot prewarm). All of it
// is inert or mocked under jest-expo, but pin the seams explicitly so this test can't start
// depending on their real behavior.
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(async () => true), hideAsync: jest.fn(async () => true) }));
jest.mock("../../src/boot/prewarm", () => ({
  prewarmBootReads: jest.fn(() => ({
    session: Promise.resolve(null),
    onboardingSeen: Promise.resolve(false),
    rolePref: Promise.resolve(null),
    coldStartData: Promise.resolve(null),
  })),
}));
jest.mock("../../src/ui/fonts", () => ({
  prewarmFonts: jest.fn(),
  useAppFonts: jest.fn(() => [true, null]),
  fontFamilies: { regular: "Inter_400Regular", semibold: "Inter_600SemiBold", bold: "Inter_700Bold" },
  interFamily: jest.fn(() => "Inter_400Regular"),
  applyInterToTextComponents: jest.fn(),
}));
jest.mock("../../src/telemetry/sentry", () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (c: unknown) => c,
}));

import { stackScreenOptions } from "../_layout";

describe("root Stack contentStyle (splash→home transition ground)", () => {
  it("paints transitions in accentWash, never the native default white", () => {
    expect(stackScreenOptions.contentStyle.backgroundColor).toBe(tokens.color.accentWash);
    // The trap the review caught: tokens.color.bg IS #FFFFFF — using it here is a no-op that
    // re-opens the white flash. Keep the guard even if the palette moves.
    expect(stackScreenOptions.contentStyle.backgroundColor.toLowerCase()).not.toBe("#ffffff");
    expect(stackScreenOptions.contentStyle.backgroundColor).not.toBe(tokens.color.bg);
  });

  it("keeps headers hidden (the app draws its own chrome)", () => {
    expect(stackScreenOptions.headerShown).toBe(false);
  });
});
