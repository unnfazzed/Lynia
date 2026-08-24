import {
  DOVE_BODY_POLYGONS,
  DOVE_CREASE_PATHS,
  DOVE_CREASE_WIDTH,
  DOVE_KEEL_POLYGON,
  DOVE_VIEWBOX,
  doveFills,
} from "./dove-paths";
import { WORDMARK_ASPECT, WORDMARK_GO_D, WORDMARK_LYNIA_D, WORDMARK_VIEWBOX } from "./wordmark-paths";
import { tokens } from "@lynia/shared/tokens";

/**
 * The splash lockup — ONE picture, defined once, drawn twice.
 *
 * WHY THIS EXISTS. The cold start used to show the brand-green frame in three places that were not
 * the same picture: the NATIVE launch screen (expo-splash-screen, baked into the binary), the JS
 * `SplashView` on route "/", and a `BootSplashHold` overlay. The native one was generated from a
 * bare-dove PNG with no wordmark, so the moment JS took over, the wordmark appeared and the dove
 * jumped upward by half the wordmark block — a visible animation in a boot sequence that is supposed
 * to have none. Owner instruction 2026-08-18: the cold start is ONE screen, the green screen with
 * logo and wordmark, no animations. Since MOB-BOOT-05 that is literal: the native splash is the only
 * screen a production boot shows (held to the destination by src/boot/boot-splash-hold.tsx), and
 * `SplashView` remains as the dev-reload fallback + parity target — still drawn from these numbers.
 *
 * Nothing enforces sameness across a native asset and a React tree except deriving both from the
 * same numbers, which is what this module is. `splash.view.tsx` reads the constants below for its
 * RN tree; `scripts/build-splash-icon.mjs` renders {@link splashLogoVectorDrawableXml} into
 * `assets/splashscreen_logo.xml` (the Android drawable) and rasterises {@link splashLockupSvg} into
 * `assets/splash-icon.png` (the iOS storyboard image), which `app.config.ts` hands to
 * expo-splash-screen. Tests assert the committed assets still match these functions, so none of the
 * three can drift silently.
 *
 * GEOMETRY IS THE MOCK'S. `packages/design/explorations/journey/screens.jsx :: Splash` draws a
 * centred column on the accent green: `<Dove size={104} on="green" />`, `gap: 18`, then the LyniaGo
 * wordmark at 32px in white. Those three numbers are the whole design; everything else here is
 * derived from them.
 */

/** Mock `Splash`: `<Dove size={104} on="green" />`. */
export const SPLASH_DOVE_SIZE = 104;
/** Mock `Splash`: the column's `gap: 18`. */
export const SPLASH_GAP = 18;
/** Mock `Splash`: the wordmark at 32px, weight 600, white. */
export const SPLASH_WORDMARK_SIZE = 32;

/** Rendered width of the wordmark at {@link SPLASH_WORDMARK_SIZE} — the same maths `<Wordmark/>` does. */
export const SPLASH_WORDMARK_WIDTH = SPLASH_WORDMARK_SIZE * WORDMARK_ASPECT;
/** The lockup's bounding box. The wordmark is wider than the dove, so it sets the width. */
export const SPLASH_LOCKUP_WIDTH = Math.max(SPLASH_DOVE_SIZE, SPLASH_WORDMARK_WIDTH);
export const SPLASH_LOCKUP_HEIGHT = SPLASH_DOVE_SIZE + SPLASH_GAP + SPLASH_WORDMARK_SIZE;

/**
 * `imageWidth` for the expo-splash-screen plugin, in dp.
 *
 * NOT the lockup's width, despite the name: the plugin fits the source image `contain` into a
 * SQUARE box of `imageWidth × imageWidth` centred on a 288dp canvas
 * (@expo/prebuild-config .../withAndroidSplashImages.js), and the lockup is taller than it is wide.
 * So the value that makes the native frame render the lockup at the mock's size is its HEIGHT — pass
 * the width and every element would come out ~22% small against the JS frame that replaces it.
 *
 * ANDROID 12+ FIT, measured not guessed. The system splash draws this drawable against a 288dp
 * canvas whose design-guideline safe area is a 192dp circle. The lockup's actual ink measures
 * 120.38 × 147.50dp sitting 3.25dp below the image centre, so its bounding-box corners reach 97.73dp
 * from that centre — 1.73dp outside the 96dp guideline radius. That is a GUIDELINE, not a clip: this
 * plugin never sets `windowSplashScreenIconBackgroundColor`, and the circular mask AOSP applies is
 * on the icon-background layer, so the worst case here is the system scaling the mark slightly, not
 * cropping the wordmark.
 *
 * Do not "fix" it by shrinking the lockup. Scaling to fit 96dp means a 102.2px dove, which both
 * breaks the mock's drawn 104 (a `docs/DESIGN-DEVIATIONS.md` matter) and makes the native frame a
 * different size from the JS frame that replaces it — reintroducing the exact size jump this module
 * exists to remove. Left as measured; confirm on a physical Android 12+ device before the next
 * store build.
 */
