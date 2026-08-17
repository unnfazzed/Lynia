#!/usr/bin/env node
/**
 * Compose a BEFORE/AFTER sheet from two app renders — the second lane, beside `pair.mjs`.
 *
 * `pair.mjs` answers "does the app match the mock?"; this answers "what did this change do?", which
 * is the question a redesign with no mock of its own has to answer instead. Both sides here are the
 * APP, rendered from the same fixture at the same viewport, so the only variable is the diff.
 *
 * Render each side first (they are different commits, so this cannot be one process):
 *   git stash && node render-mobile.mjs --component "app/rider/(tabs)/index.tsx" \
 *     --fixture rider_board --out out/rider-old.png && git stash pop
 *   node render-mobile.mjs --component "app/rider/(tabs)/index.tsx" --fixture rider_board --out out/rider-new.png
 *   node old-vs-new.mjs --old out/rider-old.png --new out/rider-new.png --out out/rider-oldnew.png \
 *     --title "Rider home — old vs new" --sub "…" --note "…"
 *
 * PNGs are inlined as data URIs so the sheet is one self-contained file to attach to a PR.
 */
import { launch, contextDefaults } from "./lib/browser.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "./lib/args.mjs";

const a = parseArgs(process.argv.slice(2));
if (!a.old || !a.new || !a.out) {
  console.error("usage: old-vs-new.mjs --old <before.png> --new <after.png> --out <sheet.png> [--title T] [--sub S] [--note N] [--oldLabel L] [--newLabel L]");
  process.exit(2);
}

/** Minimal HTML-escape — every caption below is operator-supplied prose, not markup. */
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dataUri = async (p) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;
const [oldSrc, newSrc] = await Promise.all([dataUri(a.old), dataUri(a.new)]);

const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#eceff1;font-family:Inter,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14181b}
  .wrap{padding:26px 30px 34px}
  h1{font-size:19px;font-weight:800;margin:0 0 4px;letter-spacing:-.01em}
  p.sub{font-size:12.5px;color:#5b6670;margin:0 0 20px}
  .cols{display:flex;gap:28px;align-items:flex-start}
  figure{margin:0;flex:1}
  figcaption{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5b6670;margin:0 0 8px}
  figcaption b{color:#14181b}
  img{width:100%;display:block;border:1px solid #e2e6ea;border-radius:12px;background:#fff}
  .note{margin-top:18px;font-size:12px;color:#5b6670;line-height:1.6}
</style><div class="wrap">
  <h1>${esc(a.title || "Old vs new")}</h1>
  <p class="sub">${esc(a.sub || "")}</p>
  <div class="cols">
    <figure><figcaption>Before &middot; <b>${esc(a.oldLabel || "shipped")}</b></figcaption><img src="${oldSrc}"></figure>
    <figure><figcaption>After &middot; <b>${esc(a.newLabel || "this change")}</b></figcaption><img src="${newSrc}"></figure>
  </div>
  ${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}
</div>`;

const browser = await launch();
try {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 1 }));
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const el = await page.$(".wrap");
  await mkdir(dirname(a.out), { recursive: true });
  await writeFile(a.out, await el.screenshot({ type: "png" }));
  console.log(JSON.stringify({ ok: true, out: a.out }));
} finally {
  await browser.close();
}
