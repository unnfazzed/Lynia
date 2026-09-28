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
 *
 * Usage:
 *   node scripts/check-website.mjs           check (CI)
 *   node scripts/check-website.mjs --write   regenerate site/404.html and the CSP hashes, then check
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
    decision: "owner 2026-09-28: Privacy links to the live privacy notice; Terms stays # (D-42)",
    from: '<a href="#">Privacy</a>',
    to: '<a href="https://api.lyniago.com/legal/privacy">Privacy</a>',
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
]);

/** Paths linked on purpose that have no page yet, so they serve 404.html (D-42). */
const INTENTIONAL_404 = new Set(["/about"]);

/**
 * Every <script> element: group 1 = attributes, group 2 = text. Case-insensitive, and lenient about
 * attributes and the end tag (browsers end a script at `</script foo>` too), so a script written any
 * way a browser runs it is seen by the CSP check.
 */
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi;

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
        if (INTENTIONAL_404.has(path)) continue;
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

  try {
    checkParity();
    check404();
    checkCsp();
    checkReferences();
    checkImmutableAssets();
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
    `check-website: OK — ${SITE_REL} matches the handoff (${LAUNCH_EDITS.length} launch edit), 404.html and CSP ` +
      "hashes are current, all references resolve.",
  );
}
