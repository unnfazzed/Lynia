#!/usr/bin/env node
/**
 * Own bikers v1's console sheet (ledger D-117, lane D): each admin frame of the handoff (OB-A1–A4 and the fleets
 * table's loading / empty / error / offline, `packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html`)
 * beside the console in the same state, at 1440×900.
 *
 * The console reads the API from its server, so this script runs a small stub API itself (the handoff's one data set:
 * Pizza Inn, Chicken Inn with 4 bikers, Mama's Kitchen) and switches it per frame (empty, error, slow, down):
 *
 *   API_BASE_URL=http://127.0.0.1:4399 node tools/parity/serve-web.mjs admin
 *   node tools/parity/shoot-own-bikers-v1-admin.mjs --out docs/parity/OWN-BIKERS-V1-ADMIN-2026-10-20
 */
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const ORIGIN = process.env.PARITY_ADMIN_URL || "http://127.0.0.1:4311";
const STUB_PORT = Number(process.env.PARITY_ADMIN_STUB_PORT || 4399);
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : join(HERE, "out/own-bikers-v1-admin"));
const SHOTS = `${OUT}-shots`;
const MOCKS = `${pathToFileURL(join(REPO, "packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html")).href}?s=all`;
const DESK = { width: 1440, height: 900 };

// ── The handoff's data set ────────────────────────────────────────────────────────────────────────────────────────
const PIZZA = "11111111-1111-4111-8111-111111111111";
const CHICKEN = "22222222-2222-4222-8222-222222222222";
const MAMAS = "33333333-3333-4333-8333-333333333333";
const AVONDALE = "44444444-4444-4444-8444-444444444444";
const BORROWDALE = "55555555-5555-4555-8555-555555555555";
const ROWS = [
  {
    ownerProfileId: PIZZA,
    owner: "Tafadzwa Moyo",
    branches: 3,
    branchNames: ["Pizza Inn Belgravia", "Pizza Inn Eastgate", "Pizza Inn Mt Pleasant"],
    bikers: 9,
    online: 6,
    thisWeek: "42.00",
    unpaid: "81.00",
    daysOverdue: 9,
    status: "overdue",
    rideFee: "1.50",
  },
  {
    ownerProfileId: CHICKEN,
    owner: "Rumbi Chari",
    branches: 2,
    branchNames: ["Chicken Inn Avondale", "Chicken Inn Borrowdale"],
    bikers: 4,
    online: 2,
    thisWeek: "34.50",
    unpaid: "36.00",
    daysOverdue: 2,
    status: "overdue",
    rideFee: "1.50",
  },
  { ownerProfileId: MAMAS, owner: "Nyasha Dube", branches: 1, branchNames: ["Mama's Kitchen"], bikers: 6, online: 6, thisWeek: "21.00", unpaid: "0.00", daysOverdue: 0, status: "paid", rideFee: "1.50" },
];
const bill = (n, start, end, due, total, state, daysOverdue, rides) => ({
  id: `88888888-8888-4888-8888-88888888888${n}`,
  periodStart: start,
  periodEnd: end,
  dueOn: due,
  total,
  state,
  daysOverdue,
  paidAt: state === "paid" ? "2026-09-24T10:00:00.000Z" : null,
  branches: [{ merchantId: AVONDALE, name: "Chicken Inn Avondale", rides, total }],
});
const DETAIL = {
  ownerProfileId: CHICKEN,
  owner: "Rumbi Chari",
  phone: "+263772000111",
  enabled: true,
  paused: false,
  rideFee: "1.50",
  branches: [
    { merchantId: AVONDALE, name: "Chicken Inn Avondale" },
    { merchantId: BORROWDALE, name: "Chicken Inn Borrowdale" },
  ],
  bikers: [
    { riderId: "77777777-7777-4777-8777-777777777771", name: "Tendai Moyo", homeBranch: "Chicken Inn Avondale", state: "on_a_job" },
    { riderId: "77777777-7777-4777-8777-777777777772", name: "Farai N", homeBranch: "Chicken Inn Avondale", state: "online" },
    { riderId: "77777777-7777-4777-8777-777777777773", name: "Nyasha K", homeBranch: "Chicken Inn Avondale", state: "offline" },
    { riderId: "77777777-7777-4777-8777-777777777774", name: "Blessing T", homeBranch: "Chicken Inn Borrowdale", state: "offline" },
  ],
  thisWeek: { rides: 4, total: "6.00" },
  bills: [
    bill(1, "2026-09-28", "2026-10-04", "2026-10-09", "34.50", "unpaid", 0, 23),
    bill(2, "2026-09-21", "2026-09-27", "2026-10-02", "36.00", "overdue", 2, 24),
    bill(3, "2026-09-14", "2026-09-20", "2026-09-25", "33.00", "paid", 0, 22),
  ],
  recentRides: [{ orderId: "66666666-6666-4666-8666-666666666666", ref: "#B190", merchantId: AVONDALE, biker: "Tendai", at: "2026-10-04T08:05:00.000Z", fee: "1.50" }],
};
const OVERVIEW = {
  ordersByStatus: { open_for_offers: 12, assigned: 30, en_route_dropoff: 18 },
  riders: { total: 180, online: 138, verified: 160 },
  metrics: { totalBroadcasts: 412, offersPerBroadcast: 2.4, pctBroadcastsWithOffer: 91, expiryRatePct: 6 },
  today: { completed: 412, completionRatePct: 94, fares: "1284.50" },
  attention: { kycPending: 0, openIssues: 7, stuckOrders: 0, stuckOrderId: null },
  commissionRatePct: 10,
  recentOrders: [],
};
const ALERTS = { sosPending: 0, topupAnomalies: 0, kitchenConfirmations: 0, merchantApplications: 0, ordersBreaching: 0, ownBikers: { fleets: 3, bikersOnline: 14, overdueBills: 3, overdueFleets: 2 } };

