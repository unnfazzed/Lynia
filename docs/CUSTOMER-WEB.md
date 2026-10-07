# Customer web app — app.lyniago.com

The customer app in a browser, for iPhone users until the App Store release (and anyone without the app).
Plan and decisions: [`plans/2026-10-06-customer-web-app-plan.md`](./plans/2026-10-06-customer-web-app-plan.md).
Web-only differences from the phone app: ledger D-81 in [`DESIGN-DEVIATIONS.md`](./DESIGN-DEVIATIONS.md).

## What it is

- `apps/mobile`, exported for the web with `EXPO_PUBLIC_LYNIA_WEB=1` (customer-only; no rider mode, no push,
  no store links, no force-update). react-native-web comes from `tools/web-runtime`, outside the pnpm
  workspace, so the Android OTA fingerprint never moves.
- Maps: Google Maps JavaScript API; pin → address: the Maps JavaScript API's Geocoder (the Geocoding web
  service refuses website-restricted keys: "API keys with referer restrictions cannot be used with this API");
  search: Places API (New), which accepts them. One browser key.
- Hosting: an assets-only Cloudflare Worker (`apps/customer-web/wrangler.jsonc`), like lyniago.com. Free.
- `apps/customer-web/finish-build.mjs` adds the Add to Home Screen manifest and icons, the iPhone Home Screen
  tags, and `_headers` (CSP and caching) to the export.
- No zoom when typing: iPhone Safari zooms in on any text field under 16px (the app's fields are 15–17px, as
  drawn) and leaves the page zoomed past the screen. `public/ios-viewport.js` adds `maximum-scale=1` to the
  viewport on iOS only, which stops that zoom and keeps pinch-zoom (Safari ignores the limit for pinches).
  Android keeps the plain viewport, since it doesn't zoom on focus and would lose pinch-zoom.
- Text fields fit their row: a browser `<input>` keeps a built-in minimum width (~20 characters) that `flex: 1`
  can't shrink, so the phone-number field ran past a 320px screen and focusing it slid the page sideways (any
  browser, Android Chrome included). `finish-build.mjs` adds `input, textarea { min-width: 0 }`.

## One-time setup (owner)

1. **Google key** "LyniaGo Customer Web": Websites restriction `https://app.lyniago.com/*`; APIs: Maps
   JavaScript API, Places API (New), Geocoding API. Saved as the repo Variable `CUSTOMER_WEB_GOOGLE_KEY`. ✅ 2026-10-06
2. **API allow-list:** repo Variable `CORS_EXTRA_ORIGINS` = `https://app.lyniago.com`, then a Release (Azure)
   run. ✅ 2026-10-06 (run #146; live preflight from app.lyniago.com answers 204 with the origin allowed)
3. **Photo uploads (prescriptions):** Actions → **Terraform apply (Azure)** → environment `production`,
   action `apply`; approve the plan, read it (one change: the media storage account's CORS rule gains
   `https://app.lyniago.com`), approve the apply.
4. **Cloudflare:** nothing new. The lyniago.com website's `CLOUDFLARE_ACCOUNT_ID` Variable and
   `CLOUDFLARE_WORKERS_API_TOKEN` production secret cover `app.lyniago.com` too.

## Deploy

**Deploy customer web (Cloudflare)** starts by itself when a merge to main changes what the web is built
from (`apps/mobile` except tests, docs and the native folders, `packages/shared`, `apps/customer-web`,
`tools/web-runtime`, `pnpm-lock.yaml`), so a customer fix made for Android reaches the web as well (owner
decision 2026-10-06). It waits for the `production` approval, then builds, deploys and smoke-tests
(`apps/customer-web/smoke.sh`). If several merges land before you approve, the newest run replaces the older
ones and carries all of them. To redeploy by hand: Actions → Deploy customer web (Cloudflare) → Run workflow (main).

Shared code is fixed once for both. The web-only parts are not: the map
(`metro-shims/react-native-maps-web.js`), pin → address (`metro-shims/expo-location-web.js`,
`src/web/geocode-google.ts`) and sign-in storage (`metro-shims/secure-store-web.js`) need their own fix,
and code behind `Platform.OS === "android"` never runs on the web.

**Rollback:** re-run the workflow on an earlier commit's code (revert on main first), or roll back the
`lyniago-customer-web` Worker to its previous version in the Cloudflare dashboard (Workers → Deployments).

## Build it locally

```bash
npm ci --omit=peer --prefix tools/web-runtime
cd apps/mobile
export EXPO_PUBLIC_API_URL=https://api.lyniago.com   # the export AND finish-build (API preconnect) read it
EXPO_PUBLIC_LYNIA_WEB=1 EXPO_NO_WEB_SETUP=1 \
  npx expo export --platform web --output-dir ../customer-web/dist
node ../customer-web/finish-build.mjs ../customer-web/dist
```

## Checked live (2026-10-06)

First deploy (run #1) green. In Chromium at 360×720 on https://app.lyniago.com with the real key: the Google map of
Harare renders inside the Send screen with no CSP violations; a map tap places the pin; Places search returns
suggestions; the Maps JavaScript Geocoder names a Harare point ("Jason Moyo Avenue"). The Geocoding web service
returned REQUEST_DENIED for the referrer-restricted key, which is why pin → address uses the Geocoder.

## Offline and slow links

- **Offline shell** (`apps/customer-web/public/sw.js`, registered by `sw-register.js` after load). Pages are
  network-first: a deploy reaches everyone on their next visit, a slow link falls back to the saved page after
  4 s, and offline falls back at once. Before this an offline reload showed the browser's own
  `ERR_INTERNET_DISCONNECTED` page. Hashed bundles and `/assets/*` are cache-first. `finish-build.mjs` stamps
  each export's build id and precache list (entry bundle, the ~0.5 MB of fonts and images, the icons) into
  `sw.js`, so each deploy installs a new worker and drops the old bundles. Other origins (the API, Google Maps)
  are never cached. `sw.js` is served `no-cache`; `smoke.sh` checks that, and that it was stamped.
  **Kill switch:** deploy a `sw.js` whose install handler calls `self.registration.unregister()`.
- **Warm boot and saved order copies** use browser storage (`src/net/web-kv.ts`), since expo-file-system has no
  web implementation. Before, the query cache never restored on the web and the order screen's offline copy was
  never written. The national-ID redaction still runs before anything is stored, and sign-out clears both.
- **Network back:** the browser's `offline` event shows the offline strip at once, and `online` checks the API
  straight away instead of waiting out the backoff (`src/net/reachability-signals.ts`).

## Not yet

- **Web push** (plan P5): needs a Web Push sender in the API.
- **Android "Get the app" banner** (W4): waits for the public Play listing; today it returns 404.
