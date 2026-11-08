// lyniago.com/s/<name>-<CODE>: a shop's share link (plan docs/plans/2026-11-07-shop-share-links.md, handoff
// packages/design/handoff/shop-share-v1/ README §2 + §4, ledger D-129). A restaurant, shop or pharmacy, or a
// customer, shares it; whoever taps it lands here.
//
//   /s/<name>-<CODE>           the landing (SH-W1a/W1b Android, W2 Android without Play, W3 iPhone, W4 desktop,
//                              W5/W4b dead code, W6 no photo). A bare code, an old name or a made-up name
//                              301s to the shop's current link. Only the code picks the shop.
//   /s/<CODE>/card.jpg         the WhatsApp preview image (SH-W7), drawn by the API, edge-cached for a day.
//   /s/<CODE>/qr.svg           the desktop landing's QR.
//
// Before sign-in only a live shop's name, logo and cover are public (DR16): that is all GET /share/:code/card
// returns, and an unknown, paused or not-live code answers 404 like a code that never existed (R6). The page then
// names no shop. The API being down renders that same page and still routes (never a 5xx).
//
// The link's shape is packages/shared/src/shop-link.ts's; this Worker can't import that package, so the code
// reading is copied here and both sides' tests pin the same examples.

import { platformOf } from "./download.js";
import { CODE_ALPHABET } from "./referral.js";

const CODE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);
const PATH = /^\/s\/([^/]+)(?:\/(card\.jpg|qr\.svg))?\/?$/;
export const API_ORIGIN = "https://api.lyniago.com";
const PACKAGE = "zw.co.lynia";
const PLAY = `https://play.google.com/store/apps/details?id=${PACKAGE}`;
export const WEB_APP = "https://app.lyniago.com";
export const HELP = "https://wa.me/263778831938";

/** SH.web / SH.og from the handoff's copy.ts, verbatim (website copy; the apps import the TS file). */
export const COPY = {
  web: {
    pageTitle: "{shop} on LyniaGo",
    line: "Order on LyniaGo. Delivered by bike in Harare.",
    openApp: "Open in LyniaGo",
    opening: "Opening LyniaGo…",
    stalled: "Didn’t open? Tap Open in LyniaGo.",
    orderWeb: "Order on the web",
    havePlay: "Have Google Play? Open in LyniaGo",
    help: "Help on WhatsApp",
    scan: "Scan to order on your phone",
    scanSub: "Open your phone camera and point it at the code.",
    orLink: "Or open this link on your phone",
    copyLink: "Copy link",
    copied: "Copied",
    deadT: "This shop isn’t on LyniaGo right now",
    deadS: "Food, shops and pharmacy, delivered by bike.",
    deadApp: "Open LyniaGo",
    deadWeb: "Go to LyniaGo",
    footer: "© 2026 LyniaGo",
  },
  og: {
    title: "{shop} on LyniaGo",
    desc: "Order from {shop} on LyniaGo. Delivered by bike in Harare.",
    genericTitle: "LyniaGo",
    genericDesc: "Food, shops and pharmacy, delivered by bike",
    imgAlt: "{shop} on LyniaGo",
    genericAlt: "LyniaGo",
  },
};

export function isShopPath(pathname) {
  return PATH.test(pathname);
}

/** The code in a shop link's last segment (`chicken-inn-avondale-7KQ2MX`, `7kq2mx`): what follows the last dash. */
export function shopCodeOf(segment) {
  let s;
  try {
    s = decodeURIComponent(segment).trim();
  } catch {
    return null;
  }
  const code = s.slice(s.lastIndexOf("-") + 1).toUpperCase();
  return CODE.test(code) ? code : null;
}

/** The Play link for a shop code: the code rides in the install referrer (shopInstallReferrer in shop-link.ts). */
export function shopPlayUrl(code) {
  if (!code) return PLAY;
  const referrer = `utm_source=lyniago.com&utm_medium=shop_share&utm_campaign=shop_share&utm_content=${code}`;
  return `${PLAY}&referrer=${encodeURIComponent(referrer)}`;
}

