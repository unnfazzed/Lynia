// Self-hosted, glyph-subsetted TTFs (A-O13 / LC-A05, docs/APP-SIZE.md) — committed assets in
// assets/fonts/, NOT the @expo-google-fonts/inter package (kept only as a devDependency, the
// source the subsetting script reads from). Regenerate via `node scripts/subset-fonts.mjs`; the
// safe Unicode ranges are pinned in scripts/font-safe-ranges.mjs and enforced by
// scripts/check-font-charset.mjs on every `pnpm lint`.
import { useFonts } from "expo-font";
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

/** Loads the self-hosted fonts. Returns [loaded, error] — gate first render on `loaded`. */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts(appFontMap);
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
