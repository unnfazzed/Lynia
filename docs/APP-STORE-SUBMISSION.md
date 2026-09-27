# App Store (iOS) submission — step-by-step + ledger

> **Status 2026-09-27: not started — LyniaGo has never been built for iOS.** `apps/mobile/app.config.ts`
> has no `ios` block, `apps/mobile/eas.json` has no iOS build or submit profile, and all three EAS
> workflows hardcode `--platform android`. This is the iOS twin of
> [`PLAY-STORE-SUBMISSION.md`](./PLAY-STORE-SUBMISSION.md) (**PSS** below): the path to a first App Store
> release, the finding behind each step (verified against this repo at `bca4a81`, or against a dated
> primary source listed in §9), and — from the first iOS build on — the ledger of every build and
> submission attempt (§10).
>
> **Owner tags:** **[F]** founder-only (Apple accounts, consoles, decisions) · **[C]** a Claude session
> can do it in a PR. **UNVERIFIED** marks anything no source could confirm.

## 0. The short version

1. **[F] Start Apple enrollment now — it is the long pole** (§2). An *organization* account needs a
   registered legal entity, a D-U-N-S number, a working website on the company's domain and a work
   email on that domain. The repo records none of the four.
2. **[F] Make the calls in §1** — Expo SDK path, rider live location on iOS, push transport,
   availability, what a reviewer's test order does.
3. **[C] Prove the toolchain** (§3 B1). Since **2026-04-28** App Store Connect only accepts builds made
   with **Xcode 26**; this app's Expo SDK 52 defaults to an **Xcode 16.2** EAS image, and SDK 52 on
   Xcode 26 is untested anywhere. A simulator build proves it without an Apple account.
4. **[C] Engineering PRs** (§3) — the `ios` config, push via APNs, iOS behaviour fixes, legal/support
   pages, iOS lanes in the EAS workflows. **Land the `ios` config together with the next Android store
   build** (B11): it moves the Android OTA fingerprint too.
5. **[F] One-time signing setup** (§2 A6) — `eas credentials -p ios` from any computer; CI cannot create
   an iOS distribution certificate.
6. **[C+F] First TestFlight build + an iPhone device pass** (§4). The device pass is the exit gate.
7. **[F, C drafts] Listing** (§5) — Apple-size screenshots, privacy labels, age rating, review notes and
   the demo login.
8. **[F] Submit for review → release manually** (§6, §7).

