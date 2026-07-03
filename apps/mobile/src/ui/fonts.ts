import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { StyleSheet, Text, TextInput } from "react-native";

/**
 * Self-hosted type — Inter for all UI, Fredoka 600 for the LyniaGo wordmark only. Each weight is a
 * distinct React-Native font family (Android matches families by exact name, not by fontWeight), so
 * we map an intended fontWeight → the matching Inter file. Matches packages/design/tokens/fonts.css.
 */
export const fontFamilies = {
  regular: "Inter_400Regular", // body (500 aliases to this — no 500 file, per the data budget)
  semibold: "Inter_600SemiBold", // labels, pills, button labels
  bold: "Inter_700Bold", // titles (800 aliases to this)
  wordmark: "Fredoka_600SemiBold", // LyniaGo lockup only — never UI/body
} as const;

/** The font map expo-font registers. Family name === object key. */
export const appFontMap = {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Fredoka_600SemiBold,
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
 * (e.g. the Fredoka wordmark) is left untouched. Guarded per render so any internals mismatch falls
 * back to the system font instead of crashing.
 *
 * Latent nested-`<Text>` caveat: a child span without an explicit `fontFamily` gets
 * `Inter_400Regular` injected instead of inheriting the parent span's weight. Today only Brand.tsx
 * nests Text, and it sets explicit families on both spans.
 */
export function applyInterToTextComponents(): void {
  for (const Comp of [Text, TextInput] as unknown as { render?: (...args: any[]) => unknown }[]) {
    const original = Comp.render;
    if (typeof original !== "function") {
      // Loud in dev — a future RN export-shape change would otherwise silently drop Inter.
      if (__DEV__) console.warn("[lynia] Text/TextInput render patch no-op — Inter will not apply; check RN version");
      continue;
    }
    // The already-patched marker lives on the render function itself (not module state) so a Fast
    // Refresh re-evaluation of this module doesn't stack a second wrapper on the cached RN component.
    if ((original as any).__lyniaInterPatched) continue;
    const patchedRender = function patchedRender(this: unknown, props: any, ref: any) {
      // Compute the injected props inside the guard but call `original` exactly once — a throw
      // mid-render would otherwise re-enter it in the same fiber pass and corrupt the hook cursor.
      let propsToUse = props;
      try {
        if (props?.style == null) {
          // Fast path — most Texts carry no style at all; skip the flatten entirely.
          propsToUse = { ...props, style: { fontFamily: interFamily(undefined) } };
        } else {
          const flat = (StyleSheet.flatten(props.style as never) ?? {}) as { fontFamily?: string; fontWeight?: string | number };
          if (!flat.fontFamily) {
            const { fontWeight, ...rest } = flat;
            propsToUse = { ...props, style: [{ fontFamily: interFamily(fontWeight) }, rest] };
          }
        }
      } catch {
        propsToUse = props; // untouched render → system font
      }
      return original.call(this, propsToUse, ref);
    };
    (patchedRender as any).__lyniaInterPatched = true;
    (patchedRender as any).__lyniaOriginal = original;
    Comp.render = patchedRender;
  }
}

// Applied on import (before any Text mounts). First render is gated on useAppFonts()'s `loaded`, so
// the families are registered by the time patched Text instances mount.
applyInterToTextComponents();
