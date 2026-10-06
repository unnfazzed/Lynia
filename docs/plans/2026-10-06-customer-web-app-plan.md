# Customer web app for iPhone users — plan

**Status:** APPROVED (2026-10-06). The owner decided W1–W5 in §2 the same day. **P1–P4 built** (2026-10-06); runbook: [`../CUSTOMER-WEB.md`](../CUSTOMER-WEB.md). P5 (web push) later.

**Why.** The iPhone app is still blocked on the Apple account (`docs/APP-STORE-SUBMISSION.md`), so iPhone users
can't order today. A mobile-optimised web build of the **customer** app lets them order from Safari now, and it
stays useful after the App Store launch (no install needed).

**What it is.** The same `apps/mobile` code, exported for the web with Expo (react-native-web), customer side only
(no rider mode, as on iPhone, D-41). Same screens, same API. Maps use Google's Maps JavaScript API (owner decision
D-80, 2026-10-06).

**Cost.** About $0–5/month at pilot volume (owner cost review, 2026-10-06): static hosting, the same API, and Google's
web map past its free monthly allowance.

---

## 1. What blocks a web build today

Survey of `apps/mobile` on 2026-10-06. There is no web setup at all yet (`app.config.ts:156` lists only
`android` and `ios`; `react-native-web` is not a dependency; no `*.web.ts(x)` file exists).

| # | Blocker | Where | Fix |
|---|---|---|---|
| B1 | **Sign-in can't be saved.** `expo-secure-store` does nothing on web, so `saveSession` throws and every login fails. About 20 other modules (saved places, cart, history, device id …) store data the same way. | `src/auth/session.ts:66-114`, `src/logic/*`, `src/net/*-store.ts` | One storage module with a `.web.ts` twin backed by `localStorage`; every caller uses it. |
| B2 | **Maps show nothing.** `react-native-maps` has no web version. | `src/ui/ComposeMap.tsx`, `MapPicker.tsx`, `LiveMap.tsx`, `orderflow/MerchantMap.tsx`, `orderflow/PinMap.tsx` | A web map (`*.web.tsx`) on the Maps JavaScript API with the same props and ref methods the screens use (`fitToCoordinates`, `animateToRegion`, `animateCamera`, Marker, Polyline). |
| B3 | **Rider mode switches on.** `riderModeAvailable()` only turns it off on iOS. | `src/rider-mode.ts:21-23` | Also off for `web`. Rider routes still bundle, so rider-only modules must at least load on web. |
| B4 | **The API refuses the browser.** Browser origins must be on the API's allow-list, and photo uploads go straight to Blob storage, which only allows the merchant site. | `release-azure.yml:516-533` (`CORS_EXTRA_ORIGINS`), `infra/azure/data.tf:154-160` | Add the web address to `CORS_EXTRA_ORIGINS` and to the Blob CORS rule (Terraform). |

Smaller items:

- **Address lookup without Places.** `expo-location`'s geocoding is empty or throws on web (`MapPicker.tsx:83`,
  `ComposeMap.tsx:276`, `src/logic/geocode.ts:187`). On web, use Google's Geocoding API instead.
- **Notifications.** Push sends through FCM, which can't deliver to a browser. **Off on web for v1** (the code is
  already best-effort); web push is phase 5.
- **Store links and updates.** `STORE_URL` points web users at Google Play, so set it to none on web. The
  force-update screen does not apply, because the web is always the latest build.
- **Warm-boot cache.** The React Query cache uses the file system and silently skips on web, so the web starts
  cold. That's acceptable for v1.
- **Sentry metro shim** (`metro-shims/sentry-browser-redirect.js`) is applied on every platform; check that it
  doesn't break Sentry's browser SDK on web.
- **Live tracking** (`src/realtime/socket.ts:37`) works in a browser once the address is on the allow-list.
- **Prescription photos** (pharmacy checkout) work through the browser's file picker once Blob CORS allows the address.

