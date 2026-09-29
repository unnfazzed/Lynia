#!/usr/bin/env node
/**
 * The merchant web upgrade L4 screenshot sheet (ledger D-46, docs/DESIGN-DEVIATIONS.md): Team — the owner's
 * list, an invite ready to send, Join, who is signed in (Switch person, Leave), and the Staff views of Menu,
 * Hours and the nav — beside their RM mocks where one exists, at the merchant's 1024×680 and the 320px
 * phone check.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api NEXT_PUBLIC_SUPPORT_WHATSAPP=263770000000 node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-l4.mjs --out docs/parity/MERCHANT-L4-D46-2026-09-29
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { withMockRenderer } from "./lib/mock.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-l4");
const SHOTS = `${OUT}-shots`;

const TABLET = { width: 1024, height: 680 };
const PHONE = { width: 320, height: 640 };

const SESSION = {
  accessToken: "parity",
  refreshToken: "parity.refresh",
  expiresIn: 900,
  issuedAt: Date.now(),
  profileId: "p-parity",
  role: "customer",
};

const PIN = { point: { lat: -17.8575, lng: 31.0367 }, landmark: "Next to the Total garage, blue gate", contactPhone: "+263771234567" };

const PROFILE = {
  id: "m-parity",
  ownerPhoneMasked: "+263•••••4567",
  description: null,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: { mon: { open: "08:00", close: "20:00" }, tue: { open: "08:00", close: "20:00" }, sat: { open: "09:00", close: "14:00" } },
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: false,
  myRole: "owner",
  myName: "Farai Chari",
  location: PIN,
};

const SHOP = { ...PROFILE, name: "Siyaso Spares", businessType: "shop", shopKind: "auto_parts" };
const RESTAURANT = { ...PROFILE, name: "Mai Tino's Kitchen", businessType: "restaurant", shopKind: null, pilotEnabled: true };

const TEAM = {
  members: [
    { profileId: "11111111-1111-4111-8111-111111111111", name: "Farai Chari", phoneMasked: "+263•••••4567", role: "owner", you: true, joinedAt: "2026-09-20T10:00:00.000Z" },
    { profileId: "22222222-2222-4222-8222-222222222222", name: "Tendai", phoneMasked: "+263•••••2210", role: "staff", you: false, joinedAt: "2026-09-25T10:00:00.000Z" },
  ],
  invites: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Rudo",
      phoneMasked: "+263•••••9034",
      invitePhone: "263778889034",
      createdAt: "2026-09-29T10:00:00.000Z",
      expiresAt: "2026-10-13T10:00:00.000Z",
    },
  ],
};

const NEW_INVITE = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Chipo",
  phoneMasked: "+263•••••0003",
  invitePhone: "263773000003",
  createdAt: "2026-09-29T11:00:00.000Z",
  expiresAt: "2026-10-13T11:00:00.000Z",
};

const MY_INVITES = {
  invites: [{ id: "55555555-5555-4555-8555-555555555555", businessName: "Siyaso Spares", businessType: "shop", ownerName: "Farai", role: "staff", name: "Tendai", expiresAt: "2026-10-13T10:00:00.000Z" }],
};

const CATEGORIES = [{ id: "66666666-6666-4666-8666-666666666666", name: "Mains", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 3 }];
const DISH = (id, name, price, over = {}) => ({
  id,
  categoryId: CATEGORIES[0].id,
  name,
  description: null,
  priceUsd: price,
  photoUrl: null,
  isDraft: false,
  outOfStock: false,
  sortOrder: 0,
  ...over,
});
const DISHES = [
  DISH("77777777-7777-4777-8777-777777777771", "Sadza & beef stew", 4.5),
  DISH("77777777-7777-4777-8777-777777777772", "Sadza & road-runner chicken", 5.5, { outOfStock: true }),
  DISH("77777777-7777-4777-8777-777777777773", "Rice & chicken", 4),
];

const SCENARIOS = {
  shopOwner: { me: SHOP },
  restaurantOwner: { me: RESTAURANT },
  restaurantStaff: { me: { ...RESTAURANT, myRole: "staff", myName: "Tendai Moyo" } },
  shopStaff: { me: { ...SHOP, myRole: "staff", myName: "Tendai Moyo" } },
  invited: { me: null, invites: MY_INVITES },
};

async function apiRoute(route, scenario) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/me") {
    return scenario.me ? json(200, scenario.me) : json(403, { statusCode: 403, reason: "not_a_member", message: "This number isn't on a business on LyniaGo yet." });
  }
  if (path === "/merchant/invites") return json(200, scenario.invites ?? { invites: [] });
  if (path === "/merchant/team" && request.method() === "GET") return json(200, TEAM);
  if (path === "/merchant/team/invites" && request.method() === "POST") return json(201, NEW_INVITE);
  if (path === "/merchant/categories") return json(200, CATEGORIES);
  if (path === "/merchant/dishes") return json(200, DISHES);
  if (path === "/merchant/orders" || path === "/merchant/bookings") return json(200, []);
  if (path === "/merchant/riders") return json(200, { riders: [], cap: 20 });
  if (path === "/auth/me") return json(200, { firstName: "", lastName: "", phone: "+263772222210" });
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, viewport, scenario, full = false, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  // The map's tiles aren't what this sheet is about; keep the shot offline and stable.
  await ctx.route(
    (url) => url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org"),
    (route) => route.abort(),
  );
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    // Next's dev-mode badge is dev tooling, not the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    if (full) {
      // The shell is one screen tall and scrolls inside; let a full-length shot show the whole screen.
      await page.addStyleTag({
        content:
          ".kitchen-shell { height: auto !important; min-height: 100dvh; overflow: visible !important; } " +
          ".kitchen-content, .kitchen-page { overflow: visible !important; height: auto !important; }",
      });
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(400);
    const file = join(SHOTS, `${name}.png`);
    await page.screenshot({ path: file, fullPage: full });
    return file;
  } finally {
    await ctx.close();
  }
}

const waitFor = (text) => async (page) => {
  await page.getByText(text).first().waitFor();
};

const inviteReady = async (page) => {
  await page.getByRole("button", { name: "Add someone" }).click();
  await page.getByLabel("Their name").fill("Chipo");
  await page.getByLabel("Their phone number").fill("0773000003");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await page.getByText("Invite ready. Send them the link on WhatsApp.").waitFor();
};

const openPerson = (label) => async (page) => {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("button", { name: "Switch person" }).waitFor();
};

const leaveConfirm = async (page) => {
  await openPerson("Signed in: Tendai · Staff")(page);
  await page.getByRole("button", { name: "Leave this business" }).click();
  await page.getByRole("button", { name: "Yes, leave" }).waitFor();
};

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const app = {};
try {
  const S = SCENARIOS;
  app.team = await shoot(browser, { name: "team-owner-tablet", path: "/team", viewport: TABLET, scenario: S.shopOwner, full: true, before: waitFor("Tendai") });
  app.teamPhone = await shoot(browser, { name: "team-owner-320", path: "/team", viewport: PHONE, scenario: S.shopOwner, full: true, before: waitFor("Tendai") });
  app.inviteReady = await shoot(browser, { name: "team-invite-ready-tablet", path: "/team", viewport: TABLET, scenario: S.shopOwner, full: true, before: inviteReady });
  app.join = await shoot(browser, { name: "join-tablet", path: "/join", viewport: TABLET, scenario: S.invited, full: true, before: waitFor("added you to") });
  app.joinPhone = await shoot(browser, { name: "join-320", path: "/join", viewport: PHONE, scenario: S.invited, full: true, before: waitFor("added you to") });
  app.shop = await shoot(browser, { name: "shop-restaurant-owner-tablet", path: "/shop", viewport: TABLET, scenario: S.restaurantOwner, full: true, before: waitFor("Manage team") });
  app.person = await shoot(browser, { name: "person-owner-tablet", path: "/shop", viewport: TABLET, scenario: S.restaurantOwner, before: openPerson("Signed in: Farai · Owner") });
  app.leave = await shoot(browser, { name: "person-staff-leave-320", path: "/deliveries", viewport: PHONE, scenario: S.shopStaff, before: leaveConfirm });
  app.menuStaff = await shoot(browser, { name: "menu-staff-tablet", path: "/menu", viewport: TABLET, scenario: S.restaurantStaff, full: true, before: waitFor("Only the owner changes the menu") });
  app.hoursStaff = await shoot(browser, { name: "hours-staff-tablet", path: "/hours", viewport: TABLET, scenario: S.restaurantStaff, full: true, before: waitFor("Only the owner changes the opening hours") });
  app.onboarding = await shoot(browser, { name: "onboarding-team-line-320", path: "/onboarding?own=1", viewport: PHONE, scenario: { me: null }, full: true, before: waitFor("Ask the owner to add you") });
} finally {
  await browser.close();
}

const mock = {};
await withMockRenderer(async (render) => {
  for (const id of ["shop", "catalog", "hours"]) {
    const r = await render({ src: "RM", id, mode: "tablet", out: join(SHOTS, `mock-RM-${id}.png`) });
    if (r.ok) mock[id] = r.path;
    else console.error(`mock RM.${id} failed: ${r.error}`);
  }
});

const UNDRAWN = "undrawn: no RM mock (D-46)";
await buildSheet({
  title: "Merchant web upgrade L4 — D-46 (PROPOSED): Team, Join, who is signed in, Staff views",
  out: OUT,
  rows: [
    { label: "RM.shop · owner", sub: "+ a “Your team” card (both types); who is signed in, top right", mock: mock.shop, app: app.shop, logicalW: 512 },
    { label: "RM.catalog · Staff", sub: "stock toggles only; the Staff nav (Orders · Menu · Hours · Help)", mock: mock.catalog, app: app.menuStaff, logicalW: 512 },
    { label: "RM.hours · Staff", sub: "the week as text, busy mode kept", mock: mock.hours, app: app.hoursStaff, logicalW: 512 },
    { label: "Team · owner", sub: "owner, staff, an invite with its WhatsApp link, Remove", mockNote: UNDRAWN, app: app.team, logicalW: 512 },
    { label: "Team · 320", mockNote: UNDRAWN, app: app.teamPhone, logicalW: 320 },
    { label: "Team · invite ready", sub: "“Invite ready. Send them the link on WhatsApp.”", mockNote: UNDRAWN, app: app.inviteReady, logicalW: 512 },
    { label: "Join", sub: "“{Owner} added you to {Business} as Staff”, name + privacy line, Join / Not me", mockNote: UNDRAWN, app: app.join, logicalW: 512 },
    { label: "Join · 320", mockNote: UNDRAWN, app: app.joinPhone, logicalW: 320 },
    { label: "Who is signed in · owner", sub: "Switch person", mockNote: UNDRAWN, app: app.person, logicalW: 512 },
    { label: "Who is signed in · Staff, 320", sub: "Leave this business, confirmed", mockNote: UNDRAWN, app: app.leave, logicalW: 320 },
    { label: "Set up your business (D-43) · 320", sub: "+ “Ask the owner to add you in Team”", mockNote: UNDRAWN, app: app.onboarding, logicalW: 320 },
  ],
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