/** E1: open the installed app on the shop, or fall back to Play with the code in the referrer. */
export function intentUrl(code) {
  const path = code ? `s/${code}` : "";
  return `intent://${path}#Intent;scheme=lynia;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(shopPlayUrl(code))};end`;
}

/** Android phones sold without Google Play (Huawei/Honor HMS builds): the intent would dead-end, so W2. */
export function hasNoPlay(userAgent) {
  return /HuaweiBrowser|HMSCore|HarmonyOS|HONORBrowser/i.test(userAgent || "");
}

export async function shopResponse(request, env, ctx) {
  const url = new URL(request.url);
  const [, segment, asset] = PATH.exec(url.pathname);
  const code = shopCodeOf(segment);
  const api = (env && env.API_ORIGIN) || API_ORIGIN;
  if (asset === "card.jpg") return cardImage(request, env, api, code);
  if (asset === "qr.svg") return qrImage(api, code);

  const shop = code ? await fetchCard(api, code) : null;
  if (shop) {
    // Canonical-name redirect: only the code picks the shop; the name part follows the shop's current name.
    const canonical = new URL(shop.link).pathname;
    if (url.pathname !== canonical) {
      return new Response(null, {
        status: 301,
        headers: { location: new URL(canonical + url.search, url).toString(), "cache-control": "private, no-store" },
      });
    }
  }
  const ua = request.headers.get("user-agent") || "";
  const platform = platformOf(ua);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = landingHtml({ shop, code: shop ? code : null, platform, noPlay: platform === "android" && hasNoPlay(ua), nonce });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // The page differs by device and the shop can pause: no shared cache keeps one visitor's answer.
      "cache-control": "private, no-store",
      vary: "User-Agent",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy": [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "font-src 'self'",
        "img-src 'self' https: data:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

/** GET /share/:code/card, edge-cached 5 min so a link shared to a big group costs the API one call. Null on any miss. */
async function fetchCard(api, code) {
  try {
    const res = await fetch(`${api}/share/${code}/card`, {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body && typeof body.name === "string" && typeof body.link === "string" ? body : null;
  } catch {
    return null;
  }
}

async function cardImage(request, env, api, code) {
  try {
    const res = await fetch(`${api}/share/${code ?? "-"}/card.jpg`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
      });
    }
  } catch {
    // fall through to the site's own preview image
  }
  const fallback = await env.ASSETS.fetch(new Request(new URL("/assets/og-image.png", request.url)));
  return new Response(fallback.body, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "public, max-age=600", "x-content-type-options": "nosniff" },
  });
}

async function qrImage(api, code) {
  try {
    const res = await fetch(`${api}/share/${code ?? "-"}/qr.svg`, {
      cf: { cacheTtl: 3600, cacheEverything: true },
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml",
          "cache-control": "public, max-age=3600",
          "content-security-policy": "default-src 'none'",
          "x-content-type-options": "nosniff",
        },
      });
    }
  } catch {
    // the page's <img> hides itself; the link and Copy link still work
  }
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

// ---------------------------------------------------------------------------------------------------- the page

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fill = (t, shop) => t.replace("{shop}", shop);

/** No-photo tints (README §4): the cover band by section; the logo disc as Browse v2 draws it. */
const BAND = { shops: "#DDD5FF", restaurants: "#FFD9CC", pharmacy: "#C5E9DF" };
const LOGO_TINT = { shops: ["#F6F7F8", "#14181B"], restaurants: ["#FFD9CC", "#14181B"], pharmacy: ["#DFF4EE", "#006630"] };

const ICON = {
  play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  globe:
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
  copy: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
};

function initialOf(name) {
  const m = /[\p{L}\p{N}]/u.exec(name);
  return m ? m[0].toUpperCase() : "?";
}