Already fine: `tel:` / WhatsApp / directions links, haptics (no-op), certificate pinning and OTA updates (native
only, not applicable), PostHog and Sentry (load lazily, key-gated).

## 2. Owner decisions — decided 2026-10-06

| # | Question | Decision |
|---|---|---|
| W1 | **Web address** | **`app.lyniago.com`** |
| W2 | **Hosting** | **Cloudflare Workers static assets**, like lyniago.com (`docs/WEBSITE.md`): free, fast in Zimbabwe, and the CI Cloudflare token already covers the `lyniago.com` zone. |
| W3 | **Where sign-in is kept** | **Browser storage (`localStorage`) now**, with a strict Content-Security-Policy. httpOnly cookies are a later hardening step (they need API changes). |
| W4 | **Who can use it** | **Anyone with the link**, in any browser. Android visitors see a small "Get the app" banner pointing to the Play app. The banner isn't drawn in any mock, so it gets a `docs/DESIGN-DEVIATIONS.md` entry when it's built (approved here). |
| W5 | **Add to Home Screen** | **Yes**: a web manifest and icon, so it opens full-screen like an app. That's also what iOS needs before web push (phase 5). |
| W6 | **Google key** | A new **LyniaGo Customer Web** key, restricted to `https://app.lyniago.com/*`, with Maps JavaScript API, Places API (New) and Geocoding API. Enable Maps JavaScript API first. (Owner step before P2.) |

## 3. Build phases (one PR each, merge on green)

| Phase | What lands | Owner step |
|---|---|---|
| **P1 Foundation** | `react-native-web`, the `web` platform and config; the storage module (B1); rider mode off on web (B3); no store link or force-update on web; push off on web; a CI job that runs `expo export --platform web` so the web build can't silently break. | — |
| **P2 Maps** | The web map on the Maps JavaScript API (B2) and Google geocoding on web. The look follows the same mocks as the app (pins, route line, sheet). | Create the W6 key. |
| **P3 API access** | The W1 address added to the API allow-list and the Blob CORS rule (B4); an API redeploy. | Approve the production deploy. |
| **P4 Hosting** | The Cloudflare Worker and a deploy workflow (dispatch, like the website); the web manifest and icons (W5); an iPhone Safari test pass at 360 and 320px wide. | Run the first deploy; test on an iPhone. |
| **P5 Web push** (later) | Web Push (VAPID) sender in the API, next to FCM and APNs; register from the installed home-screen app. | — |

Rough size: P1 and P2 are the bulk (about a day each); P3 and P4 are small.

## 4. Risks

| Risk | Mitigation |
|---|---|
| Sign-in tokens in `localStorage` can be read by injected script | Strict CSP (no inline script, allow-listed hosts only), no third-party scripts except Google Maps; cookie-based sessions as a follow-up |
| The browser Google key is visible in the page | Restricted to the W1 address and three APIs (W6) |
| Rider-only modules break the web bundle | P1's CI web export catches it; stub them on web if needed |
| iPhone Safari layout quirks (keyboard, safe areas, 100vh) | P4 device pass on a real iPhone; `Platform.OS === "ios"` keyboard branches take the Android path on web and need checking |
| No push on web until P5 | Customers keep the order screen open; live tracking works over the socket |

## 5. How P1 was built (2026-10-06)

- **The Android OTA fingerprint must not move.** It hashes the whole resolved app config and the pnpm install paths
  of every native module. Adding `react-native-web` to `apps/mobile` gives expo-image, expo-router, expo-system-ui
  and react-native-maps a new peer, pnpm renames their folders, and the hash moved (`e09dca91…` → `30e01dfd…`),
  which would have cut installed phones off from OTA updates. So:
  - `react-native-web` lives in **`tools/web-runtime`** (npm, outside the pnpm workspace, like `tools/parity`), and
    `apps/mobile/metro-shims/web-runtime.js` resolves it from there on web only.
  - The `web` platform and config exist only when `EXPO_PUBLIC_LYNIA_WEB=1` (`app.config.ts`).
  - Verified: the Android fingerprint is `e09dca91…` before and after P1.
