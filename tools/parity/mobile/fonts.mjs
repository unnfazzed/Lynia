/**
 * Inter @font-face CSS with the woff2 inlined as data URIs, so the mobile harness (loaded via
 * setContent, no server origin) still paints real Inter — the same 3 Latin weights the design ships,
 * so both sides of the sheet use the identical typeface.
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
    ["400", "inter-400.woff2"],
    ["600", "inter-600.woff2"],
    ["700", "inter-700.woff2"],
  ];
  const faces = [];
  for (const [weight, file] of weights) {
    const b64 = (await readFile(resolve(FONTS, file))).toString("base64");
    faces.push(
      `@font-face{font-family:"Inter";font-style:normal;font-weight:${weight};font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format("woff2");}`,
    );
  }
  cache = faces.join("\n");
  return cache;
}