export const SPLASH_IMAGE_WIDTH = Math.round(SPLASH_LOCKUP_HEIGHT);

/** Trim trailing zeros so the emitted SVG is stable and readable (`8.1952`, `104`, not `104.0000`). */
function n(value: number): string {
  return String(Number(value.toFixed(4)));
}

/**
 * Transform precision for the vector drawable's `<group>` scale/translate. Six decimals rather than
 * n()'s four because the wordmark's coordinates are font units (up to ~3600): a 1e-4 error in the
 * scale would move a glyph by ~0.36dp, visible against the JS frame; at 1e-6 it is ~0.004dp, below
 * anything a screen can draw.
 */
function t(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * A colour as VectorDrawable's `#AARRGGBB`. The lockup uses two forms: plain `#RRGGBB` tokens (pass
 * through) and the keel's `rgba(255,255,255,0.62)` (fold the alpha in front) — anything else is a
 * new brand colour format and should fail loudly here rather than ship a black facet.
 */
function vectorColor(color: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const rgba = /^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/.exec(color.replaceAll(" ", ""));
  if (!rgba) throw new Error(`splash-lockup: cannot express "${color}" as a VectorDrawable colour`);
  const [, r, g, b, a] = rgba;
  const hex = (value: number): string => value.toString(16).padStart(2, "0").toUpperCase();
  return `#${hex(Math.round(Number(a) * 255))}${hex(Number(r))}${hex(Number(g))}${hex(Number(b))}`;
}

/**
 * The SVG `preserveAspectRatio="xMidYMid meet"` mapping of a viewBox into a target box — the exact
 * fit the nested `<svg>` elements in {@link splashLockupSvg} get by default, reproduced as one
 * uniform scale plus a translation so a VectorDrawable `<group>` can apply it (its local matrix is
 * scale-then-translate about a 0,0 pivot). Deriving both outputs from this one function is what
 * keeps the native vector and the rasterised SVG the same picture to sub-pixel precision.
 */
function meetTransform(
  viewBox: string,
  box: { x: number; y: number; width: number; height: number },
): { scale: number; tx: number; ty: number } {
  const [minX, minY, vw, vh] = viewBox.split(" ").map(Number) as [number, number, number, number];
  const scale = Math.min(box.width / vw, box.height / vh);
  return {
    scale,
    tx: box.x + (box.width - vw * scale) / 2 - minX * scale,
    ty: box.y + (box.height - vh * scale) / 2 - minY * scale,
  };
}

/** Convert one of the dove's `points` polygons to VectorDrawable path grammar. */
function polygonPath(points: string): string {
  const [first, ...rest] = points.split(" ");
  return `M${first} ${rest.map((p) => `L${p}`).join(" ")} Z`;
}

/**
 * The dp side of the square canvas the Android splash drawable renders on. 288dp is the Android 12+
 * splash-icon spec size, and it is also exactly what the retired PNG pipeline produced
 * (@expo/prebuild-config withAndroidSplashImages composes the logo onto a `288 * density` canvas) —
 * keeping it means the vector renders the lockup at the identical on-screen size the raster did.
 */
export const SPLASH_CANVAS_DP = 288;

/**
 * The lockup as an Android VectorDrawable — the NATIVE splash logo, resolution-independent.
 *
 * WHY A VECTOR. The PNG lane degraded twice between the committed asset and the user's eye: prebuild
 * resized it into density-bucket bitmaps through @expo/image-utils (which silently falls back to
 * Jimp's bilinear resampling when sharp-cli isn't installed — the EAS worker case), and Android 12+
 * may scale the drawable again at display time. Both softened the first frame of the boot against
 * the vector-crisp JS frame that replaces it (reported 2026-08-24: "the logo that appears first is
 * not well rendered [compared to] the one appearing last"). None of that pipeline is reachable by
 * any check in this repo — the only artifacts it produces live inside the EAS build. A vector has no
 * pipeline: the same paths react-native-svg draws in `SplashView` are rasterised by the OS at the
 * screen's own resolution.
 *
 * Wired through the expo-splash-screen plugin's `android.drawable` prop (app.config.ts), which
 * copies this file verbatim to `res/drawable/splashscreen_logo.xml` and skips PNG generation
 * entirely (verified against @expo/prebuild-config@8.2.0 withAndroidSplashImages.js — the
 * `config.drawable` early return). With `drawable` set the plugin ignores `imageWidth`, so the
 * rendered size comes from this drawable's intrinsic 288dp canvas — same canvas, same fit, same
 * geometry as the PNG it replaces. minSdk 24 renders VectorDrawables natively (no compat concerns),
 * and group scaling applies to stroke widths, so the creases scale exactly as they do in the SVG.
 *
 * The transforms reproduce {@link splashLockupSvg}'s nested `<svg>` fits via {@link meetTransform};
 * the paths and fills are the same data `<DoveMark/>`/`<Wordmark/>` render. iOS keeps the raster
 * lane (its storyboard needs an image), so the SVG/PNG pair above still exists and is still checked.
 */