## 1. Decisions only the founder can make

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| D1 | Enroll as **Organization** or Individual | **Organization** | Guideline 5.1.1(ix): apps in financial services, or that "require sensitive user information" (KYC ID photos, a stored-value wallet), "should be submitted by a legal entity that provides the services, and not by an individual developer". An individual account also shows a personal name as the seller. The Play account looks personal (PSS 1696-1700 — the mandatory closed test applies to personal accounts). |
| D2 | Expo SDK for iOS | **Upgrade to SDK 54 first** — or ship on SDK 52 if the B1 compile proof passes and speed matters more | SDK 52 needs a pinned Xcode 26.0–26.2 image and is untested there; SDK 54 is the last SDK with the legacy architecture this app runs, defaults to Xcode 26, and targets Android API 36, which Play has required since 2026-08-31 (§8). The iOS 27 SDK becomes mandatory in April 2027, so SDK 52 has ~6 months of iOS runway at best. |
| D3 | Rider live location while navigating, on iOS | **Ask riders for "Always" location on iOS, only when a job goes active** | On iOS, `expo-location@18.0.10`'s `startLocationUpdatesAsync` requires **"Always"** authorization *and* `UIBackgroundModes: location` (`ios/LocationModule.swift:165-178`, `ios/Requesters/EXBackgroundLocationPermissionRequester.m:126-154`: "granted" is only `kCLAuthorizationStatusAuthorizedAlways`). The app asks for While-In-Use only, so on iOS the task silently no-ops (`src/realtime/background-location-task.ts:13-15`) — yet `src/ui/rider/JobDetailsCard.tsx:122` tells riders "Your live location keeps sharing with the customer while you navigate." Foreground-only on iOS instead means changing that drawn copy (a `DESIGN-DEVIATIONS.md` entry). |
| D4 | How iOS push is delivered | **Server-side APNs adapter** (no app change) | The app already registers the raw APNs token with `platform: "ios"` (`src/push/push.ts:86,96`); the API sends every token through FCM (`apps/api/src/adapters/push/fcm.push.ts`), which cannot deliver to an APNs token. Expo push tokens need client + server changes; the Firebase iOS SDK is the REL-03 build breaker. |
| D5 | Where the app is available | **Zimbabwe only** | App Store Connect defaults to every storefront. Distributing in the EU makes an organization a DSA "trader" whose address, phone and email are verified and published; not distributing there → declare non-trader. Zimbabwe is an App Store storefront (TestFlight too). |
| D6 | iPhone only? | **Yes** (`supportsTablet: false`) | No iPad screenshots needed. Reviewers may still run it on iPad in compatibility mode (2.4.1) — see the `tel:` item in B7. |
| D7 | Bundle ID | **`zw.co.lynia`** (same as the Android package) | Permanent once the App Store Connect record exists. |
| D8 | What a reviewer's test order does | **Mark demo-account orders as test server-side** (never broadcast to real riders, never sent to a real restaurant), or brief ops to watch and cancel | The demo login is a normal customer (`auth.service.ts:448-452`). A parcel request with pins inside the Harare corridor goes to real online riders; restaurants are listed regardless of location (`merchant.service.ts:399-429`), so a food order reaches a real pilot restaurant. Play review had the same exposure. |
| D9 | Account deletion: 30-day grace or immediate? | Owner call | The in-app final step (drawn in the mock, `screens-shipped.jsx:361`) promises "permanently deleted after 30 days … Sign back in within 30 days and the deletion is cancelled"; `PrivacyService.eraseAccount` anonymises **immediately** and the public page says "Deletion happens immediately" (`legal.content.ts:520-521`). Apple accepts either (5.1.1(v)), but the app must describe what actually happens. |
| D10 | Permission-primer button "Allow location" (`app/permissions.tsx:110`) | **"Continue"** — needs a `DESIGN-DEVIATIONS.md` entry, the mock draws "Allow location" | A custom pre-permission button worded "Allow" is a recurring App Review 5.1.1 rejection (a reviewer pattern, not guideline text). |

## 2. Phase A — Apple accounts [F]

- **A1. Legal entity + D-U-N-S.** Apple enrolls legal entities only — "We do not accept DBAs, fictitious
  businesses, trade names, or branches." D-U-N-S is free from Dun & Bradstreet via Apple's lookup tool;
  allow up to 5 business days, then up to 2 for Apple to receive it. Zimbabwe turnaround: **UNVERIFIED**.
  The repo has no D-U-N-S, registration number or registered address on record (PSS 1674-1676 still
  lists "registered company name, registration number and address" as open).
- **A2. Website + work email on the company domain.** Apple: the website must be "publicly available and
  functional … Links to social media webpages or websites that contain minimal content … won't be
  accepted", and the enrolling email should be on the organization's domain. Today neither
  `lyniago.com` nor `lyniafinance.com` serves a site (PSS 1260), and `lyniafinance.com` has no mail
  hosting (`GCP-BILLING-DOMAIN-SETUP.md`). [C] can build a small site if wanted.
- **A3. Enroll** in the Apple Developer Program as an Organization — USD 99/year; an Apple ID with 2FA;
  the enrolling person must have authority to bind the company. The US Zimbabwe sanctions program ended
  2024-03-04; whether Apple's enrollment flow supports Zimbabwe is **UNVERIFIED** until tried.
- **A4. Create the App Store Connect app record** — on the website only (Apple's API cannot create
  apps). Platform iOS · Name `LyniaGo` (must be unique store-wide; reserve early) · Primary language
  English (U.K.) (Play is en-GB) · Bundle ID `zw.co.lynia` · SKU e.g. `lyniago-ios`. Record the app's
  **Apple ID (`ascAppId`)** and the **Team ID** — both go into `eas.json` (B10).
