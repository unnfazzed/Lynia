// Self-hosted, glyph-subsetted TTFs (A-O13 / LC-A05, docs/APP-SIZE.md) — committed assets in
// assets/fonts/, NOT the @expo-google-fonts/inter package (kept only as a devDependency, the
// source the subsetting script reads from). Regenerate via `node scripts/subset-fonts.mjs`; the
// safe Unicode ranges are pinned in scripts/font-safe-ranges.mjs and enforced by
// scripts/check-font-charset.mjs on every `pnpm lint`.
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

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
 * each call site: patch the components' `render` once to inject the right `fontFamily` (and drop the
 * now-redundant `fontWeight` so Android doesn't double-synthesise bold). An explicit `fontFamily`
 * (e.g. a deliberate per-Text override) is left untouched. Guarded per render so any internals mismatch falls
 * back to the system font instead of crashing.
 *
 * Latent nested-`<Text>` caveat: a child span without an explicit `fontFamily` gets
 * `Inter_400Regular` injected instead of inheriting the parent span's weight. Today only Brand.tsx
 * nests Text, and it sets explicit families on both spans.
 */
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
  if (typeof original !== "function") {
    // Loud in dev — a future RN export-shape change would otherwise silently drop Inter.
    if (__DEV__) console.warn("[lynia] Text/TextInput render patch no-op — Inter will not apply; check RN version");
    return false;
  }
  // The already-patched marker lives on the render function itself (not module state) so a Fast
  // Refresh re-evaluation of this module doesn't stack a second wrapper on the cached RN component.
  if (original.__lyniaInterPatched) return true;
  const patchedRender: PatchedRenderFn = function patchedRender(this: unknown, props: unknown, ref: unknown) {
    // Compute the injected props inside the guard but call `original` exactly once — a throw
    // mid-render would otherwise re-enter it in the same fiber pass and corrupt the hook cursor.
    let propsToUse = props;
    try {
      const p = props as { style?: unknown } | null | undefined;
      if (p?.style == null) {
        // Fast path — most Texts carry no style at all; skip the flatten entirely.
        propsToUse = { ...p, style: { fontFamily: interFamily(undefined) } };
      } else {
        const flat = (StyleSheet.flatten(p.style as never) ?? {}) as { fontFamily?: string; fontWeight?: string | number };
        if (!flat.fontFamily) {
          const { fontWeight, ...rest } = flat;
          propsToUse = { ...p, style: [{ fontFamily: interFamily(fontWeight) }, rest] };
        }
      }
    } catch {
      propsToUse = props; // untouched render → system font
    }
    return original.call(this, propsToUse, ref);
  };
  patchedRender.__lyniaInterPatched = true;
  patchedRender.__lyniaOriginal = original;
  Comp.render = patchedRender;
  return true;
}

export function applyInterToTextComponents(): void {
  for (const Comp of [Text, TextInput] as unknown as Patchable[]) {
    patchRenderable(Comp);
  }
}

// Applied on import (before any Text mounts). First render is gated on useAppFonts()'s `loaded`, so
// the families are registered by the time patched Text instances mount.
applyInterToTextComponents();
