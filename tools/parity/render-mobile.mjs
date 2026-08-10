#!/usr/bin/env node
/**
 * Render ONE mobile (React Native) screen to a PNG at 360×720 via react-native-web.
 *
 *   node render-mobile.mjs --component app/force-update.tsx --fixture force_update --out out/app-force-update.png
 *
 * Flags: --component <path from apps/mobile/> --fixture <name in mobile/fixtures> --mode phone|phone320 --out <png>
 */
import { renderMobileOne } from "./lib/mobile.mjs";
import { parseArgs } from "./lib/args.mjs";

const a = parseArgs(process.argv.slice(2));
if (!a.component) {
  console.error("usage: render-mobile.mjs --component <app/...tsx> [--fixture <name>] [--mode phone|phone320] --out <file.png>");
  process.exit(2);
}
const out = a.out || `out/app-${String(a.component).replace(/[^\w]+/g, "-")}.png`;
const res = await renderMobileOne({
  component: a.component,
  fixture: a.fixture,
  mode: a.mode,
  out,
});
if (res.ok) {
  console.log(JSON.stringify({ ok: true, path: res.path, px: `${res.width}x${res.height}` }));
} else {
  console.error(JSON.stringify({ ok: false, error: res.error }));
  process.exit(1);
}
