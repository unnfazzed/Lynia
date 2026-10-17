#!/usr/bin/env node
/**
 * The large-text sheet (ledger D-111): every screen a new biker walks through, from the welcome screen
 * to a job, rendered at the phone's text size 1.0 and 1.3 (the cap) at 360×720, and 1.3 on the 320×640
 * entry phone. The handoffs draw "font scale 1.3" frames and say text wraps and buttons grow; this sheet
 * is the evidence, and the automatic check below is the gate.
 *
 * The check: at 1.3, any element whose text is cut off (its content is wider than its box and the box
 * clips), or any element that runs past the right edge of the phone, is reported with its text. A screen
 * with findings exits non-zero.
 *
 *   node tools/parity/shoot-large-font.mjs --out docs/parity/LARGE-FONT-2026-10-17
 *   node tools/parity/shoot-large-font.mjs --only J1,O1      # a subset, by id
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { bundleScreen } from "./mobile/bundle.mjs";
import { interFontCss } from "./mobile/fonts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(arg("--out") ?? join(HERE, "out/large-font"));
const ONLY = arg("--only")?.split(",");
const SHOTS = `${OUT}-shots`;
const FIXTURES = join(HERE, "mobile/fixtures");
const app = (p) => join(REPO, "apps/mobile/app", p);

/** The new biker's journey (plan D-3A), in the order they meet it, then every drawn state of each screen (D-2A). */
const ROWS = [
  { id: "W1", label: "Welcome / onboarding", component: app("onboarding.tsx"), fixture: "onboard_food" },
  { id: "W2", label: "Welcome, shared", component: app("onboarding.tsx"), fixture: "onboard_shared" },
  { id: "A1", label: "Phone number", component: app("phone.tsx"), fixture: "auth_phone" },
  { id: "A2", label: "SMS code", component: app("verify.tsx"), fixture: "auth_otp" },
  { id: "A3", label: "SMS code, resend cooldown", component: app("verify.tsx"), fixture: "auth_otp_cooldown" },
  { id: "A4", label: "SMS code, locked", component: app("verify.tsx"), fixture: "auth_otp_locked" },
  { id: "A5", label: "Your details", component: app("profile/setup.tsx"), fixture: "auth_register" },
  { id: "P1", label: "After sign-up, location", component: app("setup-permissions.tsx"), fixture: "signup_perm_location" },
  { id: "P2", label: "After sign-up, notifications", component: app("setup-permissions.tsx"), fixture: "signup_perm_notif" },
  { id: "P3", label: "Biker permissions (P1)", component: app("permissions.tsx"), fixture: "signup_perm_rider" },
  { id: "B1", label: "Account, become a biker", component: app("(tabs)/account.tsx"), fixture: "rv2_account_become" },
  { id: "B2", label: "Account, under review", component: app("(tabs)/account.tsx"), fixture: "rv2_account_review" },
  { id: "B3", label: "Become a biker, ID check intro", component: app("rider/become.tsx"), fixture: "rider_kyc_intro" },
  { id: "J1", label: "Jobs board", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_board" },
  { id: "J2", label: "Jobs board, empty", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_board_empty" },
  { id: "J3", label: "Board, ID check under review", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_gate_pending" },
  { id: "J4", label: "Board, ID check failed", component: app("rider/(tabs)/index.tsx"), fixture: "rv2_gate_failed" },
  { id: "J5", label: "Board, just verified", component: app("rider/(tabs)/index.tsx"), fixture: "cm2_rider_verified" },
  { id: "O1", label: "Make an offer", component: app("rider/offer/[jobId].tsx"), fixture: "rv2_offer" },
  { id: "O2", label: "Food offer", component: app("rider/food-offer.tsx"), fixture: "rv2_food_offer" },
  { id: "O3", label: "Food offer, pay upfront", component: app("rider/food-offer.tsx"), fixture: "rv2_food_offer_upfront" },
  { id: "O4", label: "Food offer, expired", component: app("rider/food-offer.tsx"), fixture: "rider_food_offer_expired" },
  { id: "R1", label: "Job, heading to pickup", component: app("rider/job.tsx"), fixture: "rv2_job_pickup" },
  { id: "R2", label: "Job, check items", component: app("rider/job.tsx"), fixture: "rv2_job_check" },
  { id: "R3", label: "Job, delivery code", component: app("rider/job.tsx"), fixture: "rv2_job_code" },
  { id: "R4", label: "Job, assigned", component: app("rider/job.tsx"), fixture: "rider_parcel_job" },
  { id: "R5", label: "Food job", component: app("rider/food-job.tsx"), fixture: "rider_food_job" },
  { id: "M1", label: "Money", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money" },
  { id: "M2", label: "Money, below the floor", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money_floor" },
  { id: "M3", label: "Money, owes commission", component: app("rider/(tabs)/money.tsx"), fixture: "rv2_money_owes" },
  { id: "T1", label: "Top up", component: app("wallet/top-up.tsx"), fixture: "rv2_topup" },
  { id: "C1", label: "Biker account", component: app("rider/(tabs)/account.tsx"), fixture: "rv2_account_rider" },
  { id: "C2", label: "Bike & documents", component: app("rider/documents.tsx"), fixture: "rv2_docs" },
].filter((r) => !ONLY || ONLY.includes(r.id));

const VARIANTS = [
  { key: "360-1.0", w: 360, h: 720, fs: 1, label: "360 · text 1.0" },
  { key: "360-1.3", w: 360, h: 720, fs: 1.3, label: "360 · text 1.3", check: true },
  { key: "320-1.3", w: 320, h: 640, fs: 1.3, label: "320 · text 1.3", check: true },
];

function harnessHtml(js, fontCss, { w, h }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;padding:0;background:#fff;}
#root{width:${w}px;height:${h}px;overflow:hidden;display:flex;flex-direction:column;
  font-family:"Inter",-apple-system,"Segoe UI",Roboto,sans-serif;}
#root>*{flex:1 1 auto;min-height:0;}
</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
}

/** In the page: text that is cut off, or anything that runs past the phone's right edge. */
function findOverflow() {
  const root = document.getElementById("root");
  const right = root.getBoundingClientRect().right;
  const out = [];
  const seen = new Set();
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Scrolling containers are allowed to be wider than the screen (chip rows, carousels).
    let scroller = el.parentElement;
    let inScroller = false;
    while (scroller && scroller !== root) {
      const sc = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(sc.overflowX)) inScroller = true;
      scroller = scroller.parentElement;
    }
    const text = (el.innerText || el.value || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    // A line-clamped or ellipsised text is the design's own truncation (numberOfLines): allowed.
    const clamped = cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none";
    if (ownText && !clamped && cs.overflow !== "visible" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
      const k = `clip|${text}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ kind: "text cut off", text });
      }
    }
    if (!inScroller && ownText && r.right > right + 1) {
      const k = `edge|${text}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ kind: "past the right edge", text, by: Math.round(r.right - right) });
      }
    }
  }
  return out;
}

