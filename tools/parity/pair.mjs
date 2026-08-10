#!/usr/bin/env node
/**
 * The capstone driver: for a set of screen keys, render the DESIGN MOCK and the APP side, then compose
 * one side-by-side parity sheet (HTML + PNG). This is what a PR attaches — the reviewer approves the
 * picture, not the prose.
 *
 *   node pair.mjs --keys LJ.force_update,LJ.splash --out out/sheet-boot
 *   node pair.mjs --category admin --out out/sheet-admin
 *   node pair.mjs --wired --out out/sheet-wired          # only screens with an app target
 *
 * One design server + one browser are shared across every screen and both render paths.
 */
import { startDesignServer } from "./lib/design-server.mjs";
import { launch } from "./lib/browser.mjs";
import { renderMock, renderDesignPage } from "./lib/mock.mjs";
import { renderMobile } from "./lib/mobile.mjs";
import { renderWeb } from "./lib/web.mjs";
import { buildSheet } from "./lib/sheet.mjs";
import { getScreens, getScreen } from "./screens.mjs";
import { parseArgs } from "./lib/args.mjs";

const MODE_TO_LOGICAL_W = { phone: 360, phone320: 320, tablet: 1024, admin: 720 };

async function selectScreens(a) {
  if (a.keys) {
    const out = [];
    for (const k of String(a.keys).split(",").map((s) => s.trim()).filter(Boolean)) {
      const s = await getScreen(k);
      if (!s) throw new Error(`unknown screen key: ${k}`);
      out.push(s);
    }
    return out;
  }
  if (a.category) return getScreens({ category: a.category });
  if (a.wired) return getScreens({ wired: true });
  throw new Error("select screens with --keys a,b / --category <name> / --wired");
}

/** Render the app side for a screen per its app-target. Returns { path } | { pending, note }. */
async function renderApp(screen, shared, outDir) {
  const app = screen.app;
  if (!app) return { pending: true, note: "no app target — add one in app-targets.mjs" };
  const out = `${outDir}/app-${screen.key.replace(/[^\w.-]/g, "_")}.png`;
  if (app.kind === "mobile") {
    const r = await renderMobile({ browser: shared.browser, component: app.component, fixture: app.fixture, mode: app.mode || "phone", out });
    return r.ok ? { path: out } : { pending: true, note: `mobile render failed: ${r.error?.slice(0, 140)}` };
  }
  if (app.kind === "web") {
    const r = await renderWeb({ browser: shared.browser, app: app.app, route: app.route, mode: app.mode, waitFor: app.waitFor, out });
    return r.ok ? { path: out } : { pending: true, note: r.error?.slice(0, 160) || "web render unavailable" };
  }
  return { pending: true, note: `unknown app kind: ${app.kind}` };
}

const a = parseArgs(process.argv.slice(2));
const outBase = a.out || "out/sheet";
const screens = await selectScreens(a);

const server = await startDesignServer();
const browser = await launch();
const shared = { origin: server.origin, browser };
const outDir = outBase + "-parts";
const rows = [];
try {
  for (const s of screens) {
    const mockOut = `${outDir}/mock-${s.key.replace(/[^\w.-]/g, "_")}.png`;
    // Admin designs are standalone kit pages (ui_kits/admin/<page>.html), not gallery-registry
    // screens, so render the page directly; everything else renders through the screen harness.
    const mock =
      s.src === "ADMIN"
        ? await renderDesignPage({ origin: server.origin, browser, path: `/ui_kits/admin/${s.id}`, w: 1440, h: 900, out: mockOut }).catch((e) => ({ ok: false, error: String(e) }))
        : await renderMock({ origin: server.origin, browser, src: s.src, id: s.id, mode: s.mode, out: mockOut }).catch((e) => ({ ok: false, error: String(e) }));
    const app = await renderApp(s, shared, outDir);
    rows.push({
      label: `${s.key}`,
      sub: s.title,
      status: s.app ? "review" : "todo",
      mock: mock.ok ? mockOut : undefined,
      app: app.path,
      appNote: app.pending ? app.note : undefined,
      logicalW: MODE_TO_LOGICAL_W[s.mode] || 360,
    });
    console.log(`${s.key}: mock ${mock.ok ? "ok" : "MISS"} · app ${app.path ? "ok" : "pending"}`);
  }
  const res = await buildSheet({ title: a.title || `Parity sheet — ${screens.length} screen(s)`, rows, out: outBase, browser });
  console.log(JSON.stringify({ ok: true, html: res.htmlPath, png: res.pngPath, screens: screens.length }));
} finally {
  await browser.close();
  await server.close();
}
