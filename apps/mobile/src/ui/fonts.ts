// Self-hosted, glyph-subsetted TTFs (A-O13 / LC-A05, docs/APP-SIZE.md) — committed assets in
// assets/fonts/, NOT the @expo-google-fonts/inter package (kept only as a devDependency, the
// source the subsetting script reads from). Regenerate via `node scripts/subset-fonts.mjs`; the
// safe Unicode ranges are pinned in scripts/font-safe-ranges.mjs and enforced by
// scripts/check-font-charset.mjs on every `pnpm lint`.
import { loadAsync, useFonts } from "expo-font";
import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

/**
 * Self-hosted type — Inter for all UI. (The LyniaGo wordmark ships as OUTLINED vector paths in
 * Brand.tsx — no Fredoka font file loads at runtime.) Each weight is a
 * distinct React-Native font family (Android matches families by exact name, not by fontWeight), so
 * we map an intended fontWeight → the matching Inter file. Matches packages/design/tokens/fonts.css.
 */
export const fontFamilies = {
  regular: "Inter_400Regular", // body (500 aliases to this — no 500 file, per the data budget)
  semibold: "Inter_600SemiBold", // labels, pills, button labels
  bold: "Inter_700Bold", // titles (800 aliases to this)
} as const;

/** The font map expo-font registers. Family name === object key (not the asset filename). */
export const appFontMap = {
  Inter_400Regular: require("../../assets/fonts/Inter-400Regular-subset.ttf"),
  Inter_600SemiBold: require("../../assets/fonts/Inter-600SemiBold-subset.ttf"),
  Inter_700Bold: require("../../assets/fonts/Inter-700Bold-subset.ttf"),
} as const;

/**
 * Hard ceiling on the font load. Fonts are BUNDLED (no network on the happy path) and register in
 * well under a second even on a low-end handset, so anything past this is a stall, not slowness.
 */
export const FONT_LOAD_TIMEOUT_MS = 4000;

/**
 * Start the font load without waiting for a render to ask for it.
 *
 * `useFonts` kicks `loadAsync` from an EFFECT, so the TTFs only started registering after the first
 * React commit — i.e. after the entire eager startup graph had finished evaluating, with the JS thread
 * having been busy the whole time. Calling this at module scope from `app/_layout.tsx` instead overlaps
 * the (native, off-thread) registration with that evaluation, which is dead time otherwise.
 *
 * Safe to call twice: expo-font's `loadAsync` short-circuits an already-loaded family and otherwise
 * hands back the SAME in-flight promise from its internal `loadPromises` map — so `useFonts` joins this
 * load rather than starting a second one, and the gate below still observes the real outcome.
 *
 * Deliberately swallows the rejection: the contract already degrades to the system font on failure, and
 * `useAppFonts` — not this — owns reporting that to the render gate (including the timeout below).
 */
export function prewarmFonts(): void {
  void loadAsync(appFontMap).catch(() => undefined);
}

/**
 * Loads the self-hosted fonts. Returns [loaded, error] — `_layout.tsx` gates BOTH the first render
 * and the native splash on this settling, so it must never be able to hang.
 *
 * WHY THE TIMEOUT (the 0.17.12 "installed but won't open" bug): `useFonts` resolves through
 * `expo-asset`'s `Asset.downloadAsync()`, which has NO timeout of its own. A `.ttf` carries no
 * width/height, so expo-asset's Android "already local" fast path (`Asset.fromModule`, gated on
 * `meta.width || meta.height`) does NOT apply to fonts — they go down the download path, and if the
 * bundled resource can't be resolved it falls back to fetching over the network. On a dead or
 * captive link that promise never settles, `fontsLoaded` stays false, `fontError` stays null, and
 * RootLayout returns `null` forever behind a splash nothing will ever hide: the app shows its icon
 * on white and nothing else, with no crash, no error screen, and nothing in logcat.
 *
 * A timeout converts that unbounded hang into the fallback the font contract already documents —
 * render on the system font. It is genuinely self-healing: if the load lands late, `loaded` flips,
 * every patched `<Text>` re-renders against the same family names, and Inter simply appears.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts(appFontMap);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded || error != null) return;
    const timer = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, error]);

  if (loaded || error != null) return [loaded, error];
  return [false, timedOut ? new Error(`Font load exceeded ${FONT_LOAD_TIMEOUT_MS}ms — using system font`) : null];
}

/** Map an RN fontWeight (numeric or string) to the matching self-hosted Inter family. */
export function interFamily(weight?: string | number | null): string {
  if (weight === "bold") return fontFamilies.bold;
  const w = typeof weight === "string" ? Number.parseInt(weight, 10) : (weight ?? 400);
  if (Number.isNaN(w)) return fontFamilies.regular;
  if (w >= 700) return fontFamilies.bold;
  if (w >= 600) return fontFamilies.semibold;
  return fontFamilies.regular;
}

