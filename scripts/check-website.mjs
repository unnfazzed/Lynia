#!/usr/bin/env node
/**
 * GUARDRAIL for the lyniago.com marketing site (apps/website, docs/WEBSITE.md).
 *
 * The site is the approved design handoff deployed AS-IS (packages/design/handoff/lyniago-website,
 * "Fidelity: HIGH, ship as-is"; owner instruction 2026-09-28: "use the handoff assets dont change the
 * design to match some rules in github. for the website apply as is"). The app's design rules
 * (token conformance, tap-target floors, gallery alignment) do NOT apply to it: the handoff is the
 * whole spec. This script keeps it that way:
 *
 *   1. PARITY. Every file in the handoff's site/ exists in apps/website/site byte-for-byte. The one
 *      exception is index.html, which must equal the handoff's index.html with exactly the
 *      LAUNCH_EDITS below applied (each must match exactly once). Any other file in apps/website/site
 *      must be on the EXTRA_FILES allowlist.
 *   2. DERIVED 404. site/404.html is generated from index.html: the same <style>, the same header and
 *      footer markup (links made absolute so they work at any path), a "Back home" button, and a
 *      trimmed icon script. It must be up to date.
 *   3. CSP. The script-src of site/_headers lists the sha256 of every inline <script> on every page,
 *      and nothing else, hashed the way browsers do (after CRLF -> LF). Nothing on a page may need
 *      something the policy blocks: inline on*= handlers, javascript: URLs, <base>, <iframe>, or any
 *      remote script, image, stylesheet, font or form target. Only <a> and rel=canonical/alternate
 *      may point off-site.
 *   4. REFERENCES. Every src/href/url() on every page resolves to a file in site/, an id on the home
 *      page, an external URL, or an INTENTIONAL_404 path.
 *   5. IMMUTABLE ASSETS (only when BASE_REF is set, i.e. on a PR). site/assets/* is served with a
 *      one-year immutable cache, so a changed asset must get a new name. Editing one in place fails.
 *   6. CACHE RULES. _headers gives each file under site/assets/ its own exact immutable rule (the
 *      generated block between "# BEGIN immutable assets" and "# END immutable assets"), and no
 *      wildcard rule sets Cache-Control. _headers matches by path, not status, so a wildcard cache rule
 *      also applies to the 404 page served at a missing path, and Cloudflare's edge then caches that
 *      404 for as long as the rule says (docs/WEBSITE.md § Hosting).
 *
 * Usage:
 *   node scripts/check-website.mjs           check (CI)
 *   node scripts/check-website.mjs --write   regenerate site/404.html, the CSP hashes and the asset cache rules, then check
 *   BASE_REF=origin/main node scripts/check-website.mjs   also run the immutable-asset check
 * Tests: node --test scripts/check-website.test.mjs
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HANDOFF_SITE_REL = "packages/design/handoff/lyniago-website/site";
const SITE_REL = "apps/website/site";

/**
 * The only edits allowed between the handoff's index.html and the deployed one. Each is a TODO the
 * handoff README itself lists ("Items to finish before launch"), decided by the owner. Record the
 * decision in docs/DESIGN-DEVIATIONS.md (D-42) before adding one here.
 */