- **A5. Keys.**
  - **App Store Connect API key** (Users and Access → Integrations; Expo's guide uses the Admin role) →
    stored on EAS for `eas submit`; it also lets non-interactive builds repair provisioning profiles.
  - **APNs auth key (.p8)** (Certificates, Identifiers & Profiles → Keys → Apple Push Notifications
    service). Downloadable once → Azure Key Vault for the API, with its Key ID and the Team ID (B5).
- **A6. One-time signing credentials — CI cannot create them.** `eas build --non-interactive` only reuses
  an existing distribution certificate ("Credentials are not set up. Run this command again in
  interactive mode.") and silently skips push-key setup. Run once, from any computer (macOS not
  required), as Account Holder or Admin: `npx eas-cli@latest credentials -p ios` → distribution
  certificate + App Store provisioning profile + the submission API key.
- **A7. Compliance screens.** A free app with no in-app purchase needs no Paid Apps agreement, banking
  or tax forms. DSA trader status: declare **non-trader** with non-EU availability (D5).

## 3. Phase B — engineering [C]

### B1. Toolchain — Xcode 26 and the Expo SDK (D2)

- **Rule:** since 2026-04-28, "Apps uploaded to App Store Connect must be built with Xcode 26 or later
  using an SDK for iOS 26". The iOS 27 SDK is required from April 2027 (exact day not announced).
- **SDK 52 as-is fails upload:** with no `image`, EAS resolves SDK 52 to `macos-sequoia-15.3-xcode-16.2`.
- **`"image": "latest"` fails to compile:** it is Xcode 26.6, and Xcode ≥ 26.4 rejects the fmt 11.0.2
  bundled by RN 0.76.9 ("Call to consteval function … is not a constant expression"; the fmt 12.1.0
  fix landed only on RN 0.83+, and 0.76.9 is the last 0.76 release).
- **SDK 52 therefore needs `ios.image` pinned to `macos-sequoia-15.6-xcode-26.2`** (or 26.1 / 26.0).
  Expo makes no statement either way about SDK 52 on those images — **UNVERIFIED**.
- **Cheapest proof:** an iOS **simulator** build compiles the same native code and needs no Apple
  account — a profile with `"ios": { "simulator": true, "image": "macos-sequoia-15.6-xcode-26.2" }`,
  dispatched from a branch so `main`'s fingerprint doesn't move (B11). The Free plan's 15 iOS
  builds/month are separate from the 15 Android.
- **SDK 54** is the last SDK with the legacy architecture (SDK 55 removed `newArchEnabled`), defaults to
  Xcode 26.0 and targets Android API 36. This app must stay on the legacy architecture (MOB-BOOT-04),
  so an upgrade stops at 54 — and follows the MOB-BOOT-04 protocol: a sideloaded cold-start smoke on a
  real device before any EAS/Play dispatch.
- **Liquid Glass:** building with the iOS 26 SDK restyles native UIKit controls (alerts, action sheets,
  switches, pickers, keyboard). Most of this UI is JS-drawn, but native alerts will change.
  `UIDesignRequiresCompatibility: true` opts out temporarily and is ignored once built with the iOS 27
  SDK — a parity decision, not a default.

### B2. The `ios` block in `app.config.ts`

```ts
ios: {
  bundleIdentifier: "zw.co.lynia",
  supportsTablet: false,
  icon: "./assets/icon-ios.png",              // B8: opaque, full-bleed 1024×1024
  config: { usesNonExemptEncryption: false },   // HTTPS + OS crypto only → no per-build export question
  privacyManifests: { NSPrivacyAccessedAPITypes: [/* table below */] },
},
```

`buildNumber` stays EAS-managed (`appVersionSource: "remote"` + `autoIncrement`) — don't add one.
Encryption: the app bundles no crypto library; TLS pinning (when armed) uses iOS's own
`NSPinnedDomains`. SDK 52 prebuild writes **no** app-level `PrivacyInfo.xcprivacy` unless
`privacyManifests` is set, and Apple rejects uploads that don't declare required-reason APIs
(ITMS-91053):

| Required-reason API | Reasons | Used by |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | RN core, expo-constants, expo-notifications |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` | RN core, expo-file-system, expo-application |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | RN core |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` | expo-file-system |

### B3. Permission strings (App Review reads every one)

| Info.plist key | Today | Needed |
|---|---|---|
| `NSLocationWhenInUseUsageDescription` | "LyniaGo uses your location to set the pickup point." (`app.config.ts:260-274`) | Also cover the rider side: nearby jobs, navigation, and the rider's live position shared with the customer during a delivery. |
| `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription` | expo-location's generic default, "Allow $(PRODUCT_NAME) to access your location" (always written) | Specific text if D3 = Always: live position shared with the customer only during an active delivery. |
| `NSCameraUsageDescription` | ID/profile photo only (`app.config.ts:276-281`) | Also parcel pickup photos and non-delivery proof (`src/ui/rider/PickupChecklist.tsx`, `src/ui/rider/UndeliveredSheet.tsx`). |
| `NSPhotoLibraryUsageDescription` | ID/profile photo | OK. |
| `NSMicrophoneUsageDescription` | expo-image-picker's generic default | Remove (`microphonePermission: false`) unless Didit's liveness WebView asks for audio — check on a device first. This also drops an unused `RECORD_AUDIO` from the Android manifest. |

### B4. Rider background location (D3)

If "Always": expo-location plugin `isIosBackgroundLocationEnabled: true` plus the Always strings;
call `requestBackgroundPermissionsAsync()` on iOS only when a job goes active — never at onboarding
(5.1.2(i)); keep `showsBackgroundLocationIndicator: true`; fall back to today's foreground-only stream
if refused. The review notes must justify it (2.5.4 — a Dec 2024 rejection called driver tracking
"employee tracking"; frame it as the customer's live tracking and ETA). If foreground-only: change the
`JobDetailsCard.tsx:122` promise on iOS under a deviation entry.

### B5. iOS push (D4) — API only

- `ApnsPush` adapter: HTTP/2 to `api.push.apple.com`, token auth with the `.p8`. Env: `APNS_KEY_ID`,
  `APNS_TEAM_ID`, `APNS_KEY` (Key Vault), `APNS_TOPIC=zw.co.lynia`, a sandbox flag.
- Route by the stored `DeviceToken.platform` (`schema.prisma:278`): `NotificationsService.send()`
  (`notifications.service.ts:404-444`) selects only `token`/`profileId` today and hands everything to
  FCM. `ios` → APNs, everything else (including null) → FCM.
- Reuse the ttl → `apns-expiration` and collapse → `apns-collapse-id` mapping `buildFcmMessage` already
  has; prune on APNs `410 Unregistered` / `400 BadDeviceToken`.
- Latent bug either way: an iOS token sent to FCM fails with a code outside `DEAD_TOKEN_CODES`
  (`fcm.push.ts:8-14`), so it is never pruned and fails on every send.
- No app change. The `aps-environment` entitlement comes from expo-notifications (default
  `development`) — confirm the exported IPA carries `production`.

### B6. Store URL and force-update

`extra.storeUrl` defaults to the **Play** URL on every platform (`app.config.ts:396`), so
`app/force-update.tsx` sends iPhone users to Google Play. Choose the URL by `Platform.OS` in
`src/config.ts` (`https://apps.apple.com/app/id<ascAppId>`) — JS-only; don't edit `extra`, it is a
fingerprint input. The server's single `MIN_SUPPORTED_APP_VERSION` (`health.controller.ts:38`) covers
both platforms: make it per-platform before the first iOS release, or an Android-driven bump locks
iOS users out with no build to update to.

### B7. iOS behaviour fixes (code sweep; none reproduced on a device yet)

- **Keyboard over inputs:** three bottom sheets with text inputs have no `KeyboardAvoidingView`
  (iOS doesn't resize the window for the keyboard): `src/ui/food/CartNoteSheet.tsx`,
  `src/ui/food/ItemSheet.tsx`, `src/ui/safety.tsx`.
- **No way to close the number pad:** phone/number pads have no return key and nothing dismisses the
  keyboard (`app/phone.view.tsx`, `app/verify.tsx`). Check the Continue button stays reachable on a
  small iPhone — a stuck sign-in screen is an instant 2.1 rejection.
- **KYC fallback never completes:** `WebBrowser.openAuthSessionAsync(url)` with no redirect URL
  (`src/kyc/verify.ts:116`) can never return `success` on iOS, so the rider lands on the "unfinished"
  wall. Pass the return URL. The primary WebView lane has the iOS media props.
- **Haptics are long buzzes:** core `Vibration` (`src/ui/haptics.ts:68`) ignores durations on iOS, so
  each of the 20 `haptic()` calls is a full buzz. Skip on iOS, or adopt `expo-haptics` (a native
  dependency → rides the next store build).
- **`tel:` buttons fail silently** where there is no phone app (iPad compatibility-mode review): every
  `Linking.openURL("tel:…")` is fire-and-forget. Add a catch with a copy-the-number fallback.
- **Unseen layouts:** core `SafeAreaView` only pads on iOS (`app/phone.tsx`, `app/help/index.tsx`,
  `app/role.tsx`, `app/onboarding.tsx`, `app/notifications/index.tsx`); `src/ui/BottomSheet.tsx` and
  `src/ui/home/LocationSheet.tsx` have no home-indicator inset.
- **Keychain survives uninstall on iOS:** device id, session and onboarding flags persist across a
  reinstall (`src/auth/session.ts:52-55` assumes they don't). Decide whether a reinstall signs out.
- **Not a bug:** `textContentType="oneTimeCode"` is set, but production OTP is WhatsApp-only
  (`env.ts:166`, `release-azure.yml:459-466`), which iOS Security Code AutoFill doesn't read.

### B8. App icon

`apps/mobile/assets/icon.png` is byte-identical to the kit's `lyniago-icon-1024.png`: a rounded tile with
**transparent corners**. Expo's iOS icon step flattens transparency onto white
(`@expo/prebuild-config@8.2.0` `withIosIcons`: `removeTransparency`, `#ffffff`), so the icon would show
white corners inside iOS's own mask, and Apple wants "no rounded corners or other transparent pixels".
iOS needs an opaque, square, full-bleed 1024 master (the kit SVG is the same tile with `rx="32"`).
Under the design-freeze rule, request it from the design tool and log it in `DESIGN-DEVIATIONS.md` —
don't edit `packages/design/**`.

### B9. Legal and support pages (API)

- The privacy notice and deletion page describe "the LyniaGo Android app" and "Android package
  zw.co.lynia" (`legal.content.ts:311, 355, 510`), say maps are "rendered by Google Maps Platform"
  (`:234-235`; iOS renders Apple Maps, Places search is still Google), and describe the persistent
  Android notification (`:138`, `:408-412`). Make them platform-neutral, add Apple (APNs) as a push
  processor with B5, and update the assertions pinned in `legal.content.spec.ts`.
- **The Support URL is a required field and nothing can fill it today.** Add a public
  `/legal/support` page (contact, WhatsApp help line, hours) and make sure the address it lists
  receives mail — `support@lyniafinance.com` likely has no mailbox (`GCP-BILLING-DOMAIN-SETUP.md`).
- Terms are optional: Apple's standard EULA applies when none is supplied.

### B10. EAS profiles and CI lanes (all Android-only today)

- `eas.json`: iOS options on `preview`/`closed`/`production` (plus the pinned `image` if D2 = SDK 52), a
  `simulator` profile for the compile proof, and `submit.<profile>.ios.ascAppId` (+ `appleTeamId`).
- `mobile-release.yml`: add a `platform` input (`android` | `ios`), keep it explicit. iOS auto-submit
  lands in TestFlight; the App Store release is a separate console step.
- `mobile-submit.yml`: an iOS path (a TestFlight upload; iOS has no track).
- `eas-build-status.yml`: list iOS builds and read `iosConfig` for submissions.
- `mobile-ota.yml`: its fingerprint preflight runs for Android only (`--platform android`), while
  `eas update` publishes both platforms. Add the iOS preflight once an iOS binary exists.

### B11. Fingerprint sequencing — ship the `ios` config with the next Android build

Verified in `@expo/fingerprint@0.11.11` (`build/sourcer/Expo.js`, `normalizeExpoConfig`): the whole
resolved config — `ios` block included — is hashed as one `expoConfig` source for every platform.
Adding `ios`, or changing a shared plugin option (`microphonePermission`,
`isIosBackgroundLocationEnabled`), moves the **Android** runtimeVersion too. OTAs published from `main`
then stop matching the Android binary testers have (0.50.0, versionCode 37) until the next Android store
build ships. Merge the `ios` config with the next Android store build — the API-36 build (§8) is the
natural carrier. JS-only and API-only items (B5, B6, B7 JS parts, B9) can land any time.

## 4. Phase C — first build, TestFlight, device pass

- **C1. Compile proof** — simulator build (B1). No Apple account; 1 of the 15 free iOS builds.
- **C2. First signed build** — after A4–A6 and B2/B10: `mobile-release.yml` with `platform: ios`,
  profile `closed`, auto-submit → App Store Connect → TestFlight (processing takes minutes).
- **C3. Internal TestFlight** — up to 100 App Store Connect users, no review: the founder plus an
  iPhone tester in Harare.
- **C4. iPhone device pass — the exit gate.** A green build is not a working app (PSS 267-269). Run
  `QA-DEVICE-CHECKLIST.md` on an iPhone and add an iOS section: cold start and splash, WhatsApp OTP
  sign-in, send a parcel, a food order, rider KYC (WebView camera), a rider job with background
  location (D3), push arriving (after B5), the B7 items, a Sentry event with a symbolicated stack
  (dSYM upload).
- **C5. Optional external TestFlight** — up to 10,000 testers. The first build goes through Beta App
  Review and needs a beta description, feedback email and the demo account.

## 5. Phase D — the App Store Connect listing [F enters, C drafts]

**Metadata**

| Field | Value / source |
|---|---|
| Name (≤ 30) | `LyniaGo` |
| Subtitle (≤ 30) | New for iOS — owner to approve. |
| Description (≤ 4000) | From PSS §2, updated: drop the stale "Go online" (the rider toggle was removed — PSS 528-529), add food ordering (4 of the 6 current screenshots are food), unwrap the hard line breaks. Never reuse `LISTING-COPY.md`'s "Light on data, made for any Android phone" (2.3.10). |
| Keywords (≤ 100 chars) | New — e.g. delivery, courier, parcel, motorbike, food, Harare, Zimbabwe. |
| Support URL | The new `/legal/support` page (B9). |
| Privacy Policy URL | `https://api.lyniago.com/legal/privacy` (after B9). |
| Category | Primary Food & Drink or Business, secondary Lifestyle — owner call (Play uses Maps & Navigation). |
| Copyright | `2026 <registered company name>` (A1). |

**Screenshots.** One iPhone set: **6.9"** (1320×2868, 1290×2796 or 1260×2736) or **6.5"** (1284×2778
or 1242×2688); 1–10 images, PNG/JPEG, **no alpha channel**. None of the Play assets fit: they are
1080×1920, every PNG carries an alpha channel, the 10" set has a fake Android-style status bar, and
`05-send-parcel` shows desktop scrollbar artifacts. Re-render from the design tool's store export lab at
Apple sizes, or capture from the iOS simulator. Put them in `store-assets/app-store/`, never under
`packages/design/**`. No Android devices, bars or names (2.3.10). App previews are optional.

**App Privacy labels** (from the Play Data-safety table, PSS 1349-1380). Nothing is used for tracking,
so no App Tracking Transparency prompt is needed.

| Apple data type | Linked to user | Purposes | Notes |
|---|---|---|---|
| Contact Info — Name, Phone Number | Yes | App Functionality | Shared only with that delivery's counterparty. |
| Contact Info — Email Address | Yes | App Functionality | Optional in-app. |
| Contact Info — Physical Address | Yes | App Functionality | Pickup/drop-off addresses — not declared on Play; decide. |
| Location — Precise, Coarse | Yes | App Functionality | |
| Identifiers — User ID, Device ID | Yes | App Functionality | The device id is a random Keychain UUID, not IDFA/IDFV. |
| User Content — Photos or Videos | Yes | App Functionality, fraud prevention | ID document + selfie via Didit (riders), parcel photos. |
| Sensitive Info — biometric | Yes | Fraud prevention | Didit returns a face-match score (`apps/api/src/kyc/didit.ts:68`) — confirm against Didit's data sheet. |
| Financial Info — Other Financial Info | Yes | App Functionality | Rider mobile-money number; restaurant payment reference. |
| Purchases — Purchase History | Yes | App Functionality | Food/shop orders; rider wallet ledger. |
| User Content — Other User Content | Yes | App Functionality | Notes, ratings, reports. |
| Usage Data — Product Interaction | No | Analytics | PostHog screen views, autocapture off, no `identify` call. |
| Diagnostics — Crash Data, Performance Data | No | Analytics | Sentry with `sendDefaultPii: false` and no `setUser`; RUM to the app's own API. |

**Age rating.** Answer the new questionnaire (4+/9+/13+/16+/18+ tiers; the social-media capability
questions have been required since September 2026). There is no alcohol, tobacco or drugs today (the
Pharmacy tile is "soon" only); users interact (ratings, reports, calls) and location is shared. Then
**override to 18+**, matching the privacy notice's "not intended for anyone under 18" (Play targets 18+
too).

**App Review information.**

- **Sign-in:** the demo phone as username and the fixed code as password. The mechanism exists
  (`DEMO_OTP_PHONE` + `DEMO_OTP_CODE`, allowed in production, customer-only). It must be armed on
  Azure (`DEMO_ACCOUNT_ENABLED` + the Key Vault pair — PSS §7.1's `gcloud` commands are stale) with a
  reserved number that is not the ops SOS line. It must not expire.
- **Rider flows** can't be exercised by a reviewer: KYC needs a real ID, and going online needs device
  GPS inside the Harare corridor (`online-gate.ts:86`). Attach a screen recording instead.
- **Notes (draft):** LyniaGo is a parcel and food delivery marketplace that operates only in Harare,
  Zimbabwe. To test sending a parcel, set both pins inside Harare. Deliveries are paid in cash to the
  rider, outside the app; food is paid in cash or by mobile money directly to the restaurant —
  physical goods and services (3.1.3(e)). Riders prepay platform commission by mobile money for
  real-world delivery work; this is not digital content. Location in the background is used only
  during an active delivery, so the customer can follow the rider live. Plus whatever D8 decides about
  test orders.

**Pricing and availability.** Free; Zimbabwe only (D5). **Version release:** manual.

## 6. Phase E — submit; review risks to pre-empt

| Guideline | Exposure in this app | Pre-empt |
|---|---|---|
| 2.1 completeness / demo login | Everything is behind OTP sign-in | The demo login above, armed and non-expiring; rider-flow video. |
| 2.1 broken flows | The rider top-up always ends `expired` — nothing confirms it server-side (`PAYMENT-RAIL-OUTSTANDING.md:7-9`) | Customer-only demo can't reach it; still fix or hide it before an iOS release. |
| 3.1.1 vs 3.1.3(e) | Cash and mobile money; rider commission top-up | Physical goods/services must *not* use in-app purchase. Frame the top-up as prepaid commission; there is no Apple precedent either way (inDrive's driver top-up is the nearest analogue). |
| 5.1.1(v) account deletion | Exists: Settings → Delete account → `DELETE /auth/me` | Fix the D9 mismatch. |
| 5.1.1(v) login before non-account features | Restaurant browsing sits behind sign-in | Explain in notes. If rejected, allowing browsing before sign-in is a design change. |
| 5.1.1 purpose strings, primer wording | Generic defaults; "Allow location" | B3, D10. |
| 5.1.1(ix) legal entity | KYC ID photos + wallet | Organization account (D1). |
| 5.1.2(i) don't require permissions | Location and push both have skips ("Enter address manually", "Not now") | Keep the Always request job-scoped (B4). |
| 2.5.4 background location | Rider tracking | Active delivery only; notes + video. |
| 2.3.10 other platforms | Play assets and copy | New screenshots; no Android wording. |
| 4.8 Sign in with Apple | Phone OTP only → not required | Adding Google/Facebook sign-in later would trigger it. |
| 1.4.3 | Tobacco/vape sales are banned | Merchant menus are free text — keep them out. |

Apple reports 90% of submissions reviewed in under 24 hours. Answer rejections in the Resolution Center;
a metadata-only rejection is fixed in App Store Connect without a new build.

## 7. Phase F — after approval

- Release manually (phased release optional).
- Set the iOS store URL (B6) and per-platform minimum versions.
- From then on, `eas update` reaches both platforms; each has its own fingerprint runtimeVersion.
- Record every build and submission in §10. "Did it ship?" is answered by App Store Connect / the
  `eas-build-status.yml` recap, never inferred from `main` (CLAUDE.md, Expo/EAS section).

## 8. Side findings (not iOS, surfaced by this research)

- **Google Play API 36:** "Starting August 31, 2026: New apps and app updates must target Android 16
  (API level 36) or higher to be submitted" — an extension to **2026-11-01** can be requested from Play
  Console's Policy status page. The app targets 35 (`app.config.ts:344`). Build 37 (API 35) was
  accepted into Closed testing on 2026-09-27; PSS doesn't record why (an extension?). A third-party
  report says Play rejects API-35 uploads on testing tracks. **Request the extension now**; SDK 54
  targets 36.
- **Android push may be off too:** `PUSH_PROVIDER = "noop"` in `infra/azure/containerapps.tf:51`
  ("until the new Firebase credential exists"). The repo can't show whether the GitHub Variable has been
  flipped since.
- **OTP channel:** production is WhatsApp-only (`bird-verify.ts:12-22`); PSS §4.4 still says SMS.
- **Support mailbox:** `support@lyniafinance.com` is listed everywhere and likely has no mailbox.
- **Deletion copy vs behaviour:** see D9.

## 9. Sources (primary, fetched 2026-09-27 unless dated)

- Apple upcoming requirements: <https://developer.apple.com/news/upcoming-requirements/>;
  Xcode 26 rule announced 2026-02-03: <https://developer.apple.com/news/?id=ueeok6yw>; iOS 27 SDK from
  April 2027, 2026-09-09: <https://developer.apple.com/news/?id=k1mtkt1k>
- EAS build images: <https://docs.expo.dev/build-reference/infrastructure/>; Expo on Xcode 26 for
  SDK ≤ 53 (2026-04-27): <https://expo.dev/blog/app-store-connect-minimum-sdk-26>
- fmt/Xcode 26.4: <https://github.com/facebook/react-native/issues/55601>,
  <https://github.com/facebook/react-native/pull/56099>, <https://github.com/expo/expo/issues/44229>
- Legacy architecture: <https://expo.dev/changelog/sdk-54>, <https://expo.dev/changelog/sdk-55>
- EAS credentials in CI: <https://docs.expo.dev/build/building-on-ci/>,
  <https://docs.expo.dev/app-signing/managed-credentials/>, <https://docs.expo.dev/submit/ios/>;
  eas-cli `SetUpDistributionCertificate.ts` / `IosSubmitCommand.ts`
- Screenshots: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications>
- Privacy manifests: <https://docs.expo.dev/guides/apple-privacy/>,
  <https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api>
- Age ratings: <https://developer.apple.com/news/?id=ks775ehf> (2025-07-24),
  <https://developer.apple.com/news/?id=tlur8uvi> (2026-07-09)
- Storefronts: <https://support.apple.com/en-us/118205>
- Enrollment and D-U-N-S: <https://developer.apple.com/programs/enroll/>,
  <https://developer.apple.com/help/account/membership/D-U-N-S/>
- DSA trader status: <https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements>
- App Review Guidelines (updated 2026-06-08): <https://developer.apple.com/app-store/review/guidelines/>;
  account deletion: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>;
  background-location rejection (Dec 2024): <https://developer.apple.com/forums/thread/771202>
- EAS pricing: <https://expo.dev/pricing>, <https://docs.expo.dev/billing/plans/>
- Play target API: <https://support.google.com/googleplay/android-developer/answer/11926878>
- Package source read for B3/B4/B8/B11 (the lockfile's exact versions): `expo-location@18.0.10`,
  `expo-image-picker@16.0.6`, `expo-notifications@0.29.14`, `@expo/prebuild-config@8.2.0`,
  `@expo/fingerprint@0.11.11`.

## 10. Ledger — iOS build and submission attempts

Every EAS iOS build and every App Store Connect / TestFlight submission, newest last — the same
discipline as PSS: record the build id, the outcome and the failure class, never assume it happened.

| Date | Build / submission | Profile · image | Result | Failure class / notes |
|---|---|---|---|---|
| — | — | — | — | No iOS build has been attempted yet. |
