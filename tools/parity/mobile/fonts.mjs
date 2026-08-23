/**
 * Inter @font-face CSS with the woff2 inlined as data URIs, so the mobile harness (loaded via
 * setContent, no server origin) still paints real Inter — the same 3 Latin weights the design ships,
 * so both sides of the sheet use the identical typeface.
 *
 * Registers two alias sets against the same 3 files:
 *   - "Inter" (one face per weight) — the harness's own #root fallback default.
 *   - "Inter_400Regular" / "Inter_600SemiBold" / "Inter_700Bold" (one face each, weight:normal) —
 *     what `applyInterToTextComponents()` (apps/mobile/src/ui/fonts.ts) injects into every patched
 *     Text/TextInput, mirroring the distinct native font families expo-font registers on a real boot
 *     (see `fontFamilies` in that file). Without this second set the patch's injected fontFamily
 *     resolves to nothing and the browser falls back to its serif default (UIP-01).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FONTS = resolve(HERE, "../../../packages/design/assets/fonts");

let cache;
export async function interFontCss() {
  if (cache) return cache;
  const weights = [
    ["400", "inter-400.woff2", "Inter_400Regular"],
    ["600", "inter-600.woff2", "Inter_600SemiBold"],
    ["700", "inter-700.woff2", "Inter_700Bold"],
  ];
  const faces = [];
  for (const [weight, file, appFamily] of weights) {
    const b64 = (await readFile(resolve(FONTS, file))).toString("base64");
    const src = `src:url(data:font/woff2;base64,${b64}) format("woff2");`;
    faces.push(`@font-face{font-family:"Inter";font-style:normal;font-weight:${weight};font-display:block;${src}}`);
    faces.push(`@font-face{font-family:"${appFamily}";font-style:normal;font-weight:normal;font-display:block;${src}}`);
  }
  cache = faces.join("\n");
  return cache;
}