export const LAUNCH_EDITS = [
  {
    id: "privacy-link",
    todo: "README TODO #4 (Terms / Privacy)",
    decision: "owner 2026-09-28: Privacy links to the live privacy notice (D-42)",
    from: '<a href="#">Privacy</a>',
    to: '<a href="https://api.lyniago.com/legal/privacy">Privacy</a>',
  },
  {
    id: "terms-link",
    todo: "README TODO #4 (Terms / Privacy)",
    decision: "owner 2026-09-30: Terms links to the live terms page, one set for customers, riders and businesses (D-42)",
    from: '<a href="#">Terms</a>',
    to: '<a href="https://api.lyniago.com/legal/terms">Terms</a>',
  },
  {
    id: "about-removed",
    todo: "README TODO #3 (About us)",
    decision: "owner 2026-09-30: remove the About us link from the footer; there is no About page (D-42)",
    from: '<a href="/about">About us</a>',
    to: "",
  },
  // The two edits below are one fix. The lazy scooter illustration had no reserved size, so the page
  // grew by ~350px as it loaded and the first tap on "Download the app" / "Send a parcel" stopped
  // 320-540px short of #app on phones and tablets. It uses the handoff README's own pattern for the
  // screenshots (width/height attributes plus height:auto), with the SVG's 460x460. Pixel-identical
  // once loaded (parity harness: 0 px at every width).
  {
    id: "biz-ill-size",
    todo: "not a README TODO: functional fix found by the gstack QA and design reviews",
    decision: "owner 2026-09-28: approved (D-42); report upstream so the next export carries it",
    from: 'class="biz-ill" src="assets/illustrations/biz-scooter-rider.svg" alt=',
    to: 'class="biz-ill" src="assets/illustrations/biz-scooter-rider.svg" width="460" height="460" alt=',
  },
  {
    id: "biz-ill-height-auto",
    todo: "not a README TODO: functional fix found by the gstack QA and design reviews",
    decision: "owner 2026-09-28: approved (D-42); report upstream so the next export carries it",
    from: ".biz-ill{width:100%;max-width:540px;",
    to: ".biz-ill{width:100%;height:auto;max-width:540px;",
  },
  // README TODO #1, resolved once the Play listing went public (2026-10-14). Each app button goes to the smart
  // link /download (apps/website/worker.js) rather than straight to Play, so iPhone visitors reach the web app.
  // On a desktop the button opens the QR popup instead (`data-download`, the download-qr-* edits below; handoff
  // download-qr-install-tip-2026-10 §1). Same tab: the README's target="_blank" would open a second copy of this
  // page. "Become a biker" goes straight to Play: the biker app is Android-only.
  {
    id: "download-header",
    todo: "README TODO #1 (Play Store link)",
    decision: "owner 2026-10-15: the app buttons go to /download (Play on Android, web app on iPhone) and open the QR popup on desktop (D-42)",
    from: '<a class="btn b-g" href="#app"><i data-i="play"></i>Download the app</a>',
    to: '<a class="btn b-g" href="/download" data-download><i data-i="play"></i>Download the app</a>',
  },
  {
    id: "download-hero-send",
    todo: "README TODO #1 (Play Store link)",
    decision: "owner 2026-10-15: the app buttons go to /download (Play on Android, web app on iPhone) and open the QR popup on desktop (D-42)",
    from: '<a class="btn b-yel" href="#app"><i data-i="play"></i>Send a parcel</a>',
    to: '<a class="btn b-yel" href="/download" data-download><i data-i="play"></i>Send a parcel</a>',
  },
  {
    id: "download-steps",
    todo: "README TODO #1 (Play Store link)",
    decision: "owner 2026-10-15: the app buttons go to /download (Play on Android, web app on iPhone) and open the QR popup on desktop (D-42)",
    from: '<a class="btn b-ink" href="#app"><i data-i="play"></i>Download the app</a>',
    to: '<a class="btn b-ink" href="/download" data-download><i data-i="play"></i>Download the app</a>',
  },
  {
    id: "download-app-section",
    todo: "README TODO #1 (Play Store link)",
    decision: "owner 2026-10-15: the app buttons go to /download (Play on Android, web app on iPhone) and open the QR popup on desktop (D-42)",
    from: '<a class="btn b-yel" href="#app"><i data-i="play"></i>Download the app</a>',
    to: '<a class="btn b-yel" href="/download" data-download><i data-i="play"></i>Download the app</a>',
  },
  {
    id: "become-biker",
    todo: "README TODO #1 (Play Store link)",
    decision: "owner 2026-10-15: Become a biker goes to the Play listing; the biker app is Android-only (D-42)",
    from: '<a class="btn b-vio" href="#app">Become a biker</a>',
    to: '<a class="btn b-vio" href="https://play.google.com/store/apps/details?id=zw.co.lynia&amp;referrer=utm_source%3Dlyniago.com%26utm_medium%3Dwebsite%26utm_campaign%3Dbiker">Become a biker</a>',
  },  // The desktop QR popup (handoff download-qr-install-tip-2026-10 §1, owner 2026-10-15). On a desktop
  // ((min-width: 900px) and (hover: hover) and (pointer: fine)) a click on any data-download button opens it
  // instead of following /download; phones and tablets follow the link. Nothing else on the page changes.
  // We are live in Harare and Bulawayo (owner 2026-10-20). The copy that named Harare alone names both, and the
  // "Live in" map gets a second dot, drawn exactly like Harare's, with the chip naming both. The illustrations'
  // alt text describes the drawings and is unchanged.
  {
    id: "live-title",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<title>LyniaGo — On-demand delivery in Harare</title>",
    to: "<title>LyniaGo — On-demand delivery in Harare and Bulawayo</title>",
  },
  {
    id: "live-description",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<meta name=\"description\" content=\"On-demand delivery for local businesses in Harare.\">",
    to: "<meta name=\"description\" content=\"On-demand delivery for local businesses in Harare and Bulawayo.\">",
  },
  {
    id: "live-og-title",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<meta property=\"og:title\" content=\"LyniaGo — On-demand delivery in Harare\">",
    to: "<meta property=\"og:title\" content=\"LyniaGo — On-demand delivery in Harare and Bulawayo\">",
  },
  {
    id: "live-og-description",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<meta property=\"og:description\" content=\"Parcels and deliveries across Harare, tracked to your door.\">",
    to: "<meta property=\"og:description\" content=\"Parcels and deliveries across Harare and Bulawayo, tracked to your door.\">",
  },
  {
    id: "live-hero",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<p>Parcels and deliveries across Harare, tracked to your door.</p>",
    to: "<p>Parcels and deliveries across Harare and Bulawayo, tracked to your door.</p>",
  },
  {
    id: "live-heading",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<h2><i data-i=\"pin\" class=\"pin\"></i>Live in Harare</h2>",
    to: "<h2><i data-i=\"pin\" class=\"pin\"></i>Live in Harare and Bulawayo</h2>",
  },
  {
    id: "live-map-label",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "aria-label=\"Map of Zimbabwe with Harare highlighted\"",
    to: "aria-label=\"Map of Zimbabwe with Harare and Bulawayo highlighted\"",
  },
  {
    id: "live-map-bulawayo-point",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "[hx,hy]=pr([31.05,-17.83]);",
    to: "[hx,hy]=pr([31.05,-17.83]),[bx,by]=pr([28.58,-20.15]);",
  },
  {
    id: "live-map-bulawayo-dot",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: "<circle cx=\"${hx}\" cy=\"${hy}\" r=\"7\" fill=\"#00B14F\"/></svg>",
    to: "<circle cx=\"${hx}\" cy=\"${hy}\" r=\"7\" fill=\"#00B14F\"/><circle cx=\"${bx}\" cy=\"${by}\" r=\"6\" fill=\"#00B14F\" class=\"zpulse\"/><circle cx=\"${bx}\" cy=\"${by}\" r=\"11\" fill=\"#fff\"/><circle cx=\"${bx}\" cy=\"${by}\" r=\"7\" fill=\"#00B14F\"/></svg>",
  },
  {
    id: "live-map-chip",
    todo: "not a README TODO: Bulawayo launch (owner 2026-10-20)",
    decision: "owner 2026-10-20: we are live in Harare and Bulawayo; the site names both and the map marks both (D-42, D-120)",
    from: ">Harare</div>`;}",
    to: ">Harare · Bulawayo</div>`;}",
  },
  {
    id: "download-qr-css",
    todo: "not a README TODO: handoff download-qr-install-tip-2026-10 §1 (popup CSS)",
    decision: "owner 2026-10-15: desktop app buttons open a QR popup for lyniago.com/download (D-42)",
    from: "</style>",
    to: String.raw`/* Download QR popup (handoff download-qr-install-tip-2026-10 §1; launch edit download-qr-css) */
.qrm{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:24px}
.qrm[hidden]{display:none}
.qrm-scrim{position:absolute;inset:0;background:rgba(20,24,27,.55)}
.qrm-box{position:relative;width:440px;max-width:calc(100vw - 48px);background:#fff;border-radius:32px;overflow:hidden;padding:0 32px 28px;display:flex;flex-direction:column;align-items:center;text-align:center;box-shadow:0 40px 80px rgba(20,24,27,.35)}
.qrm-band{position:absolute;left:0;right:0;top:0;height:170px;background:var(--g);overflow:hidden}
.qrm-blob{position:absolute;border-radius:50%}
.qrm-b1{width:120px;height:120px;left:-30px;top:-40px;background:var(--coral)}
.qrm-b2{width:160px;height:160px;right:-50px;top:30px;background:var(--yel)}
.qrm-b3{width:36px;height:36px;right:120px;top:18px;background:var(--pink)}
.qrm-x{position:absolute;top:14px;right:14px;z-index:3;width:44px;height:44px;border:0;border-radius:999px;background:#fff;color:var(--ink);display:grid;place-items:center;cursor:pointer;padding:0}
.qrm-x svg{width:24px;height:24px}
.qrm-card{position:relative;z-index:2;margin-top:36px;background:#fff;border-radius:28px;padding:16px;transform:rotate(-3deg);box-shadow:0 24px 48px rgba(6,59,34,.3)}
.qrm-card img{display:block;width:236px;height:236px}
.qrm-sticker{position:absolute;top:-22px;right:-30px;height:46px;padding:0 20px;border-radius:999px;background:var(--yel);color:#3D3100;font:700 17px/1 Inter,system-ui,sans-serif;display:flex;align-items:center;white-space:nowrap;transform:rotate(9deg);box-shadow:0 10px 20px rgba(6,59,34,.25)}
.qrm-box h2{position:relative;margin:24px 0 0;font-size:26px;line-height:1.15;letter-spacing:-.025em;color:var(--ink)}
.qrm-box p{position:relative;margin:6px 0 0;font-size:16px;line-height:1.45;color:var(--mut)}
html.qrm-lock{overflow:hidden}
@media (prefers-reduced-motion:no-preference){
.qrm .qrm-scrim{opacity:0;transition:opacity .16s}
.qrm .qrm-box{opacity:0;transform:scale(.96);transition:opacity .2s cubic-bezier(.2,.8,.2,1),transform .2s cubic-bezier(.2,.8,.2,1)}
.qrm.on .qrm-scrim,.qrm.on .qrm-box{opacity:1}
.qrm.on .qrm-box{transform:none}
}
</style>`,
  },
  {
    id: "download-qr-popup",
    todo: "not a README TODO: handoff download-qr-install-tip-2026-10 §1 (popup markup and script)",
    decision: "owner 2026-10-15: desktop app buttons open a QR popup for lyniago.com/download (D-42)",
    from: "</body></html>",
    to: String.raw`<div class="qrm" id="qrm" hidden>
<div class="qrm-scrim" data-qr-close></div>
<div class="qrm-box" role="dialog" aria-modal="true" aria-labelledby="qr-title">
<div class="qrm-band" aria-hidden="true"><span class="qrm-blob qrm-b1"></span><span class="qrm-blob qrm-b2"></span><span class="qrm-blob qrm-b3"></span></div>
<button type="button" class="qrm-x" aria-label="Close" data-qr-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
<div class="qrm-card"><span class="qrm-sticker">Point. Scan. Go.</span><img src="assets/download-qr-2026-10.svg" width="236" height="236" alt="QR code to download LyniaGo"></div>
<h2 id="qr-title">Scan to get LyniaGo</h2>
<p>Point your phone’s camera at the code.</p>
</div>
</div>
<script>
(function(){
var m=document.getElementById('qrm');if(!m)return;
var x=m.querySelector('.qrm-x'),root=document.documentElement,opener=null;
var desk=window.matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
function open(b){opener=b;m.hidden=false;root.classList.add('qrm-lock');x.focus();requestAnimationFrame(function(){requestAnimationFrame(function(){m.classList.add('on');});});}
function close(){m.classList.remove('on');m.hidden=true;root.classList.remove('qrm-lock');if(opener)opener.focus();opener=null;}
document.querySelectorAll('a[data-download]').forEach(function(b){b.addEventListener('click',function(e){
if(!desk.matches||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();open(b);});});
m.addEventListener('click',function(e){if(e.target.closest('[data-qr-close]'))close();});
document.addEventListener('keydown',function(e){if(m.hidden)return;
if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab'){e.preventDefault();x.focus();}});
})();
</script>
</body></html>`,
  },
];

