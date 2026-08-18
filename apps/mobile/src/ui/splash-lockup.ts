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
 * `SplashView` on route "/", and the `BootSplashHold` overlay. The native one was generated from a
 * bare-dove PNG with no wordmark, so the moment JS took over, the wordmark appeared and the dove
 * jumped upward by half the wordmark block — a visible animation in a boot sequence that is supposed
 * to have none. Owner instruction 2026-08-18: the cold start is ONE screen, the green screen with
 * logo and wordmark, no animations.
 *
 * Nothing enforces sameness across a native asset and a React tree except deriving both from the
 * same numbers, which is what this module is. `splash.view.tsx` reads the constants below for its
 * RN tree; `scripts/build-splash-icon.mjs` rasterises {@link splashLockupSvg} into
 * `assets/splash-icon.png`, which `app.config.ts` hands to expo-splash-screen. A test asserts the
 * committed SVG still matches this function, so the two can't drift silently.
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
 */
export const SPLASH_IMAGE_WIDTH = Math.round(SPLASH_LOCKUP_HEIGHT);

/** Trim trailing zeros so the emitted SVG is stable and readable (`8.1952`, `104`, not `104.0000`). */
function n(value: number): string {
  return String(Number(value.toFixed(4)));
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
