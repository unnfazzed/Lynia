#!/usr/bin/env node
/**
 * "What the merchant side looks like today": every merchant web route, app side only (no mock beside
 * it), at the tablet's 1024×680, as plain PNGs plus an index. Made as the input for a redesign in
 * Claude Design, so each screen is a standalone image rather than a side-by-side parity sheet.
 *
 * Restaurant (pilot) and shop owners are both shot, since the two see different navs and pages. The
 * API is stubbed in the browser (every call to `<origin>/__api/**`), so no seeded backend is needed:
 *
 *   API_BASE_URL=http://127.0.0.1:4312/__api node tools/parity/serve-web.mjs merchant
 *   node tools/parity/shoot-merchant-current.mjs --out docs/parity/merchant-current
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contextDefaults, launch } from "./lib/browser.mjs";

const ORIGIN = process.env.PARITY_MERCHANT_URL || "http://127.0.0.1:4312";
const outArg = process.argv.indexOf("--out");
const OUT = resolve(outArg > 0 ? process.argv[outArg + 1] : "out/merchant-current");

const TABLET = { width: 1024, height: 680 };
const TILE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='256' height='256' fill='#e4e8ea'/></svg>";

const SESSION = {
  accessToken: "parity",
  refreshToken: "parity.refresh",
  expiresIn: 900,
  issuedAt: Date.now(),
  profileId: "p-parity",
  role: "customer",
};

const PIN = { point: { lat: -17.8575, lng: 31.0367 }, landmark: "Next to the Total garage, blue gate", contactPhone: "+263771234567" };
const ALL_DAY = { open: "00:00", close: "23:59" };
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };

const PROFILE = {
  id: "m-parity",
  ownerPhoneMasked: "+263•••••4567",
  description: "Home-style Zimbabwean food, cooked fresh every day.",
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: ["Traditional", "Grills"],
  priceLevel: 1,
  hours: WEEK,
  cashRule: "collect_and_return",
  busy: false,
  pilotEnabled: true,
  myRole: "owner",
  myName: "Farai Chari",
  location: PIN,
};
const RESTAURANT = { ...PROFILE, name: "Sadza Republic", businessType: "restaurant", shopKind: null };
const SHOP = { ...PROFILE, name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts", cuisineTags: ["Brakes", "Batteries"], pilotEnabled: false, description: null };

const uuid = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

const FOOD_CATEGORIES = [
  { id: uuid(6), name: "Mains", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 3 },
  { id: uuid(9), name: "Drinks", sortOrder: 1, availableFrom: null, availableTo: null, hidden: false, dishCount: 1 },
];
const dish = (id, categoryId, name, priceUsd, over = {}) => ({ id, categoryId, name, description: null, priceUsd, photoUrl: null, isDraft: false, outOfStock: false, sortOrder: 0, ...over });
const FOOD_DISHES = [
  dish("77777777-7777-4777-8777-777777777771", uuid(6), "Mazondo", 5, { description: "Slow-cooked cow trotters, sadza on the side" }),
  dish("77777777-7777-4777-8777-777777777772", uuid(6), "Sadza & beef stew", 4.5),
  dish("77777777-7777-4777-8777-777777777773", uuid(6), "Sadza & road-runner chicken", 5.5, { outOfStock: true }),
  dish("77777777-7777-4777-8777-777777777774", uuid(9), "Mazoe orange 2L", 3),
];
const SHOP_CATEGORIES = [
  { id: uuid(1), name: "Brakes", sortOrder: 0, availableFrom: null, availableTo: null, hidden: false, dishCount: 2 },
  { id: uuid(2), name: "Engine", sortOrder: 1, availableFrom: null, availableTo: null, hidden: false, dishCount: 1 },
];
const SHOP_ITEMS = [
  dish("88888888-8888-4888-8888-888888888881", uuid(1), "Brake pads (front)", 22, { description: "Toyota Corolla 2008–2013" }),
  dish("88888888-8888-4888-8888-888888888882", uuid(1), "Brake fluid DOT 4", 6.5, { description: "500 ml" }),
  dish("88888888-8888-4888-8888-888888888883", uuid(2), "Oil filter", 7),
];

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();

function order(id, over) {
  return {
    id,
    merchantId: "99999999-9999-4999-8999-999999999999",
    status: "pending",
    merchantPhase: "awaiting_accept",
    items: [
      { dishId: FOOD_DISHES[1].id, name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: null, available: null },
      { dishId: FOOD_DISHES[3].id, name: "Mazoe orange 2L", priceUsd: 3, quantity: 1, note: null, available: null },
    ],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 12,
    deliveryFee: 2,
    total: 14,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: null,
    prepStartedAt: null,
    readyAt: null,
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: null,
    dispatchAttempt: 0,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    ...over,
  };
}

function orders() {
  return [
    order("a1111111-1111-4111-8111-111111111111", {
      acceptDeadlineAt: ahead(75_000),
      note: "Pack the sadza separately from the stew please",
    }),
    order("a2222222-2222-4222-8222-222222222222", {
      status: "accepted",
      merchantPhase: "preparing",
      paymentMethod: "wallet",
      prepMinutes: 20,
      prepStartedAt: ago(8 * 60_000),
      merchantPaymentConfirmedAt: ago(9 * 60_000),
      items: [{ dishId: FOOD_DISHES[0].id, name: "Mazondo", priceUsd: 5, quantity: 1, note: "Extra chilli", available: true }],
      merchantGoodsTotal: 5,
      total: 7,
    }),
    order("a3333333-3333-4333-8333-333333333333", {
      status: "accepted",
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      prepMinutes: 15,
      paymentRequestedAt: ago(2 * 60_000),
      items: [{ dishId: FOOD_DISHES[1].id, name: "Sadza & beef stew", priceUsd: 4.5, quantity: 1, note: null, available: true }],
      merchantGoodsTotal: 4.5,
      total: 6.5,
    }),
    order("a4444444-4444-4444-8444-444444444444", {
      status: "open_for_offers",
      merchantPhase: "ready_for_pickup",
      prepMinutes: 15,
      prepStartedAt: ago(20 * 60_000),
      readyAt: ago(3 * 60_000),
      dispatchAttempt: 1,
      dispatchOfferExpiresAt: ahead(60_000),
      items: [{ dishId: FOOD_DISHES[0].id, name: "Mazondo", priceUsd: 5, quantity: 2, note: null, available: true }],
      merchantGoodsTotal: 10,
      total: 12,
      merchantCashRule: "collect_and_return",
    }),
  ];
}

const STATEMENT = {
  rangeStart: ago(6 * 86_400_000),
  rangeEnd: new Date().toISOString(),
  ordersDelivered: 3,
  foodSalesTotal: 31.5,
  commissionRatePct: 0,
  commissionCharged: 0,
  illustrativeRatePct: 10,
  illustrativeCommission: 3.15,
  cookedFoodLossTotal: 0,
  lineItems: [
    { orderId: "b1111111-1111-4111-8111-111111111111", deliveredAt: ago(1 * 86_400_000), paymentMethod: "cash", amount: 12, commission: 0 },
    { orderId: "b2222222-2222-4222-8222-222222222222", deliveredAt: ago(2 * 86_400_000), paymentMethod: "wallet", amount: 9.5, commission: 0 },
    { orderId: "b3333333-3333-4333-8333-333333333333", deliveredAt: ago(4 * 86_400_000), paymentMethod: "cash", amount: 10, commission: 0 },
  ],
};
const TODAY = { date: new Date().toISOString().slice(0, 10), delivered: 7, rejected: 1, cashTaken: 38, walletTaken: 21.5, averagePrepMinutes: 17 };

// ── Shop: Book a rider + Your riders ────────────────────────────────────────────────────────────────
const BLESSING = { name: "Blessing M.", phone: "+263772222222", bikeReg: "AFG 2231" };
const IDS = { finding: uuid(1), coming: uuid(2), delivered: uuid(3), expired: uuid(4) };
function booking(id, over) {
  return {
    id,
    state: "finding",
    status: "broadcasting",
    createdAt: ago(20 * 60_000),
    expiresAt: null,
    dropoff: { point: { lat: -17.8105, lng: 31.0452 }, landmark: "Blue gate opposite the church, 12 Fife Ave", contactPhone: "+263773333333" },
    itemsSummary: "2 brake pads and an oil filter",
    declaredValue: "45.00",
    proposedFare: "3.50",
    agreedFare: null,
    bookedBy: "Tendai",
    rider: null,
    offerCount: 0,
    undeliveredReason: null,
    cancelledBy: null,
    cancelReason: null,
    rebroadcastedToId: null,
    rebroadcastOfId: null,
    codeIssuedAt: null,
    offers: [],
    ...over,
  };
}
const offer = (id, over) => ({
  id,
  type: "accept",
  offeredFare: "4.20",
  etaMinutes: 6,
  rider: { name: "Blessing M.", photoUrl: null, ratingAvg: 4.8, ratingCount: 31, tripsCount: 120 },
  preferred: false,
  ownMember: false,
  ...over,
});
function bookings() {
  return [
    booking(IDS.finding, {
      expiresAt: ahead(62_000),
      createdAt: ago(28_000),
      itemsSummary: "A car battery (N70)",
      declaredValue: "120.00",
      proposedFare: "4.20",
      dropoff: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Copacabana rank, the green kiosk", contactPhone: "+263774444444" },
      offerCount: 3,
      offers: [
        offer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { offeredFare: "3.80", etaMinutes: 4, rider: { name: "Kuda M.", photoUrl: null, ratingAvg: 4.7, ratingCount: 40, tripsCount: 150 } }),
        offer("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", { rider: { name: "Farai Chari", photoUrl: null, ratingAvg: 4.9, ratingCount: 31, tripsCount: 120 }, preferred: true }),
        offer("cccccccc-cccc-4ccc-8ccc-cccccccccccc", { type: "counter", offeredFare: "5.00", etaMinutes: 3, rider: { name: "Tendai P.", photoUrl: null, ratingAvg: 4.4, ratingCount: 12, tripsCount: 44 } }),
      ],
    }),
    booking(IDS.coming, { state: "coming", status: "assigned", createdAt: ago(9 * 60_000), rider: BLESSING, agreedFare: "3.50", codeIssuedAt: ago(8 * 60_000) }),
    booking(IDS.delivered, {
      state: "delivered",
      status: "completed",
      createdAt: ago(3 * 3600_000),
      itemsSummary: "Spark plugs x4",
      declaredValue: "18.00",
      rider: { ...BLESSING, phone: null },
      agreedFare: "3.00",
      bookedBy: "Rudo",
    }),
    booking(IDS.expired, { state: "expired", status: "expired", createdAt: ago(5 * 3600_000), itemsSummary: "Wiper blades", declaredValue: "12.00", proposedFare: "2.50" }),
  ];
}
const RIDERS = [
  { id: uuid(1), label: "Big Farai", phoneMasked: "+263•••••0002", status: "on_lyniago", invitePhone: null, jobs: 12, ratingAvg: 4.9, rider: { name: "Farai Chari", photoUrl: null }, addedAt: "2026-09-20T10:00:00.000Z" },
  { id: uuid(2), label: "Blessing", phoneMasked: "+263•••••0005", status: "on_lyniago", invitePhone: null, jobs: 0, ratingAvg: null, rider: null, addedAt: "2026-09-25T10:00:00.000Z" },
  { id: uuid(3), label: "Nyasha (cousin)", phoneMasked: "+263•••••0006", status: "not_on_lyniago", invitePhone: "263771000006", jobs: 0, ratingAvg: null, rider: null, addedAt: "2026-09-27T10:00:00.000Z" },
  { id: uuid(4), label: "Tino", phoneMasked: "+263•••••0008", status: "unavailable", invitePhone: null, jobs: 3, ratingAvg: 4.3, rider: { name: "Tinashe Moyo", photoUrl: null }, addedAt: "2026-09-28T10:00:00.000Z" },
];

// ── Team ────────────────────────────────────────────────────────────────────────────────────────────
const TEAM = {
  members: [
    { profileId: uuid(1), name: "Farai Chari", phoneMasked: "+263•••••4567", role: "owner", you: true, joinedAt: "2026-09-20T10:00:00.000Z" },
    { profileId: uuid(2), name: "Tendai", phoneMasked: "+263•••••2210", role: "staff", you: false, joinedAt: "2026-09-25T10:00:00.000Z" },
  ],
  invites: [
    { id: uuid(3), name: "Rudo", phoneMasked: "+263•••••9034", invitePhone: "263778889034", createdAt: "2026-09-29T10:00:00.000Z", expiresAt: "2026-10-13T10:00:00.000Z" },
  ],
};
const MY_INVITES = {
  invites: [{ id: uuid(5), businessName: "Siyaso Spares", businessType: "shop", ownerName: "Farai", role: "staff", name: "Tendai", expiresAt: "2026-10-13T10:00:00.000Z" }],
};

const SCENARIOS = {
  newcomer: { me: null },
  invited: { me: null, invites: MY_INVITES },
  restaurant: { me: RESTAURANT, categories: FOOD_CATEGORIES, dishes: FOOD_DISHES, orders, riders: RIDERS.slice(0, 2) },
  restaurantBoard: { me: RESTAURANT, categories: FOOD_CATEGORIES, dishes: FOOD_DISHES, orders: () => orders().slice(1) },
  restaurantEmpty: { me: { ...RESTAURANT, cuisineTags: [], description: null }, categories: [], dishes: [], orders: () => [] },
  shop: { me: SHOP, categories: SHOP_CATEGORIES, dishes: SHOP_ITEMS, bookings, riders: RIDERS },
  shopEmpty: { me: SHOP, categories: [], dishes: [], bookings: () => [], riders: [] },
};

let tilesStubbed = false;

async function apiRoute(route, scenario) {
  const request = route.request();
  const path = new URL(request.url()).pathname.replace(/^\/__api/, "");
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/auth/otp/request") return json(200, { sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
  if (path === "/auth/me") return json(200, { firstName: "Farai", lastName: "Chari", phone: "+263771234567" });
  if (path === "/merchant/me") {
    return scenario.me
      ? json(200, scenario.me)
      : json(403, { reason: "not_a_member", message: "This number isn't on a business on LyniaGo yet." });
  }
  if (path === "/merchant/invites") return json(200, scenario.invites ?? { invites: [] });
  if (path === "/merchant/team") return json(200, TEAM);
  if (path === "/merchant/categories") return json(200, scenario.categories ?? []);
  if (path === "/merchant/dishes") return json(200, scenario.dishes ?? []);
  if (path === "/merchant/orders") return json(200, scenario.orders ? scenario.orders() : []);
  if (path === "/merchant/bookings") return json(200, scenario.bookings ? scenario.bookings() : []);
  const one = path.match(/^\/merchant\/bookings\/([0-9a-f-]+)$/);
  if (one && scenario.bookings) {
    const found = scenario.bookings().find((b) => b.id === one[1]);
    if (found) return json(200, found);
  }
  if (path === "/merchant/riders") return json(200, { riders: scenario.riders ?? [], cap: 20 });
  if (path === "/merchant/statement/weekly") return json(200, STATEMENT);
  if (path === "/merchant/summary/today") return json(200, TODAY);
  return json(404, { message: "Not stubbed" });
}

async function shoot(browser, { name, path, scenario = SCENARIOS.restaurant, signedIn = true, before }) {
  const ctx = await browser.newContext(contextDefaults({ viewport: TABLET, deviceScaleFactor: 2 }));
  if (signedIn) {
    await ctx.addCookies([{ name: "lynia_merchant_session", value: encodeURIComponent(JSON.stringify(SESSION)), url: ORIGIN }]);
  }
  await ctx.route("**/__api/**", (route) => apiRoute(route, scenario));
  await ctx.route("**/socket.io/**", (route) => route.abort());
  await ctx.route((url) => url.hostname === "tile.openstreetmap.org" || url.hostname.endsWith(".tile.openstreetmap.org"), async (route) => {
    try {
      const res = await route.fetch({ timeout: 8000 });
      if (res.ok()) return route.fulfill({ response: res });
    } catch {
      // fall through to the stand-in
    }
    tilesStubbed = true;
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: TILE_SVG });
  });
  const page = await ctx.newPage();
  try {
    await page.goto(ORIGIN + path, { waitUntil: "networkidle", timeout: 90000 });
    if (before) await before(page);
    // Next's dev-mode badge is dev tooling, not the app.
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null));
    await page.waitForTimeout(600);
    // The tablet shell scrolls inside its own panes, so a full-page shot stops at 680px. Grow the
    // viewport by whatever the tallest pane still hides, so each screen is captured top to bottom.
    const hidden = await page.evaluate(() =>
      Math.max(0, ...[...document.querySelectorAll("*")].map((el) => el.scrollHeight - el.clientHeight).filter((h) => h > 1 && h < 20000)),
    );
    if (hidden > 0) {
      await page.setViewportSize({ width: TABLET.width, height: TABLET.height + hidden });
      await page.waitForTimeout(400);
    }
    const file = `${name}.png`;
    await page.screenshot({ path: join(OUT, file), fullPage: true });
    return file;
  } finally {
    await ctx.close();
  }
}

const toCodeStep = async (page) => {
  await page.getByLabel("Phone number").fill("0771234567");
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await page.getByLabel("6-digit code").waitFor();
};

const toOnboardingStep2 = async (page) => {
  await page.getByText("What do you sell?").first().waitFor();
  await page.getByRole("radio", { name: /^Restaurant/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByLabel("Business name").waitFor();
  await page.getByLabel("Business name").fill("Sadza Republic");
  await page.getByLabel("A landmark riders look for").fill("Next to the Total garage, blue gate");
};

/** Every merchant route, grouped the way an owner meets them. `who` is who the screen is shot as. */
const SHOTS = [
  { group: "Sign in & sign up", name: "01-login-phone", path: "/login", signedIn: false, title: "Sign in — phone number" },
  { group: "Sign in & sign up", name: "02-login-code", path: "/login", signedIn: false, before: toCodeStep, title: "Sign in — 6-digit code" },
  { group: "Sign in & sign up", name: "03-join-invite", path: "/join", scenario: SCENARIOS.invited, title: "Join — an invite to someone's business" },
  { group: "Sign in & sign up", name: "04-onboarding", path: "/onboarding", scenario: SCENARIOS.newcomer, title: "Set up your business — step 1, what do you sell" },
  { group: "Sign in & sign up", name: "04b-onboarding-details", path: "/onboarding", scenario: SCENARIOS.newcomer, before: toOnboardingStep2, title: "Set up your business — step 2, details and map pin" },
  { group: "Sign in & sign up", name: "05-setup-restaurant", path: "/setup", scenario: SCENARIOS.restaurantEmpty, title: "Setup checklist — restaurant" },
  { group: "Sign in & sign up", name: "06-setup-shop", path: "/setup", scenario: SCENARIOS.shopEmpty, title: "Setup checklist — shop" },

  { group: "Restaurant (owner)", name: "10-restaurant-queue", path: "/queue", title: "Orders — a new order ringing (full-screen takeover)" },
  { group: "Restaurant (owner)", name: "10b-restaurant-queue-board", path: "/queue", scenario: SCENARIOS.restaurantBoard, title: "Orders — queue board: preparing, awaiting payment, ready for pickup" },
  { group: "Restaurant (owner)", name: "11-restaurant-queue-empty", path: "/queue", scenario: SCENARIOS.restaurantEmpty, title: "Orders — empty queue" },
  { group: "Restaurant (owner)", name: "12-restaurant-menu", path: "/menu", title: "Menu" },
  { group: "Restaurant (owner)", name: "13-restaurant-menu-empty", path: "/menu", scenario: SCENARIOS.restaurantEmpty, title: "Menu — empty" },
  { group: "Restaurant (owner)", name: "14-restaurant-categories", path: "/menu/categories", title: "Menu — categories" },
  { group: "Restaurant (owner)", name: "15-restaurant-shop", path: "/shop", title: "Shop profile" },
  { group: "Restaurant (owner)", name: "16-restaurant-hours", path: "/hours", title: "Hours & busy mode" },
  { group: "Restaurant (owner)", name: "17-restaurant-statement", path: "/statement", title: "Statement — weekly + today" },
  { group: "Restaurant (owner)", name: "18-restaurant-team", path: "/team", title: "Team" },
  { group: "Restaurant (owner)", name: "19-restaurant-riders", path: "/riders", title: "Your riders" },

  { group: "Shop (owner)", name: "20-shop-deliveries", path: "/deliveries", scenario: SCENARIOS.shop, title: "Deliveries — finding / coming / delivered / expired" },
  { group: "Shop (owner)", name: "21-shop-deliveries-empty", path: "/deliveries", scenario: SCENARIOS.shopEmpty, title: "Deliveries — none yet" },
  { group: "Shop (owner)", name: "22-shop-book-rider", path: "/deliveries/new", scenario: SCENARIOS.shop, title: "Book a rider" },
  { group: "Shop (owner)", name: "23-shop-booking-finding", path: `/deliveries/booking?id=${IDS.finding}`, scenario: SCENARIOS.shop, title: "Booking — riders' offers coming in" },
  { group: "Shop (owner)", name: "24-shop-booking-coming", path: `/deliveries/booking?id=${IDS.coming}`, scenario: SCENARIOS.shop, title: "Booking — rider on the way" },
  { group: "Shop (owner)", name: "25-shop-booking-delivered", path: `/deliveries/booking?id=${IDS.delivered}`, scenario: SCENARIOS.shop, title: "Booking — delivered" },
  { group: "Shop (owner)", name: "26-shop-riders", path: "/riders", scenario: SCENARIOS.shop, title: "Your riders" },
  { group: "Shop (owner)", name: "27-shop-items", path: "/menu", scenario: SCENARIOS.shop, title: "Items" },
  { group: "Shop (owner)", name: "28-shop-profile", path: "/shop", scenario: SCENARIOS.shop, title: "Shop profile" },
  { group: "Shop (owner)", name: "29-shop-team", path: "/team", scenario: SCENARIOS.shop, title: "Team" },
];

