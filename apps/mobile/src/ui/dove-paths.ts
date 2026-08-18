import { tokens } from "@lynia/shared/tokens";

/**
 * The Paper Dove — the LyniaGo mark as raw geometry, mirroring
 * packages/design/assets/brand/lyniago-mark.svg. Kept as a pure data module (no react-native-svg
 * import) for the same reason `wordmark-paths.ts` is: the splash lockup that expo-splash-screen
 * bakes into the NATIVE launch screen is generated from these numbers by a plain Node script
 * (scripts/build-splash-icon.mjs), which cannot load a module that pulls in React Native.
 *
 * A folded paper dart that is also a dove; the crease lines cross at the upper third (the hidden
 * cross). Brand rule: the creases only render at >= 32px — below that use the silhouette alone.
 */

/** The mark's coordinate space. Every polygon/path below is expressed in it. */
export const DOVE_VIEWBOX = "0 0 96 96";
/** Crease stroke width, in viewBox units. */
export const DOVE_CREASE_WIDTH = 2.4;
/** Smallest size at which the creases are drawn; below it the silhouette stands alone. */
export const DOVE_CREASE_MIN_SIZE = 32;

/** The two body facets (upper wing, lower wing) — the mark's primary fill. */
export const DOVE_BODY_POLYGONS = ["28,6 58,32 38,42", "90,26 14,52 48,60"] as const;
/** The keel facet — the translucent underside that gives the fold its depth. */
export const DOVE_KEEL_POLYGON = "90,26 48,60 42,84";
/** The fold creases — the long spine and the short cross-stroke that meet at the hidden cross. */
export const DOVE_CREASE_PATHS = ["M90 26 L48 60", "M70.5 30.2 L81.5 43.8"] as const;

/**
 * The mark's three fills for a given ground. On the brand-green splash the mark inverts (DS Dove
 * `on="green"`): white body, translucent-white keel, and the crease switches to the accent green so
 * it stays visible against the white body. Lives here rather than in `Brand.tsx` so the native
 * splash lockup (src/ui/splash-lockup.ts) resolves the SAME colours the JS frame renders — the two
 * pictures have to be identical or the native→JS handoff shows a colour pop.
 */
export function doveFills(on: "white" | "green"): { body: string; keel: string; crease: string } {
  return on === "green"
    ? { body: tokens.color.onAccent, keel: "rgba(255,255,255,0.62)", crease: tokens.color.accent }
    : { body: tokens.color.accent, keel: tokens.color.accentPressed, crease: tokens.color.onAccent };
}