/**
 * Make every `<Text>` / `<TextInput>` render in the weight-correct self-hosted Inter without editing
 * each call site: inject the right `fontFamily` (and drop the now-redundant `fontWeight` so Android
 * doesn't double-synthesise bold) on every render. An explicit `fontFamily` (e.g. a deliberate
 * per-Text override) is left untouched. Guarded per render so any internals mismatch falls back to
 * the system font instead of crashing.
 *
 * Two component shapes, one behaviour ({@link withInterFont}):
 *  - `forwardRef` objects (react-native-web in the parity lane; React Native up to 0.79) expose a
 *    `render` function, patched in place ({@link patchRenderable}).
 *  - React Native 0.81 (Expo SDK 54) made Text and TextInput PLAIN function components: there is no
 *    `render` to patch, and React 19 ignores `defaultProps` on function components. Instead the
 *    `Text`/`TextInput` accessors on react-native's index exports are redefined to return a wrapper
 *    ({@link patchExport}). That index is an object literal of getters, so its properties are
 *    configurable, and app code reads `ReactNative.Text` live at every render (Babel's interop
 *    compiles `import { Text }` to a member access), so every `import { Text } from "react-native"`
 *    renders the wrapper. The component MODULES cannot be patched instead: Metro compiles their
 *    `export default` to a getter-only, non-configurable property (verified in the SDK 54 bundle).
 *
 * NOT covered on React Native 0.81: `Animated.Text`, which wraps the Text module directly. Nothing
 * uses it today, and fonts.test.tsx fails if something starts to without setting its Inter family.
 *
 * Latent nested-`<Text>` caveat: a child span without an explicit `fontFamily` gets
 * `Inter_400Regular` injected instead of inheriting the parent span's weight. Today only Brand.tsx
 * nests Text, and it sets explicit families on both spans.
 */

/** `props` with the weight-correct Inter family injected, or untouched if they name a family. */
export function withInterFont<P>(props: P): P {
  try {
    const p = props as { style?: unknown } | null | undefined;
    if (p?.style == null) {
      // Fast path — most Texts carry no style at all; skip the flatten entirely.
      return { ...p, style: { fontFamily: interFamily(undefined) } } as P;
    }
    const flat = (StyleSheet.flatten(p.style as never) ?? {}) as { fontFamily?: string; fontWeight?: string | number };
    if (flat.fontFamily) return props;
    const { fontWeight, ...rest } = flat;
    return { ...p, style: [{ fontFamily: interFamily(fontWeight) }, rest] } as P;
  } catch {
    return props; // untouched render → system font
  }
}

/** A forwardRef-style render function, tagged with the Fast-Refresh re-patch guard markers. */
type PatchedRenderFn = ((this: unknown, props: unknown, ref: unknown) => unknown) & {
  __lyniaInterPatched?: boolean;
  __lyniaOriginal?: PatchedRenderFn;
};

/** The forwardRef-shaped component surface `patchRenderable` needs. */
interface Patchable {
  render?: PatchedRenderFn;
}

/** Patch one forwardRef-shaped component in place. Exported for tests; returns whether it applied. */
export function patchRenderable(Comp: Patchable): boolean {
  const original = Comp.render;
  if (typeof original !== "function") return false;
  // The already-patched marker lives on the render function itself (not module state) so a Fast
  // Refresh re-evaluation of this module doesn't stack a second wrapper on the cached RN component.
  if (original.__lyniaInterPatched) return true;
  const patchedRender: PatchedRenderFn = function patchedRender(this: unknown, props: unknown, ref: unknown) {
    // `withInterFont` never throws, so `original` runs exactly once per render — a throw mid-render
    // would otherwise re-enter it in the same fiber pass and corrupt the hook cursor.
    return original.call(this, withInterFont(props), ref);
  };
  patchedRender.__lyniaInterPatched = true;
  patchedRender.__lyniaOriginal = original;
  Comp.render = patchedRender;
  return true;
}

/** The wrapper `patchExport` installs, tagged with the same re-patch guard markers. */
type InterComponent = ((props: Record<string, unknown>) => React.ReactElement) & {
  displayName?: string;
  __lyniaInterPatched?: boolean;
  __lyniaOriginal?: unknown;
};

/**
 * Redefine the `name` accessor on `exports` (react-native's index) to return ONE wrapper that renders
 * the current component with {@link withInterFont} props. The wrapper is created once, so the
 * component identity React reconciles against never changes. Statics (TextInput.State) are carried
 * over; `ref` rides through as the ordinary prop React 19 makes it. Exported for tests; returns
 * whether it applied.
 */
export function patchExport(exports: object | null | undefined, name: string): boolean {
  if (!exports) return false;
  const Original = (exports as Record<string, unknown>)[name] as
    | (React.ComponentType<Record<string, unknown>> & { __lyniaInterPatched?: boolean })
    | undefined;
  if (typeof Original !== "function") return false;
  if (Original.__lyniaInterPatched) return true;
  const descriptor = Object.getOwnPropertyDescriptor(exports, name);
  if (!descriptor?.configurable) return false;
  const Inter: InterComponent = (props) => React.createElement(Original, withInterFont(props));
  Object.assign(Inter, Original);
  Inter.displayName = name;
  Inter.__lyniaInterPatched = true;
  Inter.__lyniaOriginal = Original;
  Object.defineProperty(exports, name, { configurable: true, enumerable: descriptor.enumerable ?? true, get: () => Inter });
  return true;
}

/** Apply Inter to Text and TextInput, whichever shape this React Native build exports. */
export function applyInterToTextComponents(): void {
  // The raw exports object every module reads (`import * as` would hand back a copied namespace).
  const reactNative = require("react-native") as Record<string, unknown>;
  for (const name of ["Text", "TextInput"]) {
    const Comp = reactNative[name] as Patchable | undefined;
    const applied = typeof Comp?.render === "function" ? patchRenderable(Comp) : patchExport(reactNative, name);
    // Loud in dev — a future RN export-shape change would otherwise silently drop Inter.
    if (!applied && __DEV__) console.warn(`[lynia] ${name} Inter patch no-op — Inter will not apply; check RN version`);
  }
}

// Applied on import (before any Text mounts). First render is gated on useAppFonts()'s `loaded`, so
// the families are registered by the time patched Text instances mount.
applyInterToTextComponents();
