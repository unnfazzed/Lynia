# Customer web app for iPhone users — plan

**Status:** PROPOSED (2026-10-06). Needs the owner decisions in §2 before the first build PR.

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

## 2. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| W1 | **Web address** | `app.lyniago.com` |
| W2 | **Hosting** | **Cloudflare Workers static assets**, like lyniago.com (`docs/WEBSITE.md`): free, fast in Zimbabwe, and the CI Cloudflare token already covers the `lyniago.com` zone. The alternative is a scale-to-zero Azure Container App like admin and merchant (~$0–5/month). |
| W3 | **Where sign-in is kept** | `localStorage` plus a strict Content-Security-Policy for v1. Moving to httpOnly cookies is safer against script injection but needs API changes; that's a later hardening step. |
| W4 | **Who can use it** | Everyone with the link (iPhone and any other browser). Optionally show Android visitors a "Get the app" banner. |
| W5 | **Add to Home Screen** | Yes: a web manifest and icon, so it opens full-screen like an app. That's also what iOS needs before web push (phase 5). |
| W6 | **Google key** | A new **LyniaGo Customer Web** key, restricted to the W1 address, with Maps JavaScript API, Places API (New) and Geocoding API. Enable Maps JavaScript API first. |

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