/**
 * Apply launch edits as literal text. Each `from` must occur exactly once, and split/join is used
 * because String.replace would expand $&, $' and $` in `to`.
 */
export function applyLaunchEdits(html, edits = LAUNCH_EDITS) {
  const problems = [];
  for (const edit of edits) {
    const n = html.split(edit.from).length - 1;
    if (n !== 1) problems.push(`launch edit "${edit.id}" must match the handoff's index.html exactly once (matched ${n}).`);
    else html = html.split(edit.from).join(edit.to);
  }
  return { html, problems };
}

/** Files the handoff does not contain but the deployed site may. Anything else is drift. */
const EXTRA_FILES = new Set([
  "404.html", // derived from index.html (README "Deploy" §6)
  "_headers", // hosting config, parsed by Cloudflare and never served
  "robots.txt",
  "sitemap.xml",
  "assets/og-image.png", // README TODO #2, built to its spec (apps/website/og-image/)
  "email/lyniago-signature-logo-tile.png", // owner 2026-10-12: email-signature logo, hotlinked by mail clients
  "assets/download-qr-2026-10.svg", // the desktop QR popup's code, verbatim from handoff download-qr-install-tip-2026-10
]);

/**
 * Paths linked on purpose that have no page yet, so they serve 404.html (D-42). Empty since the About
 * us link was removed (owner, 2026-09-30); kept so a future placeholder link has a sanctioned home.
 */
