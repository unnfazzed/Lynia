#!/usr/bin/env node
/**
 * The merchant web upgrade L3 screenshot sheet (ledger D-45, docs/DESIGN-DEVIATIONS.md): Your riders — the
 * list for an owner and for staff, the empty state, a restaurant's way in from its Shop page, the "Your
 * rider" tag on the pick screen, and a shop's optional checklist step — beside their RM mocks where one
 * exists, at the merchant's 1024×680 and the 320px phone check.
 *
 * The tablet's API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend
 * is needed: start the dev server with that same-origin base first —
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-l3.mjs --out docs/parity/MERCHANT-L3-D45-2026-09-29
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";
import { withMockRenderer } from "./lib/mock.mjs";
import { buildSheet } from "./lib/sheet.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-l3");
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
  hours: null,
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: false,
  myRole: "owner",
  location: PIN,
};

const RIDERS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Big Farai",
    phoneMasked: "+263•••••0002",
    status: "on_lyniago",
    invitePhone: null,
    jobs: 12,
    ratingAvg: 4.9,
    rider: { name: "Farai Chari", photoUrl: null },
    addedAt: "2026-09-20T10:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Blessing",
    phoneMasked: "+263•••••0005",
    status: "on_lyniago",
    invitePhone: null,
    jobs: 0,
    ratingAvg: null,
    rider: null,
    addedAt: "2026-09-25T10:00:00.000Z",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    label: "Nyasha (cousin)",
    phoneMasked: "+263•••••0006",
    status: "not_on_lyniago",
    invitePhone: "263771000006",
    jobs: 0,
    ratingAvg: null,
    rider: null,
    addedAt: "2026-09-27T10:00:00.000Z",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    label: "Tino",
    phoneMasked: "+263•••••0008",
    status: "unavailable",
    invitePhone: null,
    jobs: 3,
    ratingAvg: 4.3,
    rider: { name: "Tinashe Moyo", photoUrl: null },
    addedAt: "2026-09-28T10:00:00.000Z",
  },
];

const FINDING_ID = "55555555-5555-4555-8555-555555555555";

function finding() {
  const offer = (id, over) => ({
    id,
    type: "accept",
    offeredFare: "4.20",
    etaMinutes: 5,
    rider: { name: "Rider", photoUrl: null, ratingAvg: 4.6, ratingCount: 20, tripsCount: 60 },
    preferred: false,
    ownMember: false,
    ...over,
  });
  return {
    id: FINDING_ID,
    state: "finding",
    status: "open_for_offers",
    createdAt: new Date(Date.now() - 25_000).toISOString(),
    expiresAt: new Date(Date.now() + 65_000).toISOString(),
    dropoff: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Copacabana rank, the green kiosk", contactPhone: "+263774444444" },
    itemsSummary: "A car battery (N70)",
    declaredValue: "120.00",
    proposedFare: "4.20",
    agreedFare: null,
    bookedBy: "Tendai",
    rider: null,
    offerCount: 3,
    undeliveredReason: null,
    cancelledBy: null,
    cancelReason: null,
    rebroadcastedToId: null,
    rebroadcastOfId: null,
    codeIssuedAt: null,
    offers: [
      offer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { offeredFare: "3.80", etaMinutes: 4, rider: { name: "Kuda M.", photoUrl: null, ratingAvg: 4.7, ratingCount: 40, tripsCount: 150 } }),
      offer("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { offeredFare: "4.20", etaMinutes: 6, rider: { name: "Farai Chari", photoUrl: null, ratingAvg: 4.9, ratingCount: 31, tripsCount: 120 }, preferred: true }),
      offer("cccccccc-cccc-4ccc-8ccc-cccccccccccc", { type: "counter", offeredFare: "5.00", etaMinutes: 3, rider: { name: "Tendai P.", photoUrl: null, ratingAvg: 4.4, ratingCount: 12, tripsCount: 44 } }),
    ],
  };
}

const SCENARIOS = {
  shop: { me: { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }, riders: RIDERS },
  newShop: { me: { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts" }, riders: [] },
  restaurant: { me: { ...PROFILE, name: "Mai Tino's Kitchen", businessType: "restaurant", shopKind: null, pilotEnabled: true }, riders: RIDERS.slice(0, 2) },
  staff: { me: { ...PROFILE, name: "Mai Tino's Kitchen", businessType: "restaurant", shopKind: null, pilotEnabled: true, myRole: "staff" }, riders: RIDERS },
};

async function apiRoute(route, scenario) {
  const url = new URL(route.request().url());
  const path = url.pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/merchant/me") return json(200, scenario.me);
  if (path === "/merchant/riders") return json(200, { riders: scenario.riders, cap: 20 });
  if (path === "/merchant/dishes" || path === "/merchant/categories" || path === "/merchant/orders") return json(200, []);
  if (path === "/merchant/bookings") return json(200, []);
  if (path === `/merchant/bookings/${FINDING_ID}`) return json(200, finding());
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, viewport, scenario = SCENARIOS.shop, full = false, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport, deviceScaleFactor: 2 }));
  await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
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

await mkdir(SHOTS, { recursive: true });
const browser = await launch();
const app = {};
try {
  app.riders = await shoot(browser, { name: "riders-shop-owner-tablet", path: "/riders", viewport: TABLET, full: true, before: waitFor("Big Farai") });
  app.ridersPhone = await shoot(browser, { name: "riders-shop-owner-320", path: "/riders", viewport: PHONE, full: true, before: waitFor("Big Farai") });
  app.ridersEmpty = await shoot(browser, { name: "riders-empty-tablet", path: "/riders", viewport: TABLET, scenario: SCENARIOS.newShop, before: waitFor("No riders yet") });
  app.ridersStaff = await shoot(browser, { name: "riders-staff-tablet", path: "/riders", viewport: TABLET, scenario: SCENARIOS.staff, full: true, before: waitFor("Only the owner") });
  app.shopPage = await shoot(browser, { name: "shop-restaurant-tablet", path: "/shop", viewport: TABLET, scenario: SCENARIOS.restaurant, full: true, before: waitFor("Manage riders") });
  app.pick = await shoot(browser, { name: "pick-your-rider-tablet", path: `/deliveries/${FINDING_ID}`, viewport: TABLET, full: true, before: waitFor("Your rider") });
  app.setup = await shoot(browser, { name: "setup-shop-riders-tablet", path: "/setup", viewport: TABLET, scenario: SCENARIOS.newShop, full: true, before: waitFor("Add your riders") });
} finally {
  await browser.close();
}

const mock = {};
await withMockRenderer(async (render) => {
  for (const id of ["shop", "setup"]) {
    const r = await render({ src: "RM", id, mode: "tablet", out: join(SHOTS, `mock-RM-${id}.png`) });
    if (r.ok) mock[id] = r.path;
    else console.error(`mock RM.${id} failed: ${r.error}`);
  }
});

const UNDRAWN = "undrawn: no RM mock (D-45)";
await buildSheet({
  title: "Merchant web upgrade L3 — D-45 (PROPOSED): Your riders",
  out: OUT,
  rows: [
    { label: "RM.shop · restaurant", sub: "a “Your riders” card after How riders pay you", mock: mock.shop, app: app.shopPage, logicalW: 512 },
    { label: "RM.setup · a shop", sub: "+ “Add your riders”, optional", mock: mock.setup, app: app.setup, logicalW: 512 },
    { label: "Your riders · owner", sub: "statuses, a record after a job, the WhatsApp sign-up link, Remove", mockNote: UNDRAWN, app: app.riders, logicalW: 512 },
    { label: "Your riders · 320", mockNote: UNDRAWN, app: app.ridersPhone, logicalW: 320 },
    { label: "Your riders · none yet", mockNote: UNDRAWN, app: app.ridersEmpty, logicalW: 512 },
    { label: "Your riders · staff", sub: "the list without the owner's controls", mockNote: UNDRAWN, app: app.ridersStaff, logicalW: 512 },
    { label: "Pick a rider (D-44) · “Your rider”", sub: "the business's own rider first, tagged", mockNote: UNDRAWN, app: app.pick, logicalW: 512 },
  ],
});
console.log(`sheet: ${OUT}.png (+ .html); shots in ${SHOTS}`);
