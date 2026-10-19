#!/usr/bin/env node
/**
 * Own bikers v1's screenshot sheet (ledger D-117): each frame of the handoff
 * (packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html, one `data-screen-label` per frame) beside
 * the app in the same state, at 360×720 (and 320×640 where the handoff draws it). Set `merchant-roster` (default):
 * OB-M1–M7, the invite sheet and the roster's states (lane B, PR 1).
 *
 * The merchant API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend is needed:
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-own-bikers-v1.mjs --out docs/parity/OWN-BIKERS-V1-MERCHANT-ROSTER-2026-10-19
 *
 * The data is the handoff's one data set: Chicken Inn has 4 bikers (Tendai on a job holding $14.00, Farai and Nyasha
 * online, Blessing offline with 2 cancels), Kuda is the open invite.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/own-bikers-v1");
const SHOTS = `${OUT}-shots`;
const MOCKS = `${pathToFileURL(resolve("../../packages/design/handoff/own-bikers-v1/Own bikers v1 - all screens.html")).href}?s=all`;

const SESSION = { accessToken: "parity", refreshToken: "parity.refresh", expiresIn: 900, issuedAt: Date.now(), profileId: "p-parity", role: "customer" };
const ALL_DAY = { open: "08:00", close: "22:00" };
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };
const ME = {
  id: "m-parity",
  name: "Chicken Inn Avondale",
  ownerPhoneMasked: "+263•••••4567",
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Rumbi Moyo",
  hours: WEEK,
  autoAccept: false,
  businessType: "restaurant",
  shopKind: null,
  location: { point: { lat: -17.8, lng: 31.04 }, landmark: "Avondale shops", contactPhone: "+263771234567" },
};
const STAFF_ME = { ...ME, myRole: "staff", myName: "Kuda Dube" };

const now = Date.now();
const H = 3_600_000;
const ago = (ms) => new Date(now - ms).toISOString();
const biker = (id, name, homeBranch, state, over = {}) => ({
  riderId: `00000000-0000-4000-8000-00000000000${id}`,
  name,
  phone: "+263 77 410 2290",
  homeBranch,
  state,
  joinedAt: ago(30 * 24 * H),
  cashHeld: null,
  cancelsThisWeek: 0,
  ...over,
});
const TENDAI = biker(1, "Tendai M.", "Avondale", "on_a_job", { cashHeld: "14.00" });
const FARAI = biker(2, "Farai K.", "Avondale", "online");
const NYASHA = biker(3, "Nyasha T.", "Borrowdale", "online");
const BLESSING = biker(4, "Blessing N.", "Borrowdale", "offline", { cancelsThisWeek: 2 });
const BIKERS = [TENDAI, FARAI, NYASHA, BLESSING];
const invite = (id, name, state, sharedMs) => ({
  id: `00000000-0000-4000-8000-0000000001${id}`,
  name,
  phoneMasked: "•• 0192",
  state,
  homeBranch: "Avondale",
  sharedAt: ago(sharedMs),
  expiresAt: new Date(now + 5 * 24 * H).toISOString(),
});
const KUDA = invite("01", "Kuda", "signing_up", 48 * H);
const INV2 = [KUDA, invite("02", "Rufaro", "waiting_id_check", 5 * H), invite("03", "+263 77 123 4567", "not_opened", 1 * H), invite("04", "Simba", "expired", 9 * 24 * H)];
const fleet = (over = {}) => ({ enabled: true, paused: false, role: "owner", bikers: BIKERS, invites: [KUDA], suggestions: [], ...over });
const LINK = { invite: { ...KUDA, sharedAt: new Date(now).toISOString(), state: "not_opened" }, link: "https://lyniago.co.zw/j/K7Q2-M9", phone: "263775550192", alreadyInvited: false };
const BILLS = { thisWeek: { rides: 23, total: "34.50" }, bills: [{ id: "b1", periodStart: "2026-09-21", periodEnd: "2026-09-27", dueOn: "2026-10-02", total: "36.00", state: "overdue", daysOverdue: 2, paidAt: null, branches: [] }] };

function apiRoute(route, sc) {
  const req = route.request();
  const path = new URL(req.url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (sc.down) return route.abort(); // the connection dropped: every call (and the /healthz probe) fails
  if (path === "/merchant/me") return json(200, sc.me ?? ME);
  if (path === "/merchant/fleet") {
    if (sc.load === "hang") return undefined; // Loading: never answers
    if (sc.load === "fail") return json(500, { message: "" });
    return sc.fleet ? json(200, sc.fleet) : json(503, { message: "Own bikers isn't available yet." });
  }
  if (path === "/merchant/fleet/bills") return json(200, sc.bills ?? BILLS);
  if (path === "/merchant/fleet/invites" && req.method() === "POST") {
    if (sc.invite === "hang") return undefined;
    if (sc.invite === "fail") return json(500, {});
    if (sc.invite === "net") return route.abort();
    return json(200, sc.invite === "dup" ? { ...LINK, alreadyInvited: true, invite: KUDA } : LINK);
  }
  if (path === "/app/order-flags") return json(200, { rxEnabled: true, preferredRetired: sc.retired ?? false });
  if (path === "/merchant/team") return json(200, { members: [], invites: [{ id: "t1" }] });
  if (path === "/merchant/riders") return json(200, { riders: [], cap: 20 });
  if (path === "/merchant/branches") return json(200, { branches: [{ id: "a" }, { id: "b" }] });
  if (path === "/merchant/invites") return json(200, { invites: [] });
  if (path === "/auth/me") return json(200, { firstName: "Rumbi", lastName: "Moyo", phone: "+263771234567" });
  return json(200, []);
}

async function shootApp(browser, { name, w = 360, path = "/own-bikers", scenario, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: { width: w, height: w === 320 ? 640 : 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  const page = await ctx.newPage();
  try {
    await page.goto(`${ORIGIN}${path}`, { waitUntil: scenario.load === "hang" ? "domcontentloaded" : "networkidle", timeout: 90000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; } *, *::before, *::after { caret-color: transparent !important; animation-play-state: paused !important; }" });
    await page.waitForTimeout(scenario.load === "hang" ? 1500 : 800);
    if (before) await before(page);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(500);
    const file = join(SHOTS, `app-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  } catch (err) {
    console.error(`app ${name}: ${err.message}`);
    return null;
  } finally {
    await ctx.close();
  }
}

/** The offline frame's scenario, switched off once the roster has loaded. */
const ROWS_DOWN = { fleet: fleet(), down: false };
const openInvite = (p) => p.getByRole("button", { name: /Invite a biker/ }).last().click();
const fillInvite = (phone = "775550192", nm = "Kuda") => async (p) => {
  await openInvite(p);
  await p.getByLabel("Phone").fill(phone);
  await p.getByLabel("Name").fill(nm);
};
const getLink = (wait) => async (p) => {
  await fillInvite()(p);
  await p.getByRole("button", { name: /Get invite link/ }).click();
  if (wait) await p.getByText(wait).first().waitFor();
};
const scroll = (px) => (p) => p.locator("main.m-scroll").evaluate((el, y) => (el.scrollTop = y), px);

