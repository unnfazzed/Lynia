# App Store (iOS) submission — step-by-step + ledger

> **Status 2026-09-27: engineering started — no signed iOS build yet.**
>
> **The chosen path:** a **customer-only iPhone app** (no rider mode, no ID/KYC), published by the
> organization **FortyoneX Studio (Private) Limited**, which owns the LyniaGo brand. That makes the
> App Store seller the company, not a person. Merchants keep using the merchant web dashboard.
>
> **What already exists:**
> - The iOS toolchain is **proven**. EAS build `7fdb60a9` compiled this app (Expo SDK 52 / RN 0.76.9)
>   on **Xcode 26.2**, which App Store uploads require (§3 B1). The app moved to SDK 54 for Android's
>   API 36 on 2026-09-28 (D2), so that proof has to be repeated on SDK 54.
> - The rider-free iPhone app is in code (D-41, §3 B3). It is inert until an iOS binary exists.
>
> This is the iOS twin of [`PLAY-STORE-SUBMISSION.md`](./PLAY-STORE-SUBMISSION.md) (**PSS** below). It
> covers:
> - the path to a first App Store release;
> - the finding behind each step, verified against this repo or a dated primary source (§9);
> - the ledger of every iOS build and submission (§10).
>
> **Owner tags:** **[F]** founder-only (Apple accounts, consoles, decisions) · **[C]** a Claude session
> can do it in a PR. **UNVERIFIED** marks anything no source could confirm.

## 0. The short version

1. **[F] Enroll FortyoneX Studio (Private) Limited as an Organization** (§2): D-U-N-S number, a real
   site on lyniago.com, an @lyniago.com email, then the USD 99 enrollment.