- **Build:** `cd tools/web-runtime && npm ci --omit=peer`, then in `apps/mobile`:
  `EXPO_PUBLIC_LYNIA_WEB=1 EXPO_NO_WEB_SETUP=1 EXPO_PUBLIC_API_URL=https://api.lyniago.com npx expo export --platform web`.
  CI runs the same in the `mobile js bundle · size budget` job.
- **Web-only shims** (`apps/mobile/metro-shims/`): `secure-store-web.js` (browser storage, B1),
  `react-native-maps-web.js` (placeholder map until P2).
- **Customer-only switch:** `src/web-build.ts` `isCustomerWebBuild()`; rider mode, push, the store link, the
  force-update screen and the notifications primer step check it (ledger D-81).
- **Checked in Chromium** at 360×720 and 320×640: the app starts on C1 with no rider link. API calls are refused by
  CORS until P3.

## 6. How P2 was built (2026-10-06)

- **Maps:** `apps/mobile/metro-shims/react-native-maps-web.js` replaces react-native-maps on web with Google's Maps
  JavaScript API, speaking the subset the customer screens use (MapView with its camera ref methods, Marker /
  MarkerAnimated with the screens' own pin views, draggable pins, Polyline incl. dashes, Circle, AnimatedRegion).
  No screen changes. Camera and colour maths: `src/web/map-geometry.ts` (unit-tested).
- **Pin → address:** `metro-shims/expo-location-web.js` is the real expo-location with `reverseGeocodeAsync` /
  `geocodeAsync` answered by Google's Geocoding API (`src/web/geocode-google.ts`, unit-tested), so the seven
  screens that name a pin keep working unchanged.
- **Key:** one browser key for maps, Places and Geocoding: `EXPO_PUBLIC_GOOGLE_PLACES_KEY` at export time, from the
  repo variable **`CUSTOMER_WEB_GOOGLE_KEY`** (the "LyniaGo Customer Web" key, created by the owner 2026-10-06,
  restricted to `https://app.lyniago.com/*`). Wired into the deploy in P4.
- **No key, or a refused key:** the map is a plain grey panel (Google's own error panel is hidden) and no screen waits on it.
- **Checked in Chromium** at 360×720: the Send screen mounts the Google map in place; with a stand-in Google API, two
  taps place the Pickup and Drop-off pins, draw the route, frame the camera and enable Next.
- Android fingerprint unchanged (`e09dca91…`).

## 7. How P3 and P4 were built (2026-10-06)

- **P3 API access:** the owner set `CORS_EXTRA_ORIGINS=https://app.lyniago.com` and ran Release (Azure) #146; its log
  shows `CORS_ALLOWED_ORIGINS=https://merchant.lyniago.com,https://app.lyniago.com`, and a live preflight from that
  origin answers 204 with the origin allowed (a foreign origin still gets nothing). Blob CORS: `infra/azure` gains
  `customer_web_hostname` (production default `app.lyniago.com`) and the media account's CORS rule lists it; applied
  by the owner through Terraform apply (Azure).
- **P4 hosting:** `apps/customer-web/` (assets-only Worker on the `app.lyniago.com` Custom Domain, one-page fallback,
  `_headers` with a CSP built from Google's documented Maps allowlist, Add to Home Screen manifest and icons on the brand
  green, `finish-build.mjs`, `smoke.sh`) and `.github/workflows/deploy-customer-web.yml` (dispatch only, main only, the
  website's Cloudflare token). Checked in Chromium: under the CSP the app and Google's script load with no violations,
  and a control CSP does block Google, so the check is real.
- **W4 banner:** not built, because the Play listing is closed (404) until the public release.