const INTENTIONAL_404 = new Set([]);

/** Paths the site Worker (apps/website/worker.js) answers itself, with no file behind them. */
const WORKER_ROUTES = new Set(["/download"]);

/**
 * Every <script> element: group 1 = attributes, group 2 = text. Case-insensitive, and lenient about
 * attributes and the end tag (browsers end a script at `</script foo>` too), so a script written any
 * way a browser runs it is seen by the CSP check.
 */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi;

/** The cache header every file under site/assets/ gets (the handoff README, "Deploy" §4-5). */
export const IMMUTABLE = "Cache-Control: public, max-age=31536000, immutable";
const ASSET_RULES = /(# BEGIN immutable assets\n)([\s\S]*?)(# END immutable assets)/;
/** Cloudflare's limit on rules in one _headers file. */
const MAX_HEADER_RULES = 100;

/** The generated _headers block: one exact rule per asset file (paths relative to site/). */
export function assetCacheRules(files) {
  return files.map((f) => `/${f}\n  ${IMMUTABLE}\n`).join("\n");
}

/** _headers as rules: [{ path, headers: ["Name: value", …] }]. Comments and blank lines are skipped. */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) rules.at(-1)?.headers.push(line.trim());
    else rules.push({ path: line.trim(), headers: [] });
  }
  return rules;
}