2. **[C] Engineering PRs** (§3):
   - **Done:** the iOS prebuild fix, the Xcode 26 proof, the rider-free iPhone app, the iOS store link,
     the APNs sender (inert until its key exists), the iPhone fixes a code sweep could find (B6), and
     the per-platform force-update minimum (B5).
   - **Merged 2026-09-28 (#959):** the Expo SDK 54 upgrade (Play's API 36). It reached Android testers
     the same day as v0.50.1 / vc 39. The iOS compile must still be re-proven on it (D2).
   - **Still to do:** the support page and legal wording, and the iOS workflow lanes.
   - **Also still to do:** the `ios` config plus the iOS `eas.json` profiles. These ship **together
     with the next Android store build**, because both move the Android OTA fingerprint (B9).
3. **[F] One-time signing setup** (§2 A6): `eas credentials -p ios` from any computer. CI cannot create
   an iOS distribution certificate.
4. **[C+F] First TestFlight build, then an iPhone device pass** (§4). The device pass is the exit gate.
5. **[F, C drafts] Listing** (§5): Apple-size screenshots, privacy labels, age rating, review notes and
   the demo login.
6. **[F] Submit for review, then release manually** (§6, §7).

## 1. Decisions

| # | Decision | State | Notes |
|---|---|---|---|
| D1 | Apple account type | **DECIDED 2026-09-27: Organization = FortyoneX Studio (Private) Limited** | The owner rejected an Individual account because it displays the person's legal name as the App Store seller. The organization owns the LyniaGo brand. Guideline 5.2.1 wants the seller to be the entity that offers the service; to satisfy it, the privacy page, support page, copyright line and review notes all say "LyniaGo is operated by FortyoneX Studio (Private) Limited". |
| D2 | Expo SDK for iOS | **2026-09-28: SDK 54**, merged as #959 together with Android's API-36 target (§8). It replaces the SDK 52 decision (ship with `ios.image` pinned to `macos-sequoia-15.6-xcode-26.2`, proven by build `7fdb60a9`). | SDK 52 needed that pin: its default image (Xcode 16.2) cannot upload, and Xcode ≥ 26.4 cannot compile RN 0.76.9's fmt. SDK 54 (React Native 0.81, the last SDK with the legacy architecture) defaults to an Xcode 26 image, but nothing has proven it compiles this app. **Re-prove the iOS build on SDK 54 before the first TestFlight build**, and keep the 26.2 pin until a build shows it can go. Runway: the iOS 27 SDK becomes mandatory in April 2027. |
| D3 | Rider mode on iOS | **DECIDED 2026-09-27: none.** Customer-only iPhone app, no national ID, no KYC (DESIGN-DEVIATIONS D-41) | Riders are on low-end Android handsets. This removes the rider "Always"-location permission, KYC, the commission-wallet review question and the rider demo video from the iOS path. |
| D4 | How iOS push is delivered | **DONE (code): server-side APNs adapter** (no app change); arming needs the A5 key (`docs/AZURE-OWNER-RUNBOOK.md` "iOS push") | The app registers the raw APNs token with `platform: "ios"` (`src/push/push.ts`). The API used to send every token through FCM (`apps/api/src/adapters/push/fcm.push.ts`), which cannot deliver to an APNs token. Customers need push for offers, arrival and delivery updates. |
| D5 | Where the app is available | **Recommended: Zimbabwe only** | Distributing in the EU makes the organization a DSA "trader", and Apple publishes its address, phone and email. With non-EU availability, declare non-trader. Zimbabwe is an App Store and TestFlight storefront. |
| D6 | iPhone only? | **Yes** (`supportsTablet: false`) | No iPad screenshots are needed. Reviewers may still run the app on iPad in compatibility mode (2.4.1); see the `tel:` item in B6. |
| D7 | Bundle ID | **`zw.co.lynia`** (same as the Android package) | Permanent once the App Store Connect record exists. |
| D8 | What a reviewer's test order does | **Recommended: mark demo-account orders as test server-side** | The demo login is a normal customer (`auth.service.ts:448-452`). A parcel request inside the Harare corridor goes to real online riders. Restaurants are listed regardless of location (`merchant.service.ts:399-429`), so a food order reaches a real pilot restaurant. |
| D9 | Account deletion: 30-day grace or immediate? | **DECIDED 2026-10-06: immediate** (owner; ledger D-78) | The in-app final step and the Privacy notice now say the account is erased straight away, matching the server (`PrivacyService.eraseAccount`) and the public page. Apple accepts either (5.1.1(v)). |
| D10 | Permission-primer button "Allow location" (`app/permissions.tsx:110`) | **OPEN, recommended: "Continue"** | A custom pre-permission button worded "Allow" is a recurring App Review 5.1.1 rejection (a reviewer pattern, not guideline text). The mock draws "Allow location", so the change needs a deviation entry. |

## 2. Phase A — Apple accounts [F]

- **A1. D-U-N-S for FortyoneX Studio (Private) Limited.**
  - Search Apple's D-U-N-S lookup first; registered companies often already have a number. If not,
    request one on the same page (free).
  - Give Dun & Bradstreet (D&B) the name **exactly** as on the certificate of incorporation, plus the
    registered address, a work email and phone, and **lyniago.com** as the website.
  - Allow up to 5 business days, plus 2 for Apple to receive it. D&B may phone or email for documents.
  - Zimbabwe turnaround: **UNVERIFIED**.
- **A2. Website and work email on the domain.**
  - The website must be "publicly available and functional". Social-media links or "minimal content"
    are rejected.
  - lyniago.com must be a real site that names the operator ("LyniaGo is operated by FortyoneX Studio
    (Private) Limited"). [C] can build it.
  - For the email, lyniago.com is a Cloudflare zone, so free Email Routing can forward e.g.
    you@lyniago.com to an existing inbox. Create the enrolling Apple ID with that address, with 2FA on.
- **A3. Enroll** in the Apple Developer Program as an Organization.
  - USD 99/year.
  - The enrolling person must be able to bind the company (a director).
  - Apple may phone to verify.
  - The US Zimbabwe sanctions program ended 2024-03-04. Whether Apple's flow supports Zimbabwe is
    **UNVERIFIED** until tried.
- **A4. Create the App Store Connect app record.** This is website-only; Apple's API cannot create apps.
  - Platform: iOS.
  - Name: `LyniaGo` (unique store-wide, so reserve it early).
  - Primary language: English (U.K.), matching Play's en-GB.
  - Bundle ID: `zw.co.lynia`.
  - SKU: e.g. `lyniago-ios`.
  - Record the app's **Apple ID (`ascAppId`)** and the **Team ID**. Both go into `eas.json` (B8).
- **A5. Keys.**
  - **App Store Connect API key** (Users and Access → Integrations; Expo's guide uses the Admin role).
    Store it on EAS for `eas submit`; it also lets non-interactive builds repair provisioning profiles.
  - **APNs auth key (.p8)** (Certificates, Identifiers & Profiles → Keys). It can be downloaded only
    once. Put it in Azure Key Vault for the API, together with its Key ID and the Team ID (B4).
- **A6. One-time signing credentials.** CI cannot create them:
  - `eas build --non-interactive` only reuses an existing distribution certificate ("Credentials are
    not set up. Run this command again in interactive mode.").
  - It silently skips push-key setup.
  - Fix: run `npx eas-cli@latest credentials -p ios` once, from any computer (macOS not required), as
    Account Holder or Admin.
- **A7. Compliance screens.**
  - A free app with no in-app purchase needs no Paid Apps agreement, banking or tax forms.
  - DSA trader status: declare **non-trader** with non-EU availability (D5).

## 3. Phase B — engineering [C]

### B1. Toolchain: DONE (2026-09-27)

- **Rule:** since 2026-04-28, "Apps uploaded to App Store Connect must be built with Xcode 26 or later
  using an SDK for iOS 26". The iOS 27 SDK is required from April 2027 (exact day not announced).
- **Proof:** EAS build `7fdb60a9` (profile `ios-simulator`) ran on the VM template
  `macos-sequoia-15.6-xcode-26.2` (Xcode 26.2, 17C52). It passed install, prebuild, pods, the
  expo-updates runtime version, the JS bundle and the Xcode build ("› Build Succeeded").
  - It built from temporary commit `1c9be6d`, which was reverted on its branch (B9).
  - A simulator build runs the same compiler as a device build; archiving and signing are the only
    untested parts, and the first TestFlight build (§4 C2) covers them.
- **Why the image is pinned:**
  - With no `image`, EAS resolves SDK 52 to `macos-sequoia-15.3-xcode-16.2`, which cannot upload.
  - `"image": "latest"` (Xcode 26.6) cannot compile RN 0.76.9. Xcode ≥ 26.4 rejects its bundled
    fmt 11.0.2 ("Call to consteval function … is not a constant expression"); the fmt 12.1.0 fix
    exists only on RN 0.83+.
- **iOS prebuild blocker, found and fixed on the way:** the root `package.json` override
  `"@xmldom/xmldom@<0.8.13": ">=0.8.13"` had no upper bound, so pnpm resolved @expo/plist to xmldom
  0.9.12. That version requires a `parseFromString` mimeType argument, so every iOS prebuild died in
  `withIosInfoPlistBaseMod`. Android never parses a plist, so no Android build noticed. It is now
  `^0.8.13` (0.8.15), which keeps the security floor and leaves the Android fingerprint unchanged.
- **Liquid Glass:** building with the iOS 26 SDK restyles native UIKit controls (alerts, action sheets,
  switches, pickers, keyboard). Most of this UI is drawn in JS, but native alerts will change.
  `UIDesignRequiresCompatibility: true` opts out temporarily and is ignored once built with the iOS 27
  SDK. This is a parity decision, not a default.

### B2. The `ios` block in `app.config.ts` (verified by a local prebuild; ships per B9)

```ts
ios: {
  bundleIdentifier: "zw.co.lynia",
  supportsTablet: false,
  icon: "./assets/icon-ios.png",              // B7: opaque, full-bleed 1024×1024
  config: { usesNonExemptEncryption: false },   // HTTPS + OS crypto only → no per-build export question
  privacyManifests: { NSPrivacyAccessedAPITypes: [/* table below */] },
},
```

`expo prebuild --platform ios` (run locally on Linux) generated the following:
- `TARGETED_DEVICE_FAMILY = "1"` (iPhone only) and deployment target 15.1.
- `ITSAppUsesNonExemptEncryption = false`.
- A `PrivacyInfo.xcprivacy` with all four API categories (table below).
- The `aps-environment` entitlement at `development`. Confirm that the exported IPA carries
  `production`.

`buildNumber` stays EAS-managed (`appVersionSource: "remote"` + `autoIncrement`).

| Required-reason API | Reasons | Used by |
|---|---|---|
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | RN core, expo-constants, expo-notifications |
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1`, `0A2A.1`, `3B52.1` | RN core, expo-file-system, expo-application |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | RN core |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1`, `85F4.1` | expo-file-system |

**Permission strings.** Every image-picker user is rider-only (`app/rider/become.tsx`,
`src/ui/rider/PickupChecklist.tsx`, `src/ui/rider/UndeliveredSheet.tsx`, `src/kyc/verify.ts`), so the
customer-only iPhone app never asks for the camera or photos. The keys must stay anyway: the linked
image-picker module needs them, and a missing purpose string is an ITMS-90683 upload error. They are
iOS-only strings, so fold these into the B9 change:
- Make the camera and photo strings neutral; today's mention "ID/profile photo for verification".
- Set `microphonePermission: false`. That also drops an unused `RECORD_AUDIO` from Android.
- Replace expo-location's generic Always strings. The app never shows them on iOS, but they are
  written anyway.

`expo-task-manager` auto-adds `UIBackgroundModes: fetch`, which this app does not use. It is harmless;
remove it with a small plugin only if review asks.

### B3. Customer-only iPhone app: DONE (2026-09-27, DESIGN-DEVIATIONS D-41)

Every gate reads `riderModeAvailable()` (`apps/mobile/src/rider-mode.ts`), which is false only on iOS.
On iPhone:
- There is no role fork: sign-in goes to the customer's permission priming (`src/logic/sign-in-route.ts`).
- The food-off onboarding deck has no "Earn as a rider" slide.
- Sign-up has no National ID field, and the PATCH omits `idNumber`, which the contract already makes
  optional.
- The Account tab has no rider row, and the online-rider pill, "Open your job" and `/profile`'s rider
  side are hidden.
- A saved rider role boots to `/home`, and rider push or notification-row taps open `/home`.
- `RiderRouteGate` sends any `/rider/*` or `/wallet/*` route home.

Android, and the react-native-web parity lane, are unchanged. The jest suite runs as iOS under
jest-expo, so `jest.setup.js` defaults the switch on and the iOS cases override it.

JS-only, so nothing moves the fingerprint (the Android fingerprint was measured before and after).

### B4. iOS push (D4) — API only: DONE in code, inert until armed

Built as `apps/api/src/adapters/push/apns.push.ts` and `routed.push.ts`. `selectPush` sends `ios`
tokens to APNs and everything else to FCM. It is armed by `APNS_KEY_ID` / `APNS_TEAM_ID` /
`APNS_PRIVATE_KEY`, independently of `PUSH_PROVIDER`, and the API refuses to boot on a partial set.
Until armed, iOS pushes are logged and skipped (no longer sent to FCM). To arm it, follow
`docs/AZURE-OWNER-RUNBOOK.md` "iOS push" once A5 exists. The design notes below are what it
implements:


- `ApnsPush` adapter: HTTP/2 to `api.push.apple.com`, token auth with the `.p8`. Env: `APNS_KEY_ID`,
  `APNS_TEAM_ID`, `APNS_KEY` (Key Vault), `APNS_TOPIC=zw.co.lynia`, and a sandbox flag.
- Route by the stored `DeviceToken.platform` (`schema.prisma:278`). Today `NotificationsService.send()`
  (`notifications.service.ts:404-444`) selects only `token`/`profileId` and hands everything to FCM.
  Route `ios` to APNs and everything else (including null) to FCM.
- Reuse the ttl → `apns-expiration` and collapse → `apns-collapse-id` mapping that `buildFcmMessage`
  already has. Prune on APNs `410 Unregistered` / `400 BadDeviceToken`.
- There is a latent bug either way: an iOS token sent to FCM fails with a code outside
  `DEAD_TOKEN_CODES` (`fcm.push.ts:8-14`). It is never pruned and fails on every send.

### B5. Store URL and force-update: DONE in code

- **Done:** `STORE_URL` is now per-platform (`src/config.ts` `storeUrlFor`).
  - iOS reads only `EXPO_PUBLIC_APP_STORE_URL`, and **never** the Play URL that
    `extra.storeUrl` defaults to.
  - Until the listing exists, the iOS "Update now" button hides.
  - Once the listing exists, set it (`https://apps.apple.com/app/id<ascAppId>`) in the EAS environment
    and ship it by OTA. It is a JS substitution, not a fingerprint input.
- **Done:** the force-update minimum is per-platform. The app asks `GET /app/version-gate?platform=…`;
  iPhones get `MIN_SUPPORTED_APP_VERSION_IOS`, and Android (plus every build that predates the
  parameter) keeps `MIN_SUPPORTED_APP_VERSION`. Both default to off. So an Android-driven bump no
  longer locks iPhone users out while their update waits on App Review. Raise the iPhone minimum only
  once that version is live on the App Store (`docs/LAUNCH-EXECUTION-RUNBOOK.md` "Force-update gate").

### B6. iOS behaviour fixes: the code sweep's fixes are DONE (JS only); the rest needs a device

**Done in code** (JS only, so no fingerprint change; still to confirm on an iPhone in C4):

- **Keyboard over inputs:** iOS lays the keyboard over a `<Modal>`, where Android's Modal window
  resizes. The three modal sheets with text fields now lift by the keyboard's height on iOS
  (`KeyboardAvoidingView`, `behavior="padding"`): `src/ui/food/CartNoteSheet.tsx`,
  `src/ui/food/ItemSheet.tsx` and the issue/report sheet in `src/ui/safety.tsx`.
- **Closing the number pad:** phone and number pads have no return key. The phone and code screens now
  close the keyboard on a tap outside the field (`src/ui/DismissKeyboardArea.tsx`). Check in C4 that
  Continue and Back stay reachable on a small iPhone; a stuck sign-in screen is an instant 2.1
  rejection.
- **Haptics:** core `Vibration` plays every iOS buzz as the same ~400ms vibration, and reads a
  pattern's entries as gaps. iOS now has its own mapping (`iosHapticPattern` in
  `src/ui/haptics.ts`): no cue for a tap, one buzz for notify, success and warning, and a separated
  double for SOS. `expo-haptics` would give real taptic cues, but it is native, so it would ship per B9.
- **`tel:` buttons:** the customer's Call buttons (the order screen and the live tracking card) go
  through `useDial` (`src/ui/useDial.ts`). Where the device can't place calls (an iPad in
  compatibility-mode review), it shows a toast naming the number instead of doing nothing. Rider
  screens don't ship on iOS (D3). The SOS sheet's buttons already show their numbers in their labels,
  and they sit in a Modal that a toast can't draw over.
- **Sign-up copy:** the intro line no longer promises an "ID" on an iPhone, which asks for none (D-41).

**Still open:**

- **Unseen layouts:**
  - Core `SafeAreaView` only pads on iOS (`app/phone.tsx`, `app/help/index.tsx`, `app/onboarding.tsx`,
    `app/notifications/index.tsx`).
  - `src/ui/BottomSheet.tsx` and `src/ui/home/LocationSheet.tsx` have no home-indicator inset.
- **Keychain survives uninstall on iOS:** the device id, session and onboarding flags persist across a
  reinstall, but `src/auth/session.ts:52-55` assumes they don't. Decide whether a reinstall should sign
  the user out.
- **Not a bug:** production OTP is WhatsApp-only, which iOS Security Code AutoFill doesn't read.

### B7. App icon

- **The problem:** `apps/mobile/assets/icon.png` is byte-identical to the kit's `lyniago-icon-1024.png`,
  a rounded tile with **transparent corners**. The local prebuild confirmed Expo flattens it onto
  white, so the generated `App-Icon-1024x1024@1x.png` is RGB and its corner pixel is `(255,255,255)`.
  iOS then shows white corners inside its own mask.
- **What iOS needs:** an opaque, square, full-bleed 1024 master. The kit SVG is the same tile with
  `rx="32"`.
- **What to do:** request that master from the design tool, and log it as an UPSTREAM entry in
  `DESIGN-DEVIATIONS.md`. Don't edit `packages/design/**`.

### B8. Legal, support, EAS and CI (all still to do)

- **Legal pages:**
  - The privacy notice and deletion page say "the LyniaGo Android app" and "Android package
    zw.co.lynia" (`legal.content.ts:311, 355, 510`).
  - They say maps are "rendered by Google Maps Platform" (`:234-235`). iOS renders Apple Maps; Places
    search is still Google.
  - They describe the persistent Android notification (`:138`, `:408-412`).
  - Fix: make them platform-neutral, name **FortyoneX Studio (Private) Limited** as operator and data
    controller, add Apple (APNs) as a push processor with B4, and update the assertions pinned in
    `legal.content.spec.ts`.
- **Support URL (required field):** nothing can fill it today. Add a public `/legal/support` page
  (contact, WhatsApp help line, hours). Make sure the address it lists receives mail: the public
  contact is `hello@lyniago.com` (since 2026-09-28), and `lyniago.com` had no MX records that day.
- **`eas.json`:**
  - iOS options on `preview`/`closed`/`production`, with `ios.image` pinned (D2).
  - `submit.<profile>.ios.ascAppId` (+ `appleTeamId`).
  - The `ios-simulator` profile from B1.
  - **`eas.json` is a fingerprint input** (B9), so ship it with the `ios` block.
- **Workflows:**
  - `mobile-release.yml` / `mobile-submit.yml`: add a `platform` input (`android` | `ios`). iOS
    submits to TestFlight; there is no track.
  - `eas-build-status.yml`: list iOS builds and read `iosConfig`.
  - `mobile-ota.yml`: add the iOS fingerprint preflight once an iOS binary exists. Today it checks only
    `--platform android` while `eas update` publishes both.

### B9. Fingerprint sequencing: ship the iOS config with the next Android build

`@expo/fingerprint@0.11.11` hashes two sources that the iOS work touches:
- the whole resolved config, `ios` block included, as one `expoConfig` source for every platform;
- the whole of `eas.json` (`getEasBuildSourcesAsync`); no source skip exists for it.

Measured with `expo-updates fingerprint:generate --platform android`, everything else held constant:

| Tree | Android fingerprint |
|---|---|
| `main` (+ the xmldom fix, which is not hashed) | `7ae040c9…` |
| + the `ios` block | `353f1dc3…` |
| + the iOS `eas.json` profile | `a2e164dc…` |

So OTAs published from `main` stop matching the Android binary testers have until the next Android
store build ships. **Merge the `ios` block, the iOS `eas.json` profiles and the iOS plugin-option
changes (B2) in one PR, right before the next Android store build.** The API-36 build (§8) is the
natural carrier.

The SDK 54 upgrade that brings API 36 moves the fingerprint by itself: `7ae040c9…` on `main` →
`a3571198…` on the upgrade branch (measured 2026-09-28, same command). It merged as #959 on
2026-09-28. The API-36 store build (vc 39) shipped the same day without the iOS config, so the iOS
config moves the fingerprint once more and ships with the following Android store build.

The rule holds on SDK 54's `@expo/fingerprint@0.15.5`, re-measured on the upgrade branch: an `ios`
block moves `a3571198…` to `bdf7c3fe…`, and an iOS `eas.json` profile moves it to `b3cd3e7f…`. A
version bump still moves nothing (`REL-01`).

JS-only and API-only work can land any time: B3, B4, B5, the JS parts of B6, and the legal/support
half of B8.

## 4. Phase C — first build, TestFlight, device pass

- **C1. Compile proof: DONE** (build `7fdb60a9`, §10).
- **C2. First signed build.** After A4–A6, B2 and B8, run `mobile-release.yml` with `platform: ios`
  and profile `closed`, with auto-submit. The build goes to App Store Connect, then TestFlight.
  Processing takes minutes.
- **C3. Internal TestFlight.** Up to 100 App Store Connect users, with no review: the founder plus an
  iPhone tester in Harare.
- **C4. iPhone device pass: the exit gate.** A green build is not a working app (PSS 267-269). Run
  `QA-DEVICE-CHECKLIST.md` on an iPhone, adding an iOS section. Cover:
  - cold start and the splash;
  - WhatsApp OTP sign-in, with **no** National ID field and **no** role fork;
  - sending a parcel, and a food order;
  - push arriving (after B4);
  - the B6 items;
  - a Sentry event with a symbolicated stack (dSYM upload);
  - a rider account landing in customer mode.
- **C5. Optional external TestFlight.** Up to 10,000 testers. The first build goes through Beta App
  Review and needs a beta description, a feedback email and the demo account.

## 5. Phase D — the App Store Connect listing [F enters, C drafts]

**Metadata** (customer app only: no "Ride and earn" section anywhere):

| Field | Value / source |
|---|---|
| Name (≤ 30) | `LyniaGo` |
| Subtitle (≤ 30) | New for iOS; owner to approve. |
| Description (≤ 4000) | Customer half of PSS §2 (sending parcels, tracking, safety), plus food ordering, which 4 of the 6 current screenshots show. Drop the "RIDE AND EARN" block. Never reuse `LISTING-COPY.md`'s "made for any Android phone" (2.3.10). |
| Keywords (≤ 100 chars) | New, e.g. delivery, courier, parcel, motorbike, food, Harare, Zimbabwe. |
| Support URL | The new `/legal/support` page (B8). |
| Privacy Policy URL | `https://api.lyniago.com/legal/privacy` (after B8). |
| Category | Owner call: primary Food & Drink or Business, secondary Lifestyle. Play uses Maps & Navigation. |
| Copyright | `2026 FortyoneX Studio (Private) Limited` |

**Screenshots.** One iPhone set, in either size:
- **6.9"** (1320×2868, 1290×2796 or 1260×2736);
- **6.5"** (1284×2778 or 1242×2688).

1–10 images, PNG or JPEG, with **no alpha channel**.

None of the Play assets fit:
- they are 1080×1920, and every PNG has an alpha channel;
- the 10" set has a fake status bar;
- `05-send-parcel` shows desktop scrollbar artifacts.

Re-render customer screens only, from the design tool's store export lab at Apple sizes, or capture
them from the iOS simulator. Save them to `store-assets/app-store/`, never under `packages/design/**`.

**App Privacy labels** (the customer subset of PSS 1349-1380). Nothing is used for tracking, so no App
Tracking Transparency prompt.

| Apple data type | Linked to user | Purposes | Notes |
|---|---|---|---|
| Contact Info — Name, Phone Number | Yes | App Functionality | Shared only with that delivery's counterparty. |
| Contact Info — Email Address | Yes | App Functionality | Optional in-app. |
| Contact Info — Physical Address | Yes | App Functionality | Pickup/drop-off addresses. Not declared on Play; decide. |
| Location — Precise, Coarse | Yes | App Functionality | While in use only; no background location on iOS. |
| Identifiers — User ID, Device ID | Yes | App Functionality | The device id is a random Keychain UUID, not IDFA/IDFV. |
| Financial Info — Other Financial Info | Yes | App Functionality | The optional mobile-money reference a customer types for a food order. |
| Purchases — Purchase History | Yes | App Functionality | Food and parcel orders. |
| User Content — Other User Content | Yes | App Functionality | Notes, ratings, reports. |
| Usage Data — Product Interaction | No | Analytics | PostHog screen views, autocapture off, no `identify`. |
| Diagnostics — Crash Data, Performance Data | No | Analytics | Sentry with `sendDefaultPii: false` and no `setUser`; RUM goes to the app's own API. |

The iPhone app collects **no** government ID, photos or biometrics (D-41).

**Age rating.** Answer the new questionnaire (4+/9+/13+/16+/18+ tiers; the social-media capability
questions have been required since September 2026):
- no alcohol, tobacco or drugs;
- users interact (ratings, reports, calls);
- location is shared.

Then **override to 18+**, matching the privacy notice's "not intended for anyone under 18".

**App Review information.**
- **Sign-in:** the demo phone as username and the fixed code as password.
  - The mechanism exists: `DEMO_OTP_PHONE` + `DEMO_OTP_CODE`, allowed in production, and it is a
    **customer** account, which is exactly the iPhone app's scope.
  - Arm it on Azure: `DEMO_ACCOUNT_ENABLED` plus the Key Vault pair. PSS §7.1's `gcloud` commands are
    stale.
  - Use a reserved number, not the ops SOS line. It must not expire.
- **Notes (draft):**
  - LyniaGo is a parcel and food delivery marketplace for customers in Harare, Zimbabwe, operated by
    FortyoneX Studio (Private) Limited.
  - To send a parcel, set both pins inside Harare.
  - Deliveries are paid in cash to the rider, outside the app. Food is paid in cash, or by mobile
    money directly to the restaurant: physical goods and services (3.1.3(e)).
  - Deliveries are made by independent, separately verified riders.
  - Add whatever D8 decides about test orders.

**Pricing and availability:** Free, Zimbabwe only (D5). **Version release:** manual.

## 6. Phase E — submit; review risks to pre-empt

| Guideline | Exposure | Pre-empt |
|---|---|---|
| 2.1 completeness / demo login | Everything is behind OTP sign-in | The demo login above, armed and non-expiring. |
| 2.1 real-world side effects | A reviewer's test order reaches real riders or restaurants | D8. |
| 3.1.3(e) | Cash and mobile money for physical goods and services | Must *not* use in-app purchase. Say so in the notes. |
| 5.1.1(v) account deletion | Exists: Settings → Delete account → `DELETE /auth/me` | D9 fixed 2026-10-06 (D-78): the copy now says immediate. |
| 5.1.1(v) login before non-account features | Restaurant browsing sits behind sign-in | Explain in the notes. If rejected, allowing browsing before sign-in is a design change. |
| 5.1.1 primer wording and purpose strings | "Allow location"; generic plugin defaults | D10, B2. |
| 5.2.1 seller vs brand | Seller "FortyoneX Studio (Private) Limited", app "LyniaGo" | The operator line everywhere (D1). |
| 2.3.10 other platforms | Play assets and copy | New screenshots and no Android wording. The app never tells users to use Android to ride (D-41). |
| 4.8 Sign in with Apple | Phone OTP only, so not required | Adding Google or Facebook sign-in later would trigger it. |
| 1.4.3 | Tobacco and vape sales are banned | Merchant menus are free text; keep those items out. |

Apple reports 90% of submissions reviewed in under 24 hours. Answer rejections in the Resolution Center;
a metadata-only rejection is fixed in App Store Connect without a new build.

## 7. Phase F — after approval

- Release manually (phased release optional).
- Set `EXPO_PUBLIC_APP_STORE_URL` (B5) and per-platform minimum versions.
- From then on, `eas update` reaches both platforms; each has its own fingerprint runtimeVersion.
- Record every build and submission in §10. "Did it ship?" is answered by App Store Connect or the
  `eas-build-status.yml` recap, never inferred from `main` (CLAUDE.md, Expo/EAS section).

## 8. Side findings (not iOS, surfaced by this research)

- **Google Play API 36.** Play's rule: "Starting August 31, 2026: New apps and app updates must target
  Android 16 (API level 36) or higher to be submitted".
  - An extension to **2026-11-01** can be requested from Play Console's Policy status page.
  - v0.50.1 / vc 39 (EAS `15e221af`), the first build targeting 36, reached Closed testing on
    2026-09-28 (PSS "Build 39").
  - Build 37 (API 35) was accepted into Closed testing on 2026-09-27, and PSS doesn't record why.
  - The extension isn't needed for new builds: every build from vc 39 on targets 36.
- **Android push may be off too.** `PUSH_PROVIDER = "noop"` in `infra/azure/containerapps.tf:51`. The
  repo can't show whether the GitHub Variable has since been flipped.
- **OTP channel.** Production is WhatsApp-only (`bird-verify.ts:12-22`); PSS §4.4 still says SMS.
- **Support mailbox.** `hello@lyniago.com` is listed everywhere (since 2026-09-28; it replaced
  `support@lyniafinance.com`), and `lyniago.com` had no MX records that day, so mail to it bounces until
  a mailbox or forwarding is set up.
- **Deletion copy vs behaviour.** See D9.

## 9. Sources (primary, fetched 2026-09-27 unless dated)

**Apple requirements:**
- Upcoming requirements: <https://developer.apple.com/news/upcoming-requirements/>
- Xcode 26 rule, announced 2026-02-03: <https://developer.apple.com/news/?id=ueeok6yw>
- iOS 27 SDK from April 2027, announced 2026-09-09: <https://developer.apple.com/news/?id=k1mtkt1k>

**Expo and EAS:**
- EAS build images: <https://docs.expo.dev/build-reference/infrastructure/>
- Expo on Xcode 26 for SDK ≤ 53 (2026-04-27): <https://expo.dev/blog/app-store-connect-minimum-sdk-26>
- fmt and Xcode 26.4: <https://github.com/facebook/react-native/issues/55601>,
  <https://github.com/facebook/react-native/pull/56099>, <https://github.com/expo/expo/issues/44229>
- Legacy architecture: <https://expo.dev/changelog/sdk-54>, <https://expo.dev/changelog/sdk-55>
- EAS credentials in CI: <https://docs.expo.dev/build/building-on-ci/>,
  <https://docs.expo.dev/app-signing/managed-credentials/>, <https://docs.expo.dev/submit/ios/>
- EAS pricing: <https://expo.dev/pricing>, <https://docs.expo.dev/billing/plans/>
- Privacy manifests: <https://docs.expo.dev/guides/apple-privacy/>,
  <https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api>

**App Store Connect:**
- Screenshots: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications>
- Age ratings: <https://developer.apple.com/news/?id=ks775ehf> (2025-07-24),
  <https://developer.apple.com/news/?id=tlur8uvi> (2026-07-09)
- Storefronts: <https://support.apple.com/en-us/118205>
- DSA trader status: <https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements>

**Enrollment:**
- Enrollment (individuals are listed under their legal name): <https://developer.apple.com/programs/enroll/>
- D-U-N-S: <https://developer.apple.com/help/account/membership/D-U-N-S/>
- Individual → organization conversion:
  <https://developer.apple.com/help/account/membership/updating-your-account-information/>

**App Review:**
- Guidelines (updated 2026-06-08): <https://developer.apple.com/app-store/review/guidelines/>
- Account deletion: <https://developer.apple.com/support/offering-account-deletion-in-your-app/>
- 5.2.1 seller-name rejections: <https://developer.apple.com/forums/thread/106106>

**Google Play:**
- Target API: <https://support.google.com/googleplay/android-developer/answer/11926878>

**Package source read** (the lockfile's exact versions): `expo-location@18.0.10`,
`expo-image-picker@16.0.6`, `expo-notifications@0.29.14`, `@expo/prebuild-config@8.2.0`,
`@expo/fingerprint@0.11.11`.

## 10. Ledger — iOS build and submission attempts

Every EAS iOS build and every App Store Connect or TestFlight submission, newest last. The same
discipline as PSS applies: record the build id, the outcome and the failure class, and never assume it
happened.

| Date | Build / submission | Profile · image | Result | Failure class / notes |
|---|---|---|---|---|
| 2026-09-27 | `7fdb60a9` (from `1c9be6d`, triggered via the Expo MCP `build_run`) | `ios-simulator` · `macos-sequoia-15.6-xcode-26.2` (Xcode 26.2, 17C52) | **FINISHED** in ~10 min | Compile proof, no submission. Expo SDK 52 / RN 0.76.9 builds on Xcode 26.2, so D2 is settled. It needed the xmldom fix from the same branch: before it, the iOS prebuild failed locally in `withIosInfoPlistBaseMod`. Used 1 of the Free plan's 15 monthly iOS builds (separate from Android's 15). |