export function splashLogoVectorDrawableXml(): string {
  const { body, keel, crease } = doveFills("green");
  const lockupX = (SPLASH_CANVAS_DP - SPLASH_LOCKUP_WIDTH) / 2;
  const lockupY = (SPLASH_CANVAS_DP - SPLASH_LOCKUP_HEIGHT) / 2;
  const dove = meetTransform(DOVE_VIEWBOX, {
    x: lockupX + (SPLASH_LOCKUP_WIDTH - SPLASH_DOVE_SIZE) / 2,
    y: lockupY,
    width: SPLASH_DOVE_SIZE,
    height: SPLASH_DOVE_SIZE,
  });
  const wordmark = meetTransform(WORDMARK_VIEWBOX, {
    x: lockupX,
    y: lockupY + SPLASH_DOVE_SIZE + SPLASH_GAP,
    width: SPLASH_WORDMARK_WIDTH,
    height: SPLASH_WORDMARK_SIZE,
  });
  const group = (m: { scale: number; tx: number; ty: number }): string =>
    `android:scaleX="${t(m.scale)}" android:scaleY="${t(m.scale)}" android:translateX="${t(m.tx)}" android:translateY="${t(m.ty)}"`;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- GENERATED from src/ui/splash-lockup.ts — do not hand-edit. Rebuild: node scripts/build-splash-icon.mjs -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${SPLASH_CANVAS_DP}dp"
    android:height="${SPLASH_CANVAS_DP}dp"
    android:viewportWidth="${SPLASH_CANVAS_DP}"
    android:viewportHeight="${SPLASH_CANVAS_DP}">
  <group ${group(dove)}>
${DOVE_BODY_POLYGONS.map((points) => `    <path android:pathData="${polygonPath(points)}" android:fillColor="${vectorColor(body)}"/>`).join("\n")}
    <path android:pathData="${polygonPath(DOVE_KEEL_POLYGON)}" android:fillColor="${vectorColor(keel)}"/>
${DOVE_CREASE_PATHS.map((d) => `    <path android:pathData="${d}" android:strokeColor="${vectorColor(crease)}" android:strokeWidth="${n(DOVE_CREASE_WIDTH)}"/>`).join("\n")}
  </group>
  <group ${group(wordmark)}>
    <path android:pathData="${WORDMARK_LYNIA_D}" android:fillColor="${vectorColor(tokens.color.onAccent)}"/>
    <path android:pathData="${WORDMARK_GO_D}" android:fillColor="${vectorColor(tokens.color.onAccent)}"/>
  </group>
</vector>
`;
}

/**
 * The lockup as a standalone SVG: white mark + white wordmark on TRANSPARENT ground, sized in dp.
 *
 * Transparent rather than green because expo-splash-screen composites this over its own
 * `backgroundColor` (the same `tokens.color.accent`), on both platforms — baking the green in would
 * paint a green rectangle over whatever the OS letterboxes it into.
 *
 * The two nested `<svg>` elements reproduce exactly what `<DoveMark/>` and `<Wordmark/>` do in the
 * RN tree: each maps its own viewBox into a box of the mock's size, with the default
 * `preserveAspectRatio`. Same viewBoxes, same target boxes, same result.
 */
export function splashLockupSvg(): string {
  const { body, keel, crease } = doveFills("green");
  const doveX = (SPLASH_LOCKUP_WIDTH - SPLASH_DOVE_SIZE) / 2;
  const wordmarkY = SPLASH_DOVE_SIZE + SPLASH_GAP;
  // The crease is stroked in viewBox units, so it scales with the dove exactly as it does in
  // <DoveMark/> — no separate compensation here.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(SPLASH_LOCKUP_WIDTH)}" height="${n(SPLASH_LOCKUP_HEIGHT)}" viewBox="0 0 ${n(SPLASH_LOCKUP_WIDTH)} ${n(SPLASH_LOCKUP_HEIGHT)}">
  <!-- GENERATED from src/ui/splash-lockup.ts — do not hand-edit. Rebuild: node scripts/build-splash-icon.mjs -->
  <svg x="${n(doveX)}" y="0" width="${n(SPLASH_DOVE_SIZE)}" height="${n(SPLASH_DOVE_SIZE)}" viewBox="${DOVE_VIEWBOX}">
${DOVE_BODY_POLYGONS.map((points) => `    <polygon points="${points}" fill="${body}"/>`).join("\n")}
    <polygon points="${DOVE_KEEL_POLYGON}" fill="${keel}"/>
${DOVE_CREASE_PATHS.map((d) => `    <path d="${d}" stroke="${crease}" stroke-width="${n(DOVE_CREASE_WIDTH)}" fill="none"/>`).join("\n")}
  </svg>
  <svg x="0" y="${n(wordmarkY)}" width="${n(SPLASH_WORDMARK_WIDTH)}" height="${n(SPLASH_WORDMARK_SIZE)}" viewBox="${WORDMARK_VIEWBOX}">
    <path d="${WORDMARK_LYNIA_D}" fill="${tokens.color.onAccent}"/>
    <path d="${WORDMARK_GO_D}" fill="${tokens.color.onAccent}"/>
  </svg>
</svg>
`;
}