const read = (p) => readFileSync(p, "utf8");
const sha256 = (buf) => createHash("sha256").update(buf).digest();

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out.sort();
}

function extract(html, re, what) {
  const m = html.match(re);
  if (!m) throw new Error(`could not find ${what} in index.html`);
  return m[0];
}

/** Rewrite page-relative links so the markup works when 404.html is served at any path. */
function absolutize(markup) {
  return markup
    .replaceAll('href="#top"', 'href="/"')
    .replace(/href="#([^"]+)"/g, 'href="/#$1"')
    .replace(/(src|href)="assets\//g, '$1="/assets/')
    .replace(/url\("assets\//g, 'url("/assets/');
}

const NOT_FOUND_CSS = `/* 404: derived from index.html by scripts/check-website.mjs --write */
body{min-height:100vh;display:flex;flex-direction:column}.nf{flex:1 0 auto}
.nf{padding:104px 0 120px}.nf h1{font-size:clamp(36px,4.6vw,60px);margin-bottom:32px}
@media (min-width:961px){.nf{padding:72px 0 80px}.nf h1{font-size:clamp(30px,3.6vw,46px);margin-bottom:28px}}
`;

/** The 404 page: index.html's <style>, header and footer verbatim (links absolutized), plus a Back home button. */
export function build404(indexHtml) {
  const style = extract(indexHtml, /<style>[\s\S]*?<\/style>/, "<style>");
  const header = extract(indexHtml, /<header class="nav">[\s\S]*?<\/header>/, "<header>");
  const footer = extract(indexHtml, /<footer>[\s\S]*?<\/footer>/, "<footer>");

  const main = '<main class="nf"><div class="wrap">\n<h1>Page not found</h1>\n<a class="btn b-g" href="/">Back home</a>\n</div></main>';
  const body = [absolutize(header), main, absolutize(footer)].join("\n\n");

  // Keep only the icon paths this page uses, plus the line that renders them (both verbatim).
  const used = new Set([...body.matchAll(/data-i="([a-z]+)"/g)].map((m) => m[1]));
  const script = [...indexHtml.matchAll(SCRIPT_TAG)][0];
  if (!script) throw new Error("could not find <script> in index.html");
  const lines = script[2].replace(/^\n/, "").split("\n");
  const entries = lines.filter((l) => /^[a-z]+:'/.test(l) && used.has(l.slice(0, l.indexOf(":"))));
  const render = lines.find((l) => l.startsWith("document.querySelectorAll('i[data-i]')"));
  if (!render || entries.length !== used.size) throw new Error("could not derive the 404 icon script from index.html");
  const icons = entries.map((l) => l.replace(/,$/, "").replace(/};$/, ""));
  const trimmed = `<script>\nconst P={\n${icons.join(",\n")}};\n${render}\n</script>`;

  const css = absolutize(style).replace(/<\/style>$/, `${NOT_FOUND_CSS}</style>`);
  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — LyniaGo</title>',
    '<meta name="robots" content="noindex">',
    '<meta name="theme-color" content="#00B14F">',
    '<link rel="icon" type="image/svg+xml" href="/assets/brand/lyniago-mark.svg">',
    '<link rel="preload" href="/assets/fonts/inter-700.woff2" as="font" type="font/woff2" crossorigin>',
    '<link rel="preload" href="/assets/fonts/inter-600.woff2" as="font" type="font/woff2" crossorigin>',
    `${css}</head><body>`,
    "",
    body,
    "",
    trimmed,
    "</body></html>",
    "",
  ].join("\n");
}

/**
 * Run every check against the repo at `root`. Returns the list of problems (empty when clean).
 * `write` regenerates the derived files (404.html, CSP hashes) before checking them.
 */
export function checkWebsite({ root = REPO_ROOT, write = false, baseRef = "" } = {}) {
  const HANDOFF_SITE = join(root, HANDOFF_SITE_REL);
  const SITE = join(root, SITE_REL);
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const pages = () => walk(SITE).filter((f) => f.endsWith(".html"));

  // ------------------------------------------------------------ 1. parity with the handoff
  function expectedIndex() {
    const { html, problems } = applyLaunchEdits(read(join(HANDOFF_SITE, "index.html")));
    problems.forEach(fail);
    return html;
  }

  function checkParity() {
    const handoffFiles = walk(HANDOFF_SITE);
    const siteFiles = new Set(walk(SITE));
    for (const f of handoffFiles) {
      if (!siteFiles.has(f)) {
        fail(`${SITE_REL}/${f} is missing (it is in the handoff).`);
      } else if (f === "index.html") {
        if (read(join(SITE, f)) !== expectedIndex()) {
          fail(
            `${SITE_REL}/index.html differs from the handoff beyond the sanctioned LAUNCH_EDITS. The website ships the ` +
              "handoff as-is: revert the change, or log an owner-approved entry in docs/DESIGN-DEVIATIONS.md and add it " +
              "to LAUNCH_EDITS in scripts/check-website.mjs.",
          );
        }
      } else if (!sha256(readFileSync(join(SITE, f))).equals(sha256(readFileSync(join(HANDOFF_SITE, f))))) {
        fail(`${SITE_REL}/${f} is not byte-identical to the handoff copy.`);
      }
    }
    const handoffSet = new Set(handoffFiles);
    for (const f of siteFiles) {
      if (!handoffSet.has(f) && !EXTRA_FILES.has(f)) {
        fail(`${SITE_REL}/${f} is not in the handoff and not on the EXTRA_FILES allowlist.`);
      }
    }
  }

  // ------------------------------------------------------------ 2. the derived 404 page
  function check404() {
    const want = build404(read(join(SITE, "index.html")));
    const path = join(SITE, "404.html");
    if (write) writeFileSync(path, want);
    else if (!existsSync(path) || read(path) !== want) {
      fail(`${SITE_REL}/404.html is out of date with index.html. Run: node scripts/check-website.mjs --write`);
    }
  }

  // ------------------------------------------------------------ 3. CSP hashes + compatibility
  /** Fail on markup the site's CSP would silently block in production (default-src 'self'). */
  function checkCspCompatible(page, html) {
    const markup = html.replace(SCRIPT_TAG, "<script></script>"); // script text is not markup
    const offSite = (v) => /^\s*(https?:)?\/\//i.test(v);
    for (const [, tag, attrs] of markup.matchAll(/<([a-z][a-z0-9:-]*)\b([^>]*)>/gi)) {
      const name = tag.toLowerCase();
      const attr = {};
      for (const [, k, , dq, sq, bare] of attrs.matchAll(/([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        attr[k.toLowerCase()] = dq ?? sq ?? bare ?? "";
      }
      for (const k of Object.keys(attr)) {
        if (/^on[a-z]+$/.test(k)) fail(`${page}: <${name} ${k}=…> is an inline event handler; the CSP blocks it.`);
      }
      if (/^\s*javascript:/i.test(attr.href ?? "")) fail(`${page}: <${name} href="javascript:…"> is blocked by the CSP.`);
      if (name === "base" || name === "iframe") fail(`${page}: <${name}> is not allowed (the CSP blocks it).`);
      const linkOk = name === "link" && /\b(canonical|alternate)\b/i.test(attr.rel ?? "");
      for (const k of ["src", "srcset", "poster", "data", "href", "xlink:href", "action"]) {
        if (attr[k] === undefined || !offSite(attr[k]) || name === "a" || linkOk) continue;
        fail(`${page}: <${name} ${k}="${attr[k]}"> loads from another origin; the CSP only allows 'self'.`);
      }
    }
    for (const [m] of markup.matchAll(/url\(\s*["']?\s*(?:https?:)?\/\/[^)]*\)|@import\s+["']\s*(?:https?:)?\/\/[^"']*["']/gi)) {
      fail(`${page}: CSS ${m} loads from another origin; the CSP only allows 'self'.`);
    }
  }

  function checkCsp() {
    const want = new Set();
    for (const page of pages()) {
      const html = read(join(SITE, page));
      for (const [, attrs, text] of html.matchAll(SCRIPT_TAG)) {
        if (/\bsrc\s*=/i.test(attrs)) fail(`${page}: external scripts are not expected.`);
        // Browsers hash the script text after the HTML parser turns CRLF / CR into LF.
        else want.add(`'sha256-${sha256(Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8")).toString("base64")}'`);
      }
      checkCspCompatible(page, html);
    }
    const wanted = [...want].sort();
    const path = join(SITE, "_headers");
    const re = /(script-src 'self')((?: (?:'sha256-[A-Za-z0-9+/=]+'|HASHES))*)(;)/;
    if (!re.test(read(path))) {
      fail(`${SITE_REL}/_headers has no "script-src 'self' …;" directive to check.`);
      return;
    }
    if (write) writeFileSync(path, read(path).replace(re, `$1 ${wanted.join(" ")}$3`));
    const have = read(path).match(re)[2].trim().split(/\s+/).filter(Boolean).sort();
    if (have.join(" ") !== wanted.join(" ")) {
      fail(
        `${SITE_REL}/_headers script-src hashes do not match the pages' inline scripts. ` +
          "Run: node scripts/check-website.mjs --write",
      );
    }
  }

  // ------------------------------------------------------------ 4. references resolve
  function checkReferences() {
    const files = new Set(walk(SITE));
    const ids = new Set([...read(join(SITE, "index.html")).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const page of pages()) {
      const html = read(join(SITE, page));
      const refs = [
        ...[...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]),
        ...[...html.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]),
        // Absolute self-links in <meta content> (og:image) must exist once deployed.
        ...[...html.matchAll(/\scontent="https:\/\/lyniago\.com(\/[^"]*)"/g)].map((m) => m[1]),
      ];
      for (const ref of refs) {
        if (/^(https?:|tel:|mailto:)/.test(ref) || ref === "#") continue;
        const [path, hash] = ref.split("#");
        const onHome = path === "" ? page === "index.html" : path === "/";
        if (hash !== undefined && onHome) {
          if (!ids.has(hash)) fail(`${page}: link "${ref}" points at a missing id on the home page.`);
          continue;
        }
        if (path === "") {
          fail(`${page}: "${ref}" is a same-page anchor on a page without that id.`);
          continue;
        }
        if (INTENTIONAL_404.has(path) || WORKER_ROUTES.has(path)) continue;
        const target = path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(posix.dirname(page), path));
        if (!files.has(target === "" ? "index.html" : target)) fail(`${page}: "${ref}" does not resolve to a file in the site.`);
      }
    }
  }

  // ------------------------------------------------------------ 5. immutable assets
  function checkImmutableAssets() {
    if (!baseRef) return;
    let out;
    try {
      // execFileSync (no shell): the ref reaches git as one literal argument.
      out = execFileSync("git", ["diff", "--name-status", `${baseRef}...HEAD`, "--", `${SITE_REL}/assets/`], {
        cwd: root,
        encoding: "utf8",
      });
    } catch (e) {
      fail(`could not diff ${SITE_REL}/assets against ${baseRef}: ${e.message}`);
      return;
    }
    for (const line of out.trim().split("\n").filter(Boolean)) {
      const [status, path] = line.split("\t");
      if (status.startsWith("M") || status.startsWith("T")) {
        fail(
          `${path} was changed in place, but site/assets/* is served with a one-year immutable cache, so returning ` +
            "visitors would never see the change. Give the new version a new file name and update the references.",
        );
      }
    }
  }

  // ------------------------------------------------------------ 6. cache rules never match a missing path
  function checkCacheRules() {
    const path = join(SITE, "_headers");
    if (!ASSET_RULES.test(read(path))) {
      fail(`${SITE_REL}/_headers has no "# BEGIN immutable assets" … "# END immutable assets" block.`);
      return;
    }
    const assets = walk(join(SITE, "assets")).map((f) => `assets/${f}`);
    for (const f of assets) {
      // A _headers path treats `*` as a splat and `:name` as a placeholder, either of which would
      // also match paths that do not exist.
      if (!/^[A-Za-z0-9._/-]+$/.test(f)) fail(`${SITE_REL}/${f}: an asset name may only use letters, digits, ".", "_", "-" and "/".`);
    }
    const want = assetCacheRules(assets);
    if (write) writeFileSync(path, read(path).replace(ASSET_RULES, (_, a, __, b) => `${a}${want}${b}`));
    if (read(path).match(ASSET_RULES)[2] !== want) {
      fail(
        `${SITE_REL}/_headers: the immutable asset rules do not match the files in site/assets/. ` +
          "Run: node scripts/check-website.mjs --write",
      );
    }
    const rules = parseHeaders(read(path));
    for (const rule of rules) {
      if (/[*:]/.test(rule.path) && rule.headers.some((h) => /^cache-control\s*:/i.test(h))) {
        fail(
          `${SITE_REL}/_headers: "${rule.path}" sets Cache-Control with a wildcard. _headers matches by path, not ` +
            "status, so the 404 page served at a missing path would get it too and be cached at the edge. Give " +
            "each file its own exact rule.",
        );
      }
    }
    if (rules.length > MAX_HEADER_RULES) {
      fail(`${SITE_REL}/_headers has ${rules.length} rules; Cloudflare allows at most ${MAX_HEADER_RULES}.`);
    }
  }

  try {
    checkParity();
    check404();
    checkCsp();
    checkReferences();
    checkImmutableAssets();
    checkCacheRules();
  } catch (e) {
    fail(e.message);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const errors = checkWebsite({ write: process.argv.includes("--write"), baseRef: process.env.BASE_REF || "" });
  if (errors.length) {
    for (const e of errors) console.error(`::error::check-website: ${e}`);
    process.exit(1);
  }
  console.log(
    `check-website: OK — ${SITE_REL} matches the handoff (${LAUNCH_EDITS.length} launch edits), 404.html and CSP ` +
      "hashes are current, all references resolve, every asset has its own cache rule.",
  );
}
