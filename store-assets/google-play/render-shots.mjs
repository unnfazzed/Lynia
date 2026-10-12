// Renders the Play phone screenshots (1080×1920) from the current design handoffs.
// Usage (Playwright + Chromium installed): node store-assets/google-play/render-shots.mjs
// Each screen is captured at 3× from its handoff frame, the status bar is cropped off,
// and it is placed under a two-line caption on the mint backdrop.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = createRequire("/opt/node22/lib/node_modules/")("playwright")); }

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.resolve(HERE, "../../packages/design/handoff");
const OUT = path.join(HERE, "phone-screenshots");
const FONTS = path.join(HANDOFF, "calm-mint-v2-2026-10/assets/fonts");

// [file, handoff page, frame index, caption line 1, line 2 (green)]. The index counts the page's
// `.ph` phone frames; Send Compose has no `.ph`, so there it counts 360×720 divs.
const SHOTS = [
  ["01-home", "calm-mint-v2-2026-10/Calm Mint v2 - all screens.html", 0, "Food, shops and parcels.", "One app."], // H1
  ["02-order-food", "browse-v2/Browse v2 - all screens.html", 30, "Order from restaurants", "in a few taps."], // S5
  ["03-track-live", "order-flow-v2/Order flow v2.1 - all screens.html", 34, "Track every order", "live, to your door."], // T9
  ["04-send-parcel", "send-compose-v2/design/Send Compose v2 (standalone).html", 11, "Send a parcel.", "Name your price."], // step 3
];

// Store shots show the app as shipped: drop design-review annotations, and use the
// shipped Home tile label "Food" (ledger D-65) instead of the mock's "Restaurants".
function cleanFrame(ph) {
  ph.querySelectorAll(".nb").forEach((e) => e.remove());
  const w = document.createTreeWalker(ph, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = w.nextNode())) if (t.nodeValue.trim() === "Restaurants") t.nodeValue = "Food";
}

const dataUri = (p, type) => `data:${type};base64,${fs.readFileSync(p).toString("base64")}`;

const browser = await chromium.launch();
const raws = {};
for (const [name, page, index] of SHOTS) {
  const pg = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 3 });
  await pg.goto("file://" + encodeURI(path.join(HANDOFF, page)));
  await pg.waitForTimeout(4000);
  let frames = await pg.$$(".ph");
  if (frames.length === 0) for (const h of await pg.$$("div")) {
    const [w, hgt] = await h.evaluate((e) => [e.offsetWidth, e.offsetHeight]);
    if (w === 360 && hgt === 720) frames.push(h);
  }
  const el = frames[index];
  if (name === "01-home") await el.evaluate(cleanFrame);
  await el.scrollIntoViewIfNeeded();
  await pg.waitForTimeout(300);
  raws[name] = await el.screenshot();
  await pg.close();
}

const pg = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const f400 = dataUri(path.join(FONTS, "inter-400.woff2"), "font/woff2");
const f700 = dataUri(path.join(FONTS, "inter-700.woff2"), "font/woff2");
fs.mkdirSync(OUT, { recursive: true });
for (const [name, , , l1, l2] of SHOTS) {
  const img = `data:image/png;base64,${raws[name].toString("base64")}`;
  await pg.setContent(`<!doctype html><html><head><meta charset=utf-8><style>
  @font-face{font-family:Inter;font-weight:400;src:url(${f400})}
  @font-face{font-family:Inter;font-weight:700 800;src:url(${f700})}
  html,body{margin:0}body{width:1080px;height:1920px;overflow:hidden;background:#E9F8EF;font-family:Inter;position:relative}
  .blob{position:absolute;border-radius:50%}
  h1{position:absolute;left:0;right:0;top:118px;margin:0;text-align:center;font:800 76px/1.12 Inter;letter-spacing:-2px;color:#14181b}
  h1 span{color:#006630}
  .ph{position:absolute;left:160px;top:400px;width:760px;height:1461px;border-radius:56px;overflow:hidden;background:#fff;
    box-shadow:0 0 0 2px rgba(20,24,27,.06),0 30px 80px rgba(0,102,48,.18)}
  /* 760/360 scale; -59.1px crops the 28dp status bar */
  .ph div{width:760px;height:1461px;background:url(${img}) 0 -59.1px/760px auto no-repeat}
  </style></head><body>
  <div class=blob style="width:520px;height:520px;background:#CDEEDA;right:-180px;top:-200px"></div>
  <div class=blob style="width:120px;height:120px;background:#FFD23F;left:96px;top:300px"></div>
  <h1>${l1}<br><span>${l2}</span></h1>
  <div class=ph><div></div></div></body></html>`);
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("wrote", name);
}
await browser.close();
