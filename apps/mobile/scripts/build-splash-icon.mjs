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
 *   node scripts/build-splash-icon.mjs            # write the assets
 *   node scripts/build-splash-icon.mjs --check    # fail if a committed asset has drifted
 *
 * Writes `assets/splash-icon.svg` (the generated source, committed so a reviewer can read the diff)
 * and `assets/splash-icon.png` (what `app.config.ts` hands to expo-splash-screen). Run it after
 * touching the lockup geometry or the brand paths.
 *
 * `--check` runs in `pnpm lint` (the convention `contract-snapshot.mjs --check` already uses) and
 * covers the half a unit test cannot. `src/ui/__tests__/splash-lockup.test.ts` compares the committed
 * SVG against the module, but the PNG is what actually ships to the native launch screen: revert or
 * hand-edit `splash-icon.png` alone and the whole suite still passes while users boot into a
 * different picture. That is exactly the failure this pipeline exists to prevent — the bare-dove
 * asset that shipped without a wordmark — so the artifact that ships gets its own check.
 *
 * The PNG is compared as PIXELS, not bytes. Both sides are flattened onto the splash background and
 * decoded to raw RGBA, so a different libvips build antialiasing an edge costs a rounding error
 * instead of a red build, while a stale or wrong image still fails loudly. Flattening also settles
 * the transparent-pixel ambiguity (RGB under alpha 0 is arbitrary) and compares what is actually
 * seen.
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

/**
 * Tolerance for `--check`, as a mean absolute difference across every RGBA byte. It is 0.000 on the
 * machine that generated the asset; the headroom exists for a different libvips build. Measured
 * against the failure this exists to catch: the previous bare-dove icon, rescaled to defeat the
 * dimension check, scores 26.475 — a ~17x margin over the tolerance, so the headroom cannot quietly
 * swallow a genuine drift.
 */
const PIXEL_TOLERANCE = 1.5;

/** The ground expo-splash-screen composites the transparent lockup over — `tokens.color.accent`. */
const SPLASH_BACKGROUND = "#00B14F";

const CHECK_ONLY = process.argv.includes("--check");

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
const pngPath = path.join(mobileRoot, "assets/splash-icon.png");

// Transparent ground: expo-splash-screen composites this over its own `backgroundColor`, so the
// green must NOT be baked in — see the note on splashLockupSvg().
const width = Math.round(SPLASH_LOCKUP_WIDTH * RASTER_SCALE);
const png = await sharp(Buffer.from(svg), { density: 72 * RASTER_SCALE })
  .resize({ width })
  .png()
  .toBuffer();

/**
 * Decode to raw RGBA over the splash ground — what a user sees, minus encoder-level detail.
 *
 * `toColourspace("srgb")` is belt-and-braces: on sharp 0.35.3 `flatten()` already promotes a
 * single-channel (b-w) PNG to 4 channels, so this is a no-op today — verified against a forged
 * grayscale asset. It is here so the channel count is a property of the pipeline rather than an
 * incidental behaviour of one libvips build, because the comparison below is only meaningful if both
 * sides decode to the same shape.
 */
async function pixels(source) {
  return sharp(source)
    .flatten({ background: SPLASH_BACKGROUND })
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

/**
 * Mean absolute per-channel difference between two images, or Infinity if they are not comparable
 * at all (different dimensions, or decoded to different buffer shapes).
 *
 * The Infinity returns matter more than they look. Without the length guard the loop would read past
 * the shorter buffer, `Math.abs(undefined)` would poison the sum with NaN, and the caller's
 * `drift > PIXEL_TOLERANCE` would be FALSE — so a mismatched asset would pass the very check that
 * exists to stop one shipping. Every incomparable case therefore has to fail loudly, not average out.
 */
export async function pixelDrift(a, b) {
  const [x, y] = await Promise.all([pixels(a), pixels(b)]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) return Infinity;
  if (x.data.length !== y.data.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < x.data.length; i++) sum += Math.abs(x.data[i] - y.data[i]);
  const drift = sum / x.data.length;
  return Number.isFinite(drift) ? drift : Infinity;
}

function fail(message) {
  console.error(`splash-icon --check FAILED: ${message}`);
  console.error("Regenerate with: pnpm --filter @lynia/mobile build-splash-icon");
  process.exit(1);
}

if (CHECK_ONLY) {
  const committedSvg = await readFile(svgPath, "utf8").catch(() => null);
  if (committedSvg === null) fail("assets/splash-icon.svg is missing");
  if (committedSvg !== svg) fail("assets/splash-icon.svg has drifted from src/ui/splash-lockup.ts");

  const committedPng = await readFile(pngPath).catch(() => null);
  if (committedPng === null) fail("assets/splash-icon.png is missing");

  const drift = await pixelDrift(png, committedPng);
  if (!Number.isFinite(drift)) {
    const [got, want] = await Promise.all([sharp(committedPng).metadata(), sharp(png).metadata()]);
    fail(
      `assets/splash-icon.png is not comparable to the lockup — committed ${got.width}×${got.height}px ` +
        `(${got.channels}ch), expected ${want.width}×${want.height}px (${want.channels}ch)`,
    );
  }
  if (drift > PIXEL_TOLERANCE) {
    fail(`assets/splash-icon.png does not match the lockup (mean channel drift ${drift.toFixed(3)})`);
  }
  console.log(
    `splash-icon --check: OK — svg matches the module, png matches the lockup ` +
      `(drift ${drift.toFixed(3)}, tolerance ${PIXEL_TOLERANCE})`,
  );
} else {
  await writeFile(svgPath, svg);
  await writeFile(pngPath, png);

  const { width: outWidth, height: outHeight } = await sharp(png).metadata();
  console.log(
    `splash-icon: ${outWidth}×${outHeight}px from a ${SPLASH_LOCKUP_WIDTH.toFixed(2)}×${SPLASH_LOCKUP_HEIGHT}dp lockup ` +
      `(app.config.ts imageWidth must be ${SPLASH_IMAGE_WIDTH})`,
  );
}
