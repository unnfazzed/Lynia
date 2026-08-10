#!/usr/bin/env node
/**
 * Render ONE design mock screen to a PNG at its canonical viewport.
 *
 *   node render-mock.mjs --src RC --id home --out out/rc-home.png
 *   node render-mock.mjs --src RM --id queue_board --mode tablet --out out/rm-queue.png
 *   node render-mock.mjs --src LJ --id splash --mode phone320 --out out/lj-splash-320.png
 *
 * Flags: --src (LJ|RC|RJ|RR|RJM|RM) --id <screen> --mode phone|phone320|tablet --full --scale N --out <png>
 */
import { renderOne } from "./lib/mock.mjs";
import { parseArgs } from "./lib/args.mjs";

const a = parseArgs(process.argv.slice(2));
if (!a.src || !a.id) {
  console.error("usage: render-mock.mjs --src <LJ|RC|RJ|RR|RJM|RM> --id <screen> [--mode phone|phone320|tablet] [--full] [--scale 2] --out <file.png>");
  process.exit(2);
}
const out = a.out || `out/mock-${a.src}-${a.id}.png`;
const res = await renderOne({
  src: a.src,
  id: a.id,
  mode: a.mode,
  full: !!a.full,
  scale: a.scale ? Number(a.scale) : undefined,
  out,
});
if (res.ok) {
  console.log(JSON.stringify({ ok: true, path: res.path, px: `${res.width}x${res.height}` }));
} else {
  console.error(JSON.stringify({ ok: false, error: res.error }));
  process.exit(1);
}