// ── The stub API ──────────────────────────────────────────────────────────────────────────────────────────────────
/** "live" | "empty" | "error" | "slow" | "down": how /admin/fleets answers. */
let mode = "live";
const stub = createServer((req, res) => {
  const path = (req.url || "").split("?")[0];
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (path === "/admin/fleets") {
    if (mode === "down") return req.socket.destroy();
    if (mode === "error") return json(500, { statusCode: 500, message: "boom" });
    if (mode === "empty") return json(200, []);
    if (mode === "slow") return setTimeout(() => json(200, ROWS), 20_000);
    return json(200, ROWS);
  }
  if (path.startsWith("/admin/fleets/")) return json(200, DETAIL);
  if (path === "/admin/alerts") return json(200, ALERTS);
  if (path === "/admin/nav-counts") return json(200, { kycPending: 0, openIssues: 7, sosPending: 0, foodDisputes: 0 });
  if (path === "/admin/overview") return json(200, OVERVIEW);
  return json(404, { statusCode: 404, message: `Cannot GET ${path}` });
});
await new Promise((r) => stub.listen(STUB_PORT, "127.0.0.1", r));

// ── Frames ────────────────────────────────────────────────────────────────────────────────────────────────────────
const click = (name) => async (p) => {
  await p.getByRole("button", { name, exact: true }).first().click();
  await p.waitForTimeout(500);
};
const confirmFill = (name, reason, note) => async (p) => {
  await click(name)(p);
  await p.getByRole("radio", { name: reason }).check();
  await p.getByLabel("Note for the audit log").fill(note);
  await p.waitForTimeout(300);
};
const NOTE = "21–27 Sep bill 2 days overdue; owner not answering WhatsApp.";
const ROWS_ = [
  ["OB-A1 Fleets table", { path: "/own-bikers" }],
  ["OB-A2 Side panel", { path: `/own-bikers?owner=${CHICKEN}` }],
  [
    "OB-A2 Side panel · adjust",
    {
      path: `/own-bikers?owner=${CHICKEN}`,
      before: async (p) => {
        await click("Adjust")(p);
        await p.getByLabel("Amount").fill("−1.50");
        await p.getByLabel("Reason (required)").fill("Wrong fee charged on a cancelled ride");
      },
    },
  ],
  ["OB-A3 Pause confirm", { path: `/own-bikers?owner=${CHICKEN}`, before: confirmFill("Pause", "NON_PAYMENT · bill overdue", NOTE) }],
  ["OB-A3 Disable confirm", { path: `/own-bikers?owner=${CHICKEN}`, before: confirmFill("Disable", "NON_PAYMENT · bill overdue", NOTE) }],
  ["OB-A4 Overview tile", { path: "/" }],
  ["Fleets · loading", { path: "/own-bikers", mode: "slow", loading: true }],
  ["Fleets · empty", { path: "/own-bikers", mode: "empty" }],
  ["Fleets · error", { path: "/own-bikers", mode: "error" }],
  ["Fleets · offline", { path: "/own-bikers", mode: "down" }],
];

async function shootApp(browser, name, a) {
  mode = a.mode || "live";
  const ctx = await browser.newContext(contextDefaults({ viewport: DESK, deviceScaleFactor: 1 }));
  const page = await ctx.newPage();
  try {
    if (a.loading) {
      await page.goto(`${ORIGIN}${a.path}`, { waitUntil: "commit", timeout: 60_000 });
      await page.waitForSelector(".skel", { timeout: 30_000 });
    } else {
      await page.goto(`${ORIGIN}${a.path}`, { waitUntil: "networkidle", timeout: 120_000 });
    }
    await page.waitForTimeout(600);
    if (a.before) await a.before(page);
    await page.waitForTimeout(400);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } catch (err) {
    console.error(`app ${name}: ${err.message}`);
    return null;
  } finally {
    await ctx.close();
    mode = "live";
  }
}

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 }));
const mpage = await mctx.newPage();
await mpage.goto(MOCKS, { waitUntil: "load" });
await mpage.waitForTimeout(1500);
const rows = [];
for (const [label, a] of ROWS_) {
  let mock = join(SHOTS, `mock-${rows.length}.png`);
  try {
    await mpage.locator(`[data-screen-label="${label}"]`).first().screenshot({ path: mock });
  } catch (err) {
    console.error(`mock ${label}: ${err.message}`);
    mock = null;
  }
  const shot = await shootApp(browser, String(rows.length), a);
  console.error(`${shot ? "ok" : "--"} ${label}`);
  rows.push({ label, mock, app: shot, logicalW: 720 });
}
await mctx.close();
await buildSheet({ title: "Own bikers v1 (D-117) · console: handoff (left) vs app (right), 1440×900", out: OUT, rows, browser });
await browser.close();
stub.close();