const ROWS = [
  ["OB-M1 Account · owner", { path: "/account", scenario: { fleet: fleet() } }],
  ["OB-M1 Account · paused", { path: "/account", scenario: { fleet: fleet({ paused: true }) } }],
  ["OB-M1 Account · staff", { path: "/account", scenario: { me: STAFF_ME, fleet: fleet({ role: "staff" }) } }],
  ["OB-M1 Account · nonfleet", { path: "/account", scenario: { retired: true } }],
  ["OB-M2 Roster · owner", { scenario: { fleet: fleet() } }],
  ["OB-M2 Roster · owner · scrolled", { scenario: { fleet: fleet({ invites: INV2 }) }, before: scroll(300) }],
  ["OB-M2 Roster · owner · 320", { w: 320, scenario: { fleet: fleet() } }],
  ["OB-M2 Biker sheet · owner", { scenario: { fleet: fleet() }, before: (p) => p.getByRole("button", { name: /Tendai M\./ }).click() }],
  [
    "OB-M2 Remove confirm",
    { scenario: { fleet: fleet() }, before: async (p) => { await p.getByRole("button", { name: /Tendai M\./ }).click(); await p.getByRole("button", { name: "Remove from my bikers" }).click(); } },
  ],
  ["OB-M3 Roster · staff", { scenario: { me: STAFF_ME, fleet: fleet({ role: "staff", invites: INV2 }) } }],
  ["OB-M4 Roster · first time", { scenario: { fleet: fleet({ bikers: [], invites: [] }) } }],
  [
    "OB-M5 Preferred suggestions",
    { scenario: { fleet: fleet({ bikers: [FARAI], invites: [], suggestions: [{ name: "Tino K.", phone: "+263 77 302 1188" }, { name: "Chipo R.", phone: "+263 78 220 4411" }] }) } },
  ],
  ["OB-M7 First biker joined", { scenario: { fleet: fleet({ bikers: [FARAI], invites: [KUDA] }), bills: { thisWeek: { rides: 0, total: "0.00" }, bills: [] } } }],
  ["OB-M6 Invite · typing", { scenario: { fleet: fleet() }, before: async (p) => { await openInvite(p); await p.getByLabel("Phone").fill("7755501"); } }],
  ["OB-M6 Invite · getting link", { scenario: { fleet: fleet(), invite: "hang" }, before: getLink() }],
  ["OB-M6 Invite · link ready", { scenario: { fleet: fleet() }, before: getLink("Invite link for Kuda") }],
  [
    "OB-M6 Invite · link copied",
    {
      scenario: { fleet: fleet() },
      before: async (p) => {
        await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
        await getLink("Invite link for Kuda")(p);
        await p.getByRole("button", { name: "Copy link" }).click();
      },
    },
  ],
  ["OB-M6 Invite · already invited", { scenario: { fleet: fleet(), invite: "dup" }, before: getLink("Already invited · same link") }],
  ["OB-M6 Invite · couldn't get a link", { scenario: { fleet: fleet(), invite: "fail" }, before: getLink("Couldn't get a link") }],
  ["OB-M6 Invite · no network", { scenario: { fleet: fleet(), invite: "net" }, before: getLink("Can't reach LyniaGo") }],
  ["Roster · loading", { scenario: { fleet: fleet(), load: "hang" } }],
  ["Roster · couldn't load", { scenario: { fleet: fleet(), load: "fail" } }],
  // Reachability probes every 20 s (lib/reachability.ts), so the shot waits for the offline toast itself.
  [
    "Roster · offline",
    {
      scenario: ROWS_DOWN,
      before: async (p) => {
        ROWS_DOWN.down = true; // the reachability probe (every 20 s) then fails
        await p.locator(".m-toast").waitFor({ timeout: 45000 });
      },
    },
  ],
];

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const mctx = await browser.newContext(contextDefaults({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 }));
const mpage = await mctx.newPage();
await mpage.goto(MOCKS, { waitUntil: "load" });
await mpage.waitForTimeout(1500);
const rows = [];
for (const [label, app] of ROWS) {
  let mock = null;
  try {
    mock = join(SHOTS, `mock-${rows.length}.png`);
    await mpage.locator(`[data-screen-label="${label}"]`).first().screenshot({ path: mock });
  } catch (err) {
    console.error(`mock ${label}: ${err.message}`);
    mock = null;
  }
  const shot = await shootApp(browser, { name: String(rows.length), ...app });
  console.error(`${shot ? "ok" : "--"} ${label}`);
  rows.push({ label, mock, app: shot, logicalW: app.w ?? 360 });
}
await mctx.close();
await buildSheet({ title: "Own bikers v1 (D-117) · merchant roster: handoff (left) vs app (right)", out: OUT, rows, browser });
await browser.close();