const bundles = new Map();
async function bundleFor(r, fs) {
  const k = `${r.component}|${r.fixture}|${fs}`;
  if (!bundles.has(k)) {
    bundles.set(k, await bundleScreen({ component: r.component, fixture: join(FIXTURES, `${r.fixture}.mjs`), fontScale: fs === 1 ? undefined : fs }));
  }
  return bundles.get(k);
}

async function shoot(browser, r, v, fontCss) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2 }));
  const page = await ctx.newPage();
  try {
    await page.setContent(harnessHtml(await bundleFor(r, v.fs), fontCss, v), { waitUntil: "load" });
    await page.waitForFunction(() => window.__PARITY_READY === true || typeof window.__PARITY_ERROR === "string", { timeout: 20000 });
    const err = await page.evaluate(() => window.__PARITY_ERROR || null);
    if (err) throw new Error(err);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(900);
    const file = join(SHOTS, `${r.id}-${v.key}.png`);
    await (await page.$("#root")).screenshot({ path: file });
    const findings = v.check ? await page.evaluate(findOverflow) : [];
    return { file, findings };
  } finally {
    await ctx.close();
  }
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dataUri = async (p) => (p ? `data:image/png;base64,${(await readFile(p)).toString("base64")}` : null);

await mkdir(SHOTS, { recursive: true });
const fontCss = await interFontCss();
const browser = await launch();
const results = [];
try {
  for (const r of ROWS) {
    const cells = [];
    for (const v of VARIANTS) {
      try {
        cells.push({ v, ...(await shoot(browser, r, v, fontCss)) });
      } catch (e) {
        cells.push({ v, error: String(e?.message || e).slice(0, 300) });
      }
    }
    const findings = cells.flatMap((c) => (c.findings ?? []).map((f) => ({ ...f, where: c.v.label })));
    const errors = cells.filter((c) => c.error).map((c) => `${c.v.label}: ${c.error}`);
    results.push({ r, cells, findings, errors });
    console.log(`${findings.length || errors.length ? "FAIL" : "ok  "} ${r.id} ${r.label}${findings.map((f) => `\n     ${f.where}: ${f.kind} "${f.text}"${f.by ? ` (+${f.by}px)` : ""}`).join("")}${errors.map((e) => `\n     ERROR ${e}`).join("")}`);
  }
} finally {
  await browser.close();
}

const sections = [];
for (const { r, cells, findings, errors } of results) {
  const figs = [];
  for (const c of cells) {
    const src = await dataUri(c.file);
    figs.push(`<figure>${src ? `<img width="${c.v.w}" src="${src}">` : `<div class="missing">${esc(c.error)}</div>`}<figcaption>${esc(c.v.label)}</figcaption></figure>`);
  }
  const bad = findings.length || errors.length;
  sections.push(`<section><header><b>${esc(r.id)} · ${esc(r.label)}</b> <span class="${bad ? "bad" : "ok"}">${bad ? `${findings.length + errors.length} finding(s)` : "fits"}</span></header>
    ${bad ? `<ul>${[...findings.map((f) => `<li>${esc(f.where)}: ${esc(f.kind)} “${esc(f.text)}”</li>`), ...errors.map((e) => `<li>${esc(e)}</li>`)].join("")}</ul>` : ""}
    <div class="row">${figs.join("")}</div></section>`);
}
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Large text (D-111)</title><style>
body{font:14px/1.4 Inter,system-ui,sans-serif;margin:24px;color:#14181b;background:#f6f7f8}
h1{font-size:20px}section{background:#fff;border-radius:12px;padding:16px;margin:0 0 16px}
.row{display:flex;gap:16px;align-items:flex-start}figure{margin:0}img{display:block;border:1px solid #dde2e5;border-radius:8px}
figcaption{font-size:12px;color:#5b6670;margin-top:4px}.ok{color:#127a3d}.bad{color:#b42318}ul{margin:8px 0;color:#b42318}
.missing{width:320px;height:200px;display:grid;place-items:center;background:#fdecea;color:#b42318;font-size:12px;padding:8px}
</style></head><body><h1>Large text (D-111): the biker journey at text 1.0 and 1.3, 360×720 and 320×640</h1>${sections.join("")}</body></html>`;
await writeFile(`${OUT}.html`, html);
const failed = results.filter((x) => x.findings.length || x.errors.length);
console.log(`\nsheet: ${OUT}.html; ${results.length - failed.length}/${results.length} screens fit at 1.3`);
process.exitCode = failed.length ? 1 : 0;
