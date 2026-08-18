#!/usr/bin/env node
/**
 * Builds the NATIVE launch-screen image from the one definition of the splash lockup.
 *
 * The cold start shows the brand-green frame three times — the native launch screen baked into the
 * binary, the JS `SplashView` on route "/", and the `BootSplashHold` overlay — and it is supposed to
 * look like ONE screen (owner instruction 2026-08-18: one screen, logo and wordmark, no animations).
 * Only the JS two share a React tree; the native one is a PNG the build bakes in, so the only thing
 * that can keep it honest is generating it from the same numbers. That definition lives in
 * `src/ui/splash-lockup.ts`; this script renders it.
 *
 *   node scripts/build-splash-icon.mjs
 *
 * Writes `assets/splash-icon.svg` (the generated source, committed so a reviewer can read the diff)
 * and `assets/splash-icon.png` (what `app.config.ts` hands to expo-splash-screen). Run it after
 * touching the lockup geometry or the brand paths; `src/ui/__tests__/splash-lockup.test.ts` fails if
 * the committed SVG has drifted from the module, so CI catches a forgotten rebuild.
 *
 * esbuild is used only to strip types off the lockup module (it imports `@lynia/shared/tokens` and
 * the brand path data, so plain `node --strip-types` can't resolve it).
 */
import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Raster width, in pixels. expo-splash-screen's Android drawables go up to xxxhdpi, which is a 4×
 * multiplier on the dp size (@expo/prebuild-config .../withAndroidSplashImages.js), and iOS asks for
 * @3x — so 8× the dp width leaves the densest target with pixels to spare and never upscales.
 */
const RASTER_SCALE = 8;

async function loadLockupModule() {
  const dir = await mkdtemp(path.join(tmpdir(), "lynia-splash-"));
  const outfile = path.join(dir, "splash-lockup.mjs");
  await build({
    entryPoints: [path.join(mobileRoot, "src/ui/splash-lockup.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  try {
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const { splashLockupSvg, SPLASH_LOCKUP_WIDTH, SPLASH_LOCKUP_HEIGHT, SPLASH_IMAGE_WIDTH } = await loadLockupModule();

const svg = splashLockupSvg();
const svgPath = path.join(mobileRoot, "assets/splash-icon.svg");
await writeFile(svgPath, svg);

// Transparent ground: expo-splash-screen composites this over its own `backgroundColor`, so the
// green must NOT be baked in — see the note on splashLockupSvg().
const width = Math.round(SPLASH_LOCKUP_WIDTH * RASTER_SCALE);
const png = await sharp(Buffer.from(svg), { density: 72 * RASTER_SCALE })
  .resize({ width })
  .png()
  .toBuffer();
const pngPath = path.join(mobileRoot, "assets/splash-icon.png");
await writeFile(pngPath, png);

const { width: outWidth, height: outHeight } = await sharp(await readFile(pngPath)).metadata();
console.log(
  `splash-icon: ${outWidth}×${outHeight}px from a ${SPLASH_LOCKUP_WIDTH.toFixed(2)}×${SPLASH_LOCKUP_HEIGHT}dp lockup ` +
    `(app.config.ts imageWidth must be ${SPLASH_IMAGE_WIDTH})`,
);