function cover(shop, h) {
  if (!shop) return `<div class="cover dead" style="--h:${h}"><span class="c c1"></span><span class="c c2"></span></div>`;
  if (shop.coverThumbUrl) return `<div class="cover" style="--h:${h}"><img src="${esc(shop.coverThumbUrl)}" alt=""></div>`;
  return `<div class="cover" style="--h:${h};background:${BAND[shop.service] || BAND.shops}"><span class="c c1"></span><span class="c c2"></span><span class="c c3"></span></div>`;
}

function logo(shop) {
  if (!shop) return `<span class="logo"><img src="/assets/brand/lyniago-mark.svg" alt="" class="mk"></span>`;
  if (shop.logoThumbUrl) return `<span class="logo"><img src="${esc(shop.logoThumbUrl)}" alt=""></span>`;
  const [bg, ink] = LOGO_TINT[shop.service] || LOGO_TINT.shops;
  return `<span class="logo ini" style="background:${bg};color:${ink}">${esc(initialOf(shop.name))}</span>`;
}

export function landingHtml({ shop, code, platform, noPlay, nonce }) {
  const W = COPY.web;
  const name = shop ? shop.name : null;
  const link = shop ? shop.link : "https://lyniago.com";
  const shortLink = link.replace(/^https:\/\//, "");
  const title = name ? fill(W.pageTitle, name) : COPY.og.genericTitle;
  const ogTitle = name ? fill(COPY.og.title, name) : COPY.og.genericTitle;
  const ogDesc = name ? fill(COPY.og.desc, name) : COPY.og.genericDesc;
  const ogAlt = name ? fill(COPY.og.imgAlt, name) : COPY.og.genericAlt;
  const cardUrl = `https://lyniago.com/s/${code || "-"}/card.jpg`;
  const webApp = code ? `${WEB_APP}/s/${code}` : WEB_APP;

  // Buttons per device (README §2 "Signed out", SH-W1–W5).
  let status = "";
  let primary;
  let secondary;
  let fireIntent = false;
  if (platform === "android" && !noPlay) {
    fireIntent = true;
    status = `<div class="status" id="st" role="status" data-stalled="${esc(W.stalled)}"><span class="spin" aria-hidden="true"></span><span>${esc(W.opening)}</span></div>`;
    primary = `<a class="btn" id="open" href="${esc(intentUrl(code))}">${ICON.play}${esc(shop ? W.openApp : W.deadApp)}</a>`;
    secondary = shop ? `<a class="lnk" href="${esc(webApp)}">${esc(W.orderWeb)}</a>` : `<a class="lnk" href="${HELP}">${esc(W.help)}</a>`;
  } else if (platform === "android") {
    primary = `<a class="btn" href="${esc(webApp)}">${ICON.globe}${esc(shop ? W.orderWeb : W.deadWeb)}</a>`;
    secondary = `<a class="lnk" href="${esc(intentUrl(code))}">${esc(W.havePlay)}</a>`;
  } else {
    primary = `<a class="btn" href="${esc(webApp)}">${ICON.globe}${esc(shop ? W.orderWeb : W.deadWeb)}</a>`;
    secondary = `<a class="lnk" href="${HELP}">${esc(W.help)}</a>`;
  }

  const desktop = platform === "desktop";
  const heading = name ? esc(name) : esc(W.deadT);
  const line = esc(name ? W.line : W.deadS);

  const mobileBody = `<main class="m"><span class="c b1"></span><span class="c b2"></span><span class="c b3"></span>
<div class="card">${cover(shop, "auto")}<div class="lw">${logo(shop)}</div>
<div class="body"><h1 class="${shop ? "" : "dead"}">${heading}</h1><p>${line}</p>
<div class="acts">${status}${primary}${secondary}</div></div></div></main>`;

  const desktopBody = `<main class="d"><span class="c b1"></span><span class="c b2"></span><span class="c b3"></span>
<div class="wrap"><div class="left">${cover(shop, "200px")}<div class="lw">${logo(shop)}</div>
<div class="body"><h1>${heading}</h1><p>${line}</p></div></div>
<div class="right"><img class="qr" src="/s/${code || "-"}/qr.svg" alt="" width="260" height="260" id="qr">
<h2>${esc(W.scan)}</h2><p>${esc(W.scanSub)}</p><hr><div class="or">${esc(W.orLink)}</div>
<div class="field"><span class="url">${esc(shortLink)}</span><button type="button" id="copy" data-link="${esc(link)}" data-copy="${esc(W.copyLink)}" data-copied="${esc(W.copied)}">${ICON.copy}<span>${esc(W.copyLink)}</span></button></div></div></div></main>`;

  const script = desktop
    ? `document.getElementById("qr").addEventListener("error",function(){this.style.visibility="hidden"});
var b=document.getElementById("copy");b.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.link).then(function(){b.lastChild.textContent=b.dataset.copied;setTimeout(function(){b.lastChild.textContent=b.dataset.copy},2000)})});`
    : fireIntent
      ? `var u=document.getElementById("open").href,st=document.getElementById("st");
setTimeout(function(){location.href=u},300);
setTimeout(function(){if(document.visibilityState==="visible"){st.className="status stalled";st.textContent=st.dataset.stalled}},3000);`
      : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#00B14F">
<link rel="icon" href="/assets/brand/lyniago-mark.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="LyniaGo">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${esc(link)}">
<meta property="og:image" content="${esc(cardUrl)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<style nonce="${nonce}">${CSS}</style></head>
<body><nav><div class="in"><a class="brand" href="/"><img src="/assets/brand/lyniago-mark.svg" alt="" width="30" height="30">LyniaGo</a>${desktop ? `<a class="help" href="${HELP}">${esc(W.help)}</a>` : ""}</div></nav>
${desktop ? desktopBody : mobileBody}
${script ? `<script nonce="${nonce}">${script}</script>` : ""}
</body></html>`;
}

// Website tokens (site/index.html :root) and README §4 "Landing" sizes.
const CSS = `@font-face{font-family:"Inter";font-weight:400;font-display:swap;src:url("/assets/fonts/inter-400.woff2") format("woff2")}
@font-face{font-family:"Inter";font-weight:600;font-display:swap;src:url("/assets/fonts/inter-600.woff2") format("woff2")}
@font-face{font-family:"Inter";font-weight:700;font-display:swap;src:url("/assets/fonts/inter-700.woff2") format("woff2")}
@font-face{font-family:"Fredoka";font-weight:600;font-display:swap;src:url("/assets/fonts/fredoka-600.woff2") format("woff2")}
*{box-sizing:border-box;margin:0;padding:0}
:root{--g:#00B14F;--gd:#006630;--gx:#063B22;--mint:#E9F8EF;--ink:#14181B;--mut:#5B6670;--yel:#FFD23F;--coral:#FF6B4A;--vio:#4B2FBF;--sky:#3EC1F3;--pink:#FF8AC5}
html,body{min-height:100%}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--g);-webkit-font-smoothing:antialiased;overflow-x:hidden;display:flex;flex-direction:column;min-height:100vh}
nav{height:64px;flex:none;background:#fff;border-bottom:1px solid #EEF0F2}
nav .in{height:100%;display:flex;align-items:center;padding:0 20px;max-width:1160px;margin:0 auto}
.brand{display:flex;align-items:center;gap:8px;font:600 22px/1 Fredoka,Inter,sans-serif;letter-spacing:-.01em;color:var(--ink);text-decoration:none;margin-right:auto}
.help{font:600 15px Inter,sans-serif;color:var(--gd);text-decoration:none}
main{flex:1;position:relative;overflow:hidden}
.c{position:absolute;border-radius:50%;display:block}
h1{letter-spacing:-.035em;line-height:1.05;font-weight:700;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card,.left,.right{background:#fff;position:relative;z-index:1;overflow:hidden}
.cover{height:var(--h);position:relative;overflow:hidden;background:#eee}
.cover img{width:100%;height:100%;object-fit:cover;display:block}
.cover.dead{background:var(--mint)}
.cover .c1{width:120px;height:120px;background:var(--yel);right:-36px;top:-50px}
.cover .c2{width:20px;height:20px;background:var(--coral);right:90px;top:64px}
.cover .c3{width:12px;height:12px;background:var(--sky);right:30px;top:84px}
.lw{position:relative}
.logo{border-radius:50%;border:4px solid #fff;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:700}
.logo img{width:100%;height:100%;object-fit:cover;display:block}
.logo img.mk{width:57%;height:57%;object-fit:contain}
.body p{color:var(--mut);text-wrap:pretty}
.m{padding:24px 20px}
.m .b1{width:220px;height:220px;background:var(--yel);right:-90px;top:-70px}
.m .b2{width:120px;height:120px;background:var(--coral);left:-50px;bottom:-30px}
.m .b3{width:16px;height:16px;background:var(--pink);right:30px;bottom:110px}
.m .card{border-radius:28px;max-width:440px;margin:0 auto}
.m .cover{aspect-ratio:3/1}
.m .lw{padding:0 20px;margin-top:-42px}
.m .logo{width:84px;height:84px;font-size:34px}
.m .body{padding:12px 20px 20px}
.m h1{font-size:30px}
.m h1.dead{font-size:24px}
.m .body p{margin-top:8px;font-size:15px;line-height:1.45}
.acts{margin-top:18px;display:flex;flex-direction:column;gap:6px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;padding:0 22px;border-radius:999px;font:600 16px/1.2 Inter,sans-serif;text-align:center;background:var(--yel);color:var(--ink);text-decoration:none}
.lnk{min-height:44px;display:flex;align-items:center;justify-content:center;font:600 15px Inter,sans-serif;color:var(--gd);text-decoration:underline;text-underline-offset:3px;text-align:center}
.status{display:flex;align-items:center;justify-content:center;gap:8px;min-height:24px;font-size:14px;color:var(--mut);margin-bottom:6px;text-align:center}
.status.stalled{color:var(--ink)}
.spin{width:16px;height:16px;border-radius:50%;border:2px solid #DDE2E6;border-top-color:var(--g);animation:sp .8s linear infinite;flex:none}
@keyframes sp{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}
@media (max-width:359px){.m{padding:20px}.m h1{font-size:26px}}
.d .b1{width:420px;height:420px;background:var(--yel);right:-120px;top:-160px}
.d .b2{width:220px;height:220px;background:var(--coral);left:-80px;bottom:-90px}
.d .b3{width:22px;height:22px;background:var(--pink);left:46%;bottom:60px}
.wrap{max-width:1160px;margin:0 auto;padding:64px 32px;display:flex;gap:32px;align-items:stretch;position:relative}
.left{flex:1.25;border-radius:40px}
.left .cover .c1{width:200px;height:200px;right:-60px;top:-90px}
.left .lw{padding:0 40px;margin-top:-60px}
.left .logo{width:120px;height:120px;border-width:6px;font-size:48px}
.left .body{padding:18px 40px 40px}
.left h1{font-size:52px}
.left .body p{margin-top:16px;font-size:20px}
.right{flex:1;border-radius:40px;padding:40px;display:flex;flex-direction:column;align-items:center;text-align:center}
.qr{width:260px;height:260px}
.right h2{font-size:32px;font-weight:700;letter-spacing:-.035em;line-height:1.05;margin-top:24px}
.right p{margin-top:10px;font-size:16px;color:var(--mut);max-width:30ch}
.right hr{width:100%;border:0;height:1px;background:#EEF0F2;margin:28px 0 20px}
.or{font-size:14px;color:var(--mut)}
.field{margin-top:10px;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 20px;border-radius:999px;border:1px solid #EEF0F2;width:100%}
.url{flex:1;min-width:0;text-align:left;font:600 16px ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#copy{height:44px;padding:0 20px;border-radius:999px;border:0;background:var(--ink);color:#fff;display:flex;align-items:center;gap:8px;font:600 15px Inter,sans-serif;cursor:pointer;flex:none}`;
