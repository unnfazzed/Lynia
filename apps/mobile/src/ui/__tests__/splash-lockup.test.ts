/**
 * The cold start is ONE screen (owner instructions 2026-08-18 and 2026-08-24): the NATIVE splash —
 * green frame, dove, LyniaGo wordmark — held until the destination presents
 * (src/boot/boot-splash-hold.tsx). `app/splash.view.tsx` stays as the identical dev-reload fallback
 * and parity target, so the native asset and the JS tree still have to be the same picture.
 *
 * The native asset is now TWO files baked in by expo-splash-screen: the Android VectorDrawable
 * (`assets/splashscreen_logo.xml` — resolution-independent, MOB-BOOT-05's fix for the PNG lane's
 * resampling blur) and the iOS storyboard PNG. The last time a native asset disagreed with the JS
 * frame (it was the bare dove, with no wordmark) the disagreement shipped: the wordmark appeared
 * mid-boot and the mark jumped upward. Nothing about a committed asset can fail a typecheck, so
 * these are the checks that keep the pictures the same one.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  SPLASH_CANVAS_DP,
  SPLASH_DOVE_SIZE,
  SPLASH_GAP,
  SPLASH_IMAGE_WIDTH,
  SPLASH_LOCKUP_HEIGHT,
  SPLASH_LOCKUP_WIDTH,
  SPLASH_WORDMARK_SIZE,
  splashLockupSvg,
  splashLogoVectorDrawableXml,
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

  it("has a committed Android vector drawable that still matches the module", () => {
    // Byte-equality, same contract as the SVG: the drawable is copied VERBATIM into
    // res/drawable/splashscreen_logo.xml by the expo-splash-screen plugin, so the committed file IS
    // what Android renders — no rasteriser in between to tolerate.
    expect(read("assets/splashscreen_logo.xml")).toBe(splashLogoVectorDrawableXml());
  });

  it("draws the vector on the same 288dp canvas the PNG pipeline composed", () => {
    // The plugin ignores imageWidth when a drawable is supplied — the drawable's intrinsic size is
    // the geometry. 288dp is both the Android 12+ splash-icon spec canvas and what
    // @expo/prebuild-config composed the PNG onto, so the on-screen lockup size is unchanged.
    expect(SPLASH_CANVAS_DP).toBe(288);
    const xml = splashLogoVectorDrawableXml();
    expect(xml).toContain('android:width="288dp"');
    expect(xml).toContain('android:height="288dp"');
    expect(xml).toContain('android:viewportWidth="288"');
    expect(xml).toContain('android:viewportHeight="288"');
    // Both wordmark glyph paths, white on the (plugin-supplied) green ground — the pop-in guard,
    // vector edition.
    expect(xml.match(/android:pathData="M131 9Q/g)).toHaveLength(1);
    expect(xml.match(/android:pathData="M2747 17Q/g)).toHaveLength(1);
    // The keel's translucency must survive the rgba → #AARRGGBB conversion (0.62 → 0x9E).
    expect(xml).toContain('android:fillColor="#9EFFFFFF"');
  });

  it("names the PNG that actually ships, so the --check lane knows what to validate", () => {
    // This suite can only reach the SVG: comparing the PNG means rasterising, which needs sharp and a
    // plain-Node context. That half lives in `build-splash-icon.mjs --check`, run by `pnpm lint` —
    // without it a reverted or hand-edited splash-icon.png would pass every test here while changing
    // the launch screen users actually see.
    // Asserted through the parsed `scripts.lint` value, not a raw substring search: the string also
    // appears in this file and in the script's own docs, so a text match would still pass if the
    // check were dropped from lint entirely.
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts.lint).toContain("node scripts/build-splash-icon.mjs --check");
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
    // The storyboard lane (iOS — Android renders the vector drawable and ignores imageWidth) fits
    // the image `contain` into a SQUARE imageWidth×imageWidth box, so for a portrait lockup the
    // height is the side that matters. Passing the width would render the native frame ~22% small
    // and reintroduce a size jump against the JS frame.
    expect(SPLASH_IMAGE_WIDTH).toBe(154);
    const config = read("app.config.ts");
    expect(config).toContain(`imageWidth: ${SPLASH_IMAGE_WIDTH},`);
    expect(config).toContain('image: "./assets/splash-icon.png"');
    expect(config).toContain('resizeMode: "contain"');
  });

  it("pins app.config.ts to the vector drawable on Android (MOB-BOOT-05)", () => {
    // Dropping this line silently reverts Android to the PNG/density-bucket lane and its
    // resampling blur — the first-logo-looks-worse defect this file's vector half exists to fix.
    expect(read("app.config.ts")).toContain('android: { drawable: { icon: "./assets/splashscreen_logo.xml" } }');
  });

  it("pins the boot's green window background and its post-boot reset pair", () => {
    // The window background is the ONLY surface that can show white during the boot handoff; green
    // makes the reported intermittent white flash impossible. It is safe to keep green ONLY because
    // the boot release schedules the reset back to the app bg — the two move together.
    expect(read("app.config.ts")).toContain('backgroundColor: "#00B14F"');
    expect(read("src/boot/boot-splash-hold.tsx")).toContain("scheduleWindowBackgroundReset()");
  });
});

// The screen-transition half of "no animations" is pinned elsewhere, because it is scoped rather
// than global: `bootStackScreenOptions.animation === "none"` applies only while the boot phase is
// live (app/__tests__/stack-content-style.test.tsx), and the phase ends when BootSplashHold releases
// (src/boot/__tests__/boot-splash-hold.test.tsx) so in-app navigation keeps its animation.
describe("cold start does not animate", () => {
  it("pins the native splash to hide without a fade OR a duration", () => {
    // `duration: 0` is the half Android actually reads: SplashScreenManager.kt (expo-splash-screen
    // 0.29.24) ignores `fade` and always runs its exit as an alpha animation over `duration`
    // (default 400ms). Since the splash now releases onto the DESTINATION screen, a 400ms fade
    // would be the destination fading in — an animation in a boot that must have none. Matched
    // WITHOUT its statement terminator: the call is wrapped in the root layout's `bootStep` guard
    // (MOB-BOOT-04), so the line ends `}));`.
    expect(read("app/_layout.tsx")).toContain("SplashScreen.setOptions({ fade: false, duration: 0 })");
  });
});
