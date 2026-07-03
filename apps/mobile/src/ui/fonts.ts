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
 */
let patched = false;
export function applyInterToTextComponents(): void {
  if (patched) return;
  patched = true;
  for (const Comp of [Text, TextInput] as unknown as { render?: (...args: any[]) => unknown }[]) {
    const original = Comp.render;
    if (typeof original !== "function") continue;
    Comp.render = function patchedRender(props: any, ref: any) {
      try {
        const flat = (StyleSheet.flatten(props?.style as never) ?? {}) as { fontFamily?: string; fontWeight?: string | number };
        if (!flat.fontFamily) {
          const { fontWeight, ...rest } = flat;
          const style = [{ fontFamily: interFamily(fontWeight) }, rest];
          return original.call(this, { ...props, style }, ref);
        }
      } catch {
        /* fall through to the untouched render → system font */
      }
      return original.call(this, props, ref);
    };
  }
}

// Applied on import (before any Text mounts). First render is gated on useAppFonts()'s `loaded`, so
// the families are registered by the time patched Text instances mount.
applyInterToTextComponents();
