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

Actions → **Deploy customer web (Cloudflare)** → Run workflow (main). It builds, deploys and smoke-tests
(`apps/customer-web/smoke.sh`). The first deploy creates the `app.lyniago.com` DNS record and certificate;
the smoke test waits up to ~5 minutes for it. Merging to main deploys nothing.

**Rollback:** re-run the workflow on an earlier commit's code (revert on main first), or roll back the
`lyniago-customer-web` Worker to its previous version in the Cloudflare dashboard (Workers → Deployments).

## Build it locally

```bash
npm ci --omit=peer --prefix tools/web-runtime
cd apps/mobile
EXPO_PUBLIC_LYNIA_WEB=1 EXPO_NO_WEB_SETUP=1 EXPO_PUBLIC_API_URL=https://api.lyniago.com \
  npx expo export --platform web --output-dir ../customer-web/dist
node ../customer-web/finish-build.mjs ../customer-web/dist
```

## Checked live (2026-10-06)

First deploy (run #1) green. In Chromium at 360×720 on https://app.lyniago.com with the real key: the Google map of
Harare renders inside the Send screen with no CSP violations; a map tap places the pin; Places search returns
suggestions; the Maps JavaScript Geocoder names a Harare point ("Jason Moyo Avenue"). The Geocoding web service
returned REQUEST_DENIED for the referrer-restricted key, which is why pin → address uses the Geocoder.

## Not yet

- **Web push** (plan P5): needs a Web Push sender in the API.
- **Android "Get the app" banner** (W4): waits for the public Play listing; today it returns 404.