await mkdir(OUT, { recursive: true });
const browser = await launch();
const done = [];
try {
  for (const s of SHOTS) {
    try {
      const file = await shoot(browser, s);
      done.push({ ...s, file });
      console.log(`ok   ${s.name}`);
    } catch (err) {
      done.push({ ...s, error: String(err.message || err).split("\n")[0] });
      console.error(`FAIL ${s.name}: ${err.message}`);
    }
  }
} finally {
  await browser.close();
}

const lines = [
  "# Merchant web — what it looks like today",
  "",
  `Captured ${new Date().toISOString().slice(0, 10)} by \`tools/parity/shoot-merchant-current.mjs\` at the tablet's 1024 width (2× pixels; 680 tall, or taller where the page scrolls, so each screen is shown whole), with fake data (no real backend).`,
  "Made as the input for a redesign in Claude Design: drop these PNGs into a Claude Design chat.",
  tilesStubbed ? "\nMap tiles are drawn as a plain grey stand-in (OpenStreetMap was unreachable when these were captured)." : "",
  "",
];
let group = "";
for (const d of done) {
  if (d.group !== group) {
    group = d.group;
    lines.push(`## ${group}`, "");
  }
  lines.push(d.file ? `### ${d.title}\n\n\`${d.path}\`\n\n![${d.title}](${d.file})\n` : `### ${d.title}\n\n\`${d.path}\` — not captured: ${d.error}\n`);
}
await writeFile(join(OUT, "README.md"), lines.join("\n"));
console.log(`${done.filter((d) => d.file).length}/${done.length} screens in ${OUT}`);
