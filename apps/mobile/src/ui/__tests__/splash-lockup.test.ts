/**
 * The cold start is ONE screen (owner instruction 2026-08-18): the green frame with the dove and the
 * LyniaGo wordmark, shown by the NATIVE launch screen, then by `app/splash.view.tsx` on route "/",
 * then by `BootSplashHold` over the destination — with nothing moving across those handoffs.
 *
 * Only the last two share a React tree. The native one is a PNG baked into the binary by
 * expo-splash-screen, and the last time it disagreed with the JS frame (it was the bare dove, with
 * no wordmark) the disagreement shipped: the wordmark appeared mid-boot and the mark jumped upward.
 * Nothing about a committed PNG can fail a typecheck, so these are the checks that keep the two
 * pictures the same one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  SPLASH_DOVE_SIZE,
  SPLASH_GAP,
  SPLASH_IMAGE_WIDTH,
  SPLASH_LOCKUP_HEIGHT,
  SPLASH_LOCKUP_WIDTH,
  SPLASH_WORDMARK_SIZE,
  splashLockupSvg,
} from "../splash-lockup";

const mobileRoot = path.resolve(__dirname, "../../..");
const read = (rel: string): string => readFileSync(path.join(mobileRoot, rel), "utf8");

describe("splash lockup — the native launch image and the JS frame are one picture", () => {
  it("keeps the mock's geometry (screens.jsx `Splash`: dove 104, gap 18, wordmark 32)", () => {
    expect(SPLASH_DOVE_SIZE).toBe(104);
    expect(SPLASH_GAP).toBe(18);
    expect(SPLASH_WORDMARK_SIZE).toBe(32);
    expect(SPLASH_LOCKUP_HEIGHT).toBe(SPLASH_DOVE_SIZE + SPLASH_GAP + SPLASH_WORDMARK_SIZE);
    // The wordmark is the wider element, so it sets the lockup box — if this ever flips, the
    // `imageWidth` reasoning below (and the comment in app.config.ts) stops holding.
    expect(SPLASH_LOCKUP_WIDTH).toBeGreaterThan(SPLASH_DOVE_SIZE);
    expect(SPLASH_LOCKUP_HEIGHT).toBeGreaterThan(SPLASH_LOCKUP_WIDTH);
  });

  it("has a committed SVG that still matches the module (rebuild: pnpm build-splash-icon)", () => {
    expect(read("assets/splash-icon.svg")).toBe(splashLockupSvg());
  });

  it("names the PNG that actually ships, so the --check lane knows what to validate", () => {
    // This suite can only reach the SVG: comparing the PNG means rasterising, which needs sharp and a
    // plain-Node context. That half lives in `build-splash-icon.mjs --check`, run by `pnpm lint` —
    // without it a reverted or hand-edited splash-icon.png would pass every test here while changing
    // the launch screen users actually see.
    expect(read("package.json")).toContain("build-splash-icon.mjs --check");
    expect(read("app.config.ts")).toContain('image: "./assets/splash-icon.png"');
  });

  it("draws the wordmark, not just the mark — the pop-in this whole file exists to prevent", () => {
    const svg = splashLockupSvg();
    // Two wordmark glyph paths ("Lynia" and "Go"), both white on the green ground.
    expect(svg.match(/<path d="M131 9Q/g)).toHaveLength(1);
    expect(svg.match(/<path d="M2747 17Q/g)).toHaveLength(1);
    // Transparent ground: expo-splash-screen composites this over its own backgroundColor, so a
    // baked-in green rectangle would show wherever the OS letterboxes the image.
    expect(svg).not.toContain('fill="#00B14F"/>\n  <svg');
    expect(svg).not.toMatch(/<rect[^>]*fill="#00B14F"/);
  });

  it("pins app.config.ts's imageWidth to the lockup HEIGHT, not its width", () => {
    // expo-splash-screen fits the image `contain` into a SQUARE imageWidth×imageWidth box, so for a
    // portrait lockup the height is the side that matters. Passing the width would render the native
    // frame ~22% small and reintroduce a size jump at the handoff.
    expect(SPLASH_IMAGE_WIDTH).toBe(154);
    const config = read("app.config.ts");
    expect(config).toContain(`imageWidth: ${SPLASH_IMAGE_WIDTH},`);
    expect(config).toContain('image: "./assets/splash-icon.png"');
    expect(config).toContain('resizeMode: "contain"');
  });
});

// The screen-transition half of "no animations" is pinned elsewhere, because it is scoped rather
// than global: `bootStackScreenOptions.animation === "none"` applies only while the boot phase is
// live (app/__tests__/stack-content-style.test.tsx), and the phase ends when BootSplashHold releases
// (app/__tests__/boot-splash-hold.test.tsx) so in-app navigation keeps its animation.
describe("cold start does not animate", () => {
  it("pins the native splash to hide without a fade", () => {
    expect(read("app/_layout.tsx")).toContain("SplashScreen.setOptions({ fade: false });");
  });
});
