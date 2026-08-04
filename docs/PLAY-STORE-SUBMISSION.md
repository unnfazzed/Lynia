# Google Play submission package (LR20)

> Everything needed to create, fill in and ship the **LyniaGo** Play Console listing, in the order the
> console asks for it. Companions: `docs/LAUNCH-EXECUTION-RUNBOOK.md` §8c (arming the release
> pipeline), `docs/LAUNCH-DEPLOYMENT-STRATEGY.md` §1b (build/submit mechanics),
> `docs/DATA-RETENTION.md` (the source of truth behind every data claim here).
>
> **Status (2026-07-29):** the Play developer account is approved and can create apps. The repo side
> of the submission is complete — including the reviewer-access demo account (§7.1), which was the one
> hard blocker and is now built. What remains is founder-only: set the demo-account secrets, the
> Play/EAS credentials, the CDPA filings (§7.3), and produce the graphics.
>
> **Status (2026-08-03):** the Play Console app exists for `zw.co.lynia` and the console's setup
> tasks are done — the dashboard now sits at **Internal testing** (founder, via console dashboard).
> The graphics are produced and validated in `store-assets/google-play/` (supersedes the "missing"
> rows in §6). The console also confirms a **closed test is mandatory before production** for this
> account (§8 step 2 — a ~14-day clock that must be counted into the mid-August approval tripwire).
> What remains: verify the EAS pipeline is armed (§7.2, `scripts/eas-arm.sh --verify`), upload the
> first internal-track build (§8 step 1), run the closed test, then apply for production access.
>
> **Verification (2026-08-03, live against the EAS API/CLI):** the Expo side is further along than
> §7.2 assumed. Already done: project linked (`@lyniago/lynia`, id matches the committed fallback),
> **Android upload keystore exists** (EAS-managed JKS, created 2026-06-30, default for
> `zw.co.lynia`), **`GOOGLE_MAPS_API_KEY` set** as an EAS secret in both `preview` and `production`
> environments, and PostHog analytics vars synced (both environments). Confirmed still missing:
> the **Play service-account key for submissions** (`googleServiceAccountKeyForSubmissions: null` —
> blocks auto-submit, the one hard gap), the **`GOOGLE_SERVICES_JSON`** file variable (build
> succeeds without it but push is inert — set it before the first store build), and the GitHub-side
> switches (`EXPO_TOKEN` secret, `EAS_RELEASE_ENABLED` — the sole `mobile-release.yml` dispatch,
> 2026-07-23, skipped, proving the gate was off; GitHub secrets are not readable remotely, so
> re-verify with `scripts/eas-arm.sh --verify`).
>
> **Status (2026-08-03, late — pipeline armed end-to-end):** every gap in the verification block
> above is now closed. The Play Developer API service account exists
> (`id-play-publisher@lynia-500911.iam.gserviceaccount.com`, least-privilege: view + release to
> testing tracks + manage testing tracks; production-release permission deliberately deferred until
> the staged rollout). Minting its key required a temporary **project-scoped lift of the org's
> `iam.disableServiceAccountKeyCreation` policy**, re-enforced immediately after (existing keys
> keep working). The key is registered on EAS for submissions (API-verified 20:08 UTC).
> `GOOGLE_SERVICES_JSON` is an EAS **file** variable in `preview` + `production` (verified), fed by
> the Firebase Android app for `zw.co.lynia` in project `lynia-500911`. GitHub is armed: **robot**
> `EXPO_TOKEN` secret (revoke the old personal token once a run is green), `EAS_PROJECT_ID`,
> `production-mobile` environment, `EAS_RELEASE_ENABLED=true`. The first dispatch (run #2,
> 30852221217) *executed* rather than skipping — proving the arming switch — then failed fast on a
> robot-token quirk: `eas build` requires an explicit **`owner: "lyniago"`** in `app.config.ts`
> when authenticated as a robot (a personal token implies its account; a robot has none). The field
> is now set; re-dispatch after it lands. Remaining nit: `production-mobile` has **no required
> reviewer** yet (the picker wouldn't match the owner account) — add before first OTA use, since
> that environment also gates `mobile-ota.yml`.
>
> **Status (2026-08-04, overnight — first internal build blocked on fingerprint parity; fixes
> staged, one founder step pending).** Four dispatch attempts, three distinct failure classes, each
> fixed forward: ① robot-token `owner` field (run #2 → fixed, `app.config.ts`); ② pnpm version
> parity — the EAS image runs pnpm 9.15.5 vs the repo's 10.33.0, and pnpm 10 changed `.pnpm`
> path-hash spelling, breaking the `fingerprint` runtime version (builds `5906d2f0`, `549913bf` →
> fixed: strict frozen installs in the mobile workflows + `"pnpm": "10.33.0"` pinned via
> `eas.json` base profile, confirmed applied in the build-4 log); ③ two config-level fingerprint
> sources (build `34fad06c`): the EAS-side `prebuild` output was hashed as a `bareNativeDir`
> (fixed: `apps/mobile/.gitignore` now excludes `/android` `/ios` — fingerprint skips git-ignored
> dirs) and the resolved app config differs because **Secret-visibility EAS env vars are unreadable
> by the CLI on the runner** — the builder sees `GOOGLE_MAPS_API_KEY` and injects
> `android.config.googleMaps.apiKey`, the runner doesn't. Expo's rule: config-consumed vars must be
> **Sensitive**, not Secret. `GOOGLE_SERVICES_JSON` is flipped to Sensitive (done, both envs);
> `GOOGLE_MAPS_API_KEY` is a legacy secret whose value can't be read back, so the founder must
> **delete + re-create it with Sensitive visibility** (expo.dev → project → Environment variables,
> both `preview` and `production`; the key ships inside the APK anyway, so Sensitive is
> appropriate). EAS build quota: 3 of ~15 August builds consumed; per the stop rule, no further
> dispatch until the founder re-creates the key and says go.
>
> **Status (2026-08-04, morning — ✅ Maps key re-created as Sensitive; attempt 5 in flight).** The
> founder re-created **`GOOGLE_MAPS_API_KEY` with Sensitive visibility** (06:32 UTC, all three
> environments — verified minutes later against the EAS API, which now reports `SENSITIVE` for it and
> for `GOOGLE_SERVICES_JSON`). That closes the last fingerprint-mismatch source: the decoded build log
> for `34fad06c` shows the full fingerprint diff contained **exactly two** items — the
> `bareNativeDir android` dir (fixed by `apps/mobile/.gitignore`, #550) and the
> `android.config.googleMaps.apiKey` block present only in the builder's resolved config (the
> Secret-visibility asymmetry). Useful hard fact from that same diff: `@expo/fingerprint` strips
> `googleServicesFile` from the hashed `expoConfig` (the builder's config carried its materialised
> secrets path, yet the hashed contents omit the field), so the runner-vs-builder path difference for
> file variables can never cause a mismatch — flipping the file var's visibility was hygiene, not a
> fingerprint fix. On the founder's go, **attempt 5 dispatched**: `mobile-release.yml` run #6
> (profile `preview`, auto-submit → internal track), EAS build `27fae8b2` — in flight at the time of
> writing (outcome to be recorded here). 4 of ~15 August builds consumed. The expo-doctor warnings in
> the build-4 log (`@sentry/react-native@6.22` vs expected ~6.10 for SDK 52, `typescript@6`,
> `@expo/config-plugins@57`, `react-native-maps@1.18.4` vs 1.18.0) are non-fatal and identical on both
> sides of the frozen install — park them for the next SDK-upgrade pass, they are not release
> blockers.
>
> **Status (2026-08-04, attempt-5 outcome — ✅ fingerprint parity SOLVED; new failure class: pnpm
> strict layout, fixed forward).** Build `27fae8b2` sailed through `CONFIGURE_EXPO_UPDATES` (the
> phase that killed attempts 2–4 — runtime version resolved identically on both sides, closing the
> fingerprint saga for good) and died in `RUN_GRADLEW` on **two pnpm strict-layout resolution
> failures**: ① `:app:createBundleReleaseJsAndAssets` — `@expo/metro-config`'s `getAssetPlugins()`
> throws `The required package \`expo-asset\` cannot be found` (it `resolveFrom`s the **project
> root**, and `expo-asset` was only a transitive dep of `expo`, so pnpm never links it into
> `apps/mobile/node_modules`); ② the Sentry gradle task can't start
> `apps/mobile/node_modules/@sentry/cli/bin/sentry-cli` (same reason — transitive dep of
> `@sentry/react-native`). This class was invisible until now because every earlier build died
> before Gradle, and the QA APK workflow deliberately installs `--config.node-linker=hoisted`
> (android-test-apk.yml) which papers over it. Hoisting the EAS builder was rejected — it would
> desync the builder's layout from the CI runner's strict frozen install and risk re-opening
> fingerprint parity. The surgical fix: declare what the build resolves from the app root —
> `expo-asset ~11.0.5` (dependencies), `babel-preset-expo ~12.0.12` + `@sentry/cli ^2.53.0`
> (devDependencies; babel-preset-expo is referenced by `babel.config.js` and would have been the
> *next* failure — all three were verified unresolvable from `apps/mobile` pre-fix, resolvable
> post-fix). Lockfile delta is link-entries only (identical resolved versions → no native/dep-tree
> change). Verified locally end-to-end: `expo export --platform android` produces the full Hermes
> bundle (6.2 MB `.hbc`) through the same Metro pipeline as `createBundleReleaseJsAndAssets`, and
> `sentry-cli 2.53.0` launches (its platform binary ships as an optional dep, so pnpm's
> build-script blocking is moot). 5 of ~15 August builds consumed; attempt 6 dispatches once this
> fix merges.
>
> **Status (2026-08-04, attempt-6 outcome — ✅ JS bundle builds; last Gradle failure was the Sentry
> upload task, now disabled until Sentry is provisioned).** Build `16e18e74` (v0.17.8): the dep fix
> held — `createBundleReleaseJsAndAssets` succeeded end-to-end (Hermes source map + debug ID
> generated) and native compilation (CMake/Kotlin/Java) was well underway. The sole failure:
> `:app:createBundleReleaseJsAndAssets_SentryUpload…` runs `sentry-cli`, which exits 1 with
> `An organization ID or slug is required` because no Sentry org/project/auth exists yet — Sentry
> provisioning is deliberately deferred (runtime capture is DSN-gated and inert). The app.config
> comment claiming builds succeed without `SENTRY_AUTH_TOKEN` was wrong for the Gradle task (comment
> corrected). Fix: `eas.json` base profile sets **`SENTRY_DISABLE_AUTO_UPLOAD=true`** — the upload
> task's `onlyIf shouldSentryAutoUploadGeneral()` guard (verified in `@sentry/react-native@6.22.0`
> `sentry.gradle`) skips it cleanly. **Revert the env var when Sentry is provisioned** (set the
> `SENTRY_AUTH_TOKEN` EAS secret + org/project) so release source maps upload again — Sentry must be
> live before the production staged rollout anyway (§8 step 3, LR20). 6 of ~15 August builds
> consumed; attempt 7 next. ⚠️ Submit-step heads-up: Google Play often requires the very FIRST
> artifact of a brand-new app to be uploaded manually in the Console before API submissions are
> accepted — if attempt 7 builds green but auto-submit fails with an app/artifact-not-found class
> error, download the `.aab` from the EAS build page, upload it once by hand to Internal testing,
> and auto-submit works from the next build onward.
>
> **Status (2026-08-04, attempt-7 outcome — ✅ Sentry skip confirmed; third and deepest pnpm
> strict-layout instance found and fixed: RN-core autolinking generated a wrong import).** Build
> `e54ed8a3` (v0.17.8): Sentry upload task `SKIPPED` as designed; the JS bundle, resource
> processing and Kotlin compile all passed; `:app:compileReleaseJavaWithJavac` failed —
> the autolinking-generated `PackageList.java` contains `import expo.core.ExpoModulesPackage;`
> (a class that doesn't exist; the real one is `expo.modules.ExpoModulesPackage`). Root cause,
> fully reproduced locally with the exact `settings.gradle` command: `expo-modules-autolinking`'s
> `react-native-config` evaluates each library's `react-native.config.js` at its **symlink** path
> via `require-from-string` (no realpath), so `expo`'s config — whose first line requires
> `expo-modules-autolinking/exports` — hits MODULE_NOT_FOUND under pnpm's strict layout; the
> loader's bare `catch { return null }` swallows the error and the resolver falls back to
> deriving the import from the library's Android **namespace** (`expo.core`) + scanned class name.
> Fix (same pattern as attempt 6's): declare `expo-modules-autolinking@2.0.8` (expo's exact pinned
> dep) in `apps/mobile` devDependencies — the symlink-path resolution then finds it one hop up.
> Verified: the config evaluates cleanly, the exact builder command now emits
> `import expo.modules.ExpoModulesPackage;`, and all six autolinked libraries
> (`expo`, `@sentry/react-native`, maps, safe-area-context, screens, svg) emit their canonical
> import paths. 7 of ~15 August builds consumed; attempt 8 next — remaining unexercised: app javac
> (now with a correct PackageList), R8/resource-shrink, signing, Play auto-submit.

---

## 1. App identity

| Field | Value | Where it comes from |
|---|---|---|
| App name (Play listing, ≤30 chars) | `LyniaGo` | `apps/mobile/app.config.ts` → `name` |
| Package / application id | `zw.co.lynia` | `app.config.ts` → `android.package` — **immutable once published** |
| Default language | English (United Kingdom) — `en-GB` | Copy below is UK-spelled ("anonymised") |
| App or game | App | |
| Free or paid | Free | Commission is charged to riders in-app, not at install |
| Category | Maps & Navigation | Closest fit for a courier marketplace; Business is the alternative |
| Tags | Delivery, Courier, Navigation | |
| Contact email | `support@lyniafinance.com` | Matches `SUPPORT_URL` in `apps/mobile/src/config.ts` |
| Website | *(none — see §7.3)* | |
| Version name at first submission | Whatever `main` holds at build time (`0.17.6` as of 2026-08-03 evening) | `app.config.ts` → `version` (release-please-managed; was `0.11.0` when this doc was first written) |
| Version code | EAS-managed, auto-incrementing | `eas.json` → `appVersionSource: "remote"` + `autoIncrement` |

---

## 2. Store listing copy

Paste verbatim. Character counts are Play's hard limits; the counts given are what the copy uses.

### Short description (80 max — uses 74)

```
Send a parcel across town by motorbike. You name the price, riders bid, you pick.
```

### Full description (4000 max — uses ~1,720)

```
LyniaGo moves your parcel across town by motorbike — and you decide what it costs.

Tell us where it's going, name your price, and nearby riders respond. Some accept your
price, some counter with theirs. You see every interested rider with their price, rating
and ETA, and you choose who carries your parcel. No dispatcher, no fixed tariff, no
haggling back and forth.

SEND SOMETHING
• Set pickup and drop-off on the map, or search for an address
• See a suggested price, then move it up or down — it's your call
• Add a photo and a note so the rider knows exactly what they're collecting
• Watch your rider on the map from collection to hand-over
• Confirm delivery with a one-time code, so a parcel only ends up with the right person
• Rate your rider afterwards

RIDE AND EARN
• Go online and see delivery requests near you
• Accept the offered price or counter with your own
• Follow the route, update the customer as you go, collect your earnings
• Track every job and payout in one place
• Verified riders only — every rider passes an ID check before their first delivery

BUILT FOR HOW ZIMBABWE ACTUALLY MOVES
Deliveries are paid in cash, directly between you and your rider. LyniaGo doesn't handle
the money for your goods and riders never carry a float — they carry the parcel. The app
is built to stay usable on a slow connection: it's light, it caches what it can, and it
tells you honestly when something can't load rather than spinning forever.

SAFETY
• Every rider is identity-verified before they can take a job
• Live tracking on every delivery, so you always know where your parcel is
• A one-time code at hand-over
• An in-app emergency button and a way to report a problem on any trip

Lynia is a marketplace that connects senders and riders. Riders are independent operators,
not employees, and they transport items — they don't buy them for you or handle payment
for them.

Questions? support@lyniafinance.com
```

### App icon

512 × 512 PNG, 32-bit, ≤1 MB. **Derive it from `apps/mobile/assets/icon.png`** (already 1024 × 1024 —
downscale, do not redraw): the store icon and the launcher icon must read as the same mark.

---

## 3. Data safety form

**This section must match the code.** The claims below are generated from
`apps/api/src/privacy/pii-manifest.ts` and `docs/DATA-RETENTION.md`, and
`apps/api/src/legal/legal.content.spec.ts` fails the build if a new personal-data column appears in
the schema without being declared in the published privacy notice. When that test fails, update the
notice **and this table** together — an under-declared Data safety form is a policy violation that
can pull a live listing.

### Overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS everywhere; `Strict-Transport-Security` set globally) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — `https://lyniago.lyniafinance.com/legal/account-deletion` |

### Per-type declarations

`Collected` = leaves the device. `Shared` = passed to a third party. Every row is **required** for app
functionality unless marked optional, and **none** is used for advertising or sold.

| Data type | Collected | Shared | Optional? | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes¹ | Required | App functionality, Account management |
| Email address | Yes | No | **Optional** | Account management |
| Phone number | Yes | Yes¹ | Required | App functionality, Account management |
| User IDs | Yes | No | Required | App functionality, Account management |
| Government ID (Personal info → Other) | Yes | Yes² | Required (riders only) | Fraud prevention, safety & compliance |
| Approximate location | Yes | Yes¹ | Required | App functionality |
| Precise location | Yes | Yes¹ | Required | App functionality |
| Photos | Yes | Yes² | Required | App functionality, Fraud prevention |
| User payment info (mobile-money number) | Yes | No | Required (riders only) | App functionality |
| User payment info (restaurant payment reference) | Yes | Yes⁴ | **Optional** | App functionality, Fraud prevention |
| Purchase history (wallet ledger) | Yes | No | Required (riders only) | App functionality |
| Purchase history (food/shop orders) | Yes | Yes⁴ | Required (restaurant orders only) | App functionality |
| App interactions | Yes | Yes³ | Required | Analytics |
| Crash logs | Yes | Yes³ | Required | Analytics |
| Diagnostics | Yes | Yes³ | Required | Analytics |
| Other user-generated content (item notes, ratings, reports) | Yes | Yes¹ | Required | App functionality, Fraud prevention |

¹ With the counterparty to that specific delivery only (the customer sees the assigned rider's first
name/photo/rating/live position; the rider sees the customer's first name, the points, and the
delivery contact number). Not with any other user, and not with a third-party company.
² With the KYC verification provider (ID/selfie) and Google Cloud Storage as the storage processor.
³ With Sentry (crash) and PostHog (product analytics) as processors.
⁴ With the restaurant or shop the customer ordered from — the dishes, per-dish notes, delivery point,
and (only if the customer used "I paid another way") the mobile-money reference so the shop can match
it to its own statement. Scoped to that order: a shop never sees the customer's ID, saved addresses,
or any order placed with another shop.

**Do NOT tick:** "Data is used for advertising or marketing", "Data is shared with a data broker",
"App collects data for advertising ID purposes" — none is true, and each is independently verifiable
against the dependency list (there is no ads SDK in `apps/mobile/package.json`).

---

## 4. App content declarations

Play Console → **App content**. Every item, with the answer and the evidence.

### 4.1 Privacy policy — ✅ ready

```
https://lyniago.lyniafinance.com/legal/privacy
```

Served by `apps/api/src/legal/legal.controller.ts` — unauthenticated, uncached-by-session, no
geofence, no external subresource (a strict `default-src 'none'` CSP is set and the content test
asserts nothing remote is referenced, so it cannot break for a reviewer on a restricted network).

### 4.2 Account deletion — ✅ ready

```
https://lyniago.lyniafinance.com/legal/account-deletion
```

Play requires **both** a deletion URL and an in-app path for any app offering account creation. The
in-app path is **Account → Settings → Delete account** (`apps/mobile/app/settings/index.tsx`), a
two-tap confirm that calls `DELETE /auth/me`. Regression-tested in
`apps/mobile/app/settings/__tests__/delete-account.test.tsx`.

### 4.3 Ads

**No**, the app contains no ads. There is no ads SDK, no advertising ID use, and no ad mediation.

### 4.4 App access — declare "restricted", supply the demo account

The whole app is behind a phone-number OTP sign-in (SMS via Bird), so select **"All or some
functionality is restricted"** and provide sign-in details. Reviewers cannot receive a Zimbabwean
OTP, so a normal account is unusable to them — the **demo account with a fixed code (§7.1) is built**
for exactly this. Enter the demo phone as the username and the fixed code as the password, with a
one-line instruction to request the code and enter it. Remaining work is founder-only: set the two
secrets and type the credentials into this form (§7.1).

### 4.5 Content rating questionnaire

Category: **Utility, Productivity, Communication or Other**. Answers:

| Question | Answer |
|---|---|
| Violence, sexuality, profanity, controlled substances, gambling, horror | **No** to all |
| Does the app share the user's current location with other users? | **Yes** — a rider's live location is shown to the customer during their delivery |
| Does the app allow users to interact or exchange content? | **Yes** — ratings, comments, reports; plus a phone-call/hand-off between the two parties |
| Does the app allow users to purchase digital goods? | **No** — the rider commission wallet is a real-money service fee, not a digital good |
| Does the app contain user-generated content? | **Yes** — item photos/notes, rating comments |
| Do you provide a way to report/moderate UGC? | **Yes** — in-app report & block plus admin moderation |

Expected outcome: **PEGI 3 / ESRB Everyone / IARC "3+"**, with a "Users Interact" and "Shares
Location" descriptor.

### 4.6 Target audience and content

Target age group: **18 and over only**. Do not tick any child age band — riders must pass identity
verification, and the service is not designed or appealing to children. The app is therefore out of
scope for Families policy and no Designed-for-Families declaration is needed.

### 4.7 Financial features — declare carefully

Play's Financial features declaration exists to catch lending, investing, crypto and payment apps.
LyniaGo is **none** of those, and answering "yes" pulls the listing into a licensing-evidence review
it cannot pass and does not need. The accurate answers:

- **Does your app provide financial products or services?** — the honest answer here is **No**.
  Lynia is a matchmaking marketplace. Customers pay riders in **cash, directly**; the app never
  processes payment for the goods (`docs/CONCEPT.md` §1, "the rider handles the item, never the money").
- The rider commission wallet is a **prepaid balance for the platform's own service fee**, not a
  stored-value or money-transmission product, and it is not offered to customers at all.
- **If Play challenges this**, the defensible position is exactly the above, plus: no lending, no
  interest, no third-party money movement, no crypto, no investment product. Founder should confirm
  with counsel before answering — see §7.4.

### 4.8 Government apps, health, news, COVID-19

**No** to all four.

### 4.9 Data safety

Filled from §3.

---

## 5. Sensitive permission declarations

The manifest requests two permission families that trigger their own Play review. Both need a written
justification **and a demo video** — budget time for this; it is a common cause of a first-submission
rejection.

### 5.1 Foreground service — location (`FOREGROUND_SERVICE_LOCATION`)

Added by the `expo-location` plugin's `isAndroidForegroundServiceEnabled: true`
(`apps/mobile/app.config.ts`, which documents exactly why).

**Declaration text:**

```
LyniaGo is a motorbike courier marketplace. When a rider is actively carrying a customer's
parcel, the app streams the rider's location to that customer so they can watch their
delivery arrive. The rider must be able to switch to a maps app for turn-by-turn
directions while riding, so this streaming has to continue while LyniaGo is in the
background — otherwise the customer loses sight of their parcel exactly when they need it
most. A persistent Android notification is shown for the entire time the foreground
service runs. Location updates start when a delivery is assigned and stop when the
delivery completes or the rider goes offline. The app requests only while-in-use location
permission and never requests ACCESS_BACKGROUND_LOCATION.
```

**Note for the form:** we deliberately do *not* request `ACCESS_BACKGROUND_LOCATION`, so the
background-location policy review (the slow one) should not apply. If Play's form asks anyway,
the answer is that the foreground service runs only during an active, user-initiated delivery.

**Demo video must show:** rider accepts a job → persistent notification appears → app is backgrounded
→ customer's screen shows the rider still moving → delivery completes → notification disappears.

### 5.2 Photos and camera

Justified inline by the permission strings already set in `app.config.ts` (`expo-image-picker`):
ID/profile photo for verification, item and proof-of-delivery photos. No separate declaration needed
unless Play asks about broad photo/video access — the app uses the picker, not
`READ_MEDIA_IMAGES` on the whole library.

---

## 6. Graphics assets

| Asset | Spec | Status |
|---|---|---|
| App icon | 512 × 512 PNG, ≤1 MB | ✅ `store-assets/google-play/app-icon/icon-512.png` |
| Feature graphic | 1024 × 500 PNG/JPG, no alpha | ✅ `store-assets/google-play/feature-graphic/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8 images, 16:9 or 9:16, each side 320–3840 px | ✅ Six shots in `store-assets/google-play/phone-screenshots/` |
| 7" / 10" tablet screenshots | Optional | ✅ Produced anyway — `store-assets/google-play/tablet-7in/`, `tablet-10in/` |
| Promo video | Optional (YouTube URL) | Skip for v1 |

The produced set (2026-08) is **six design-kit renders of the real designed screens** — frameless,
opaque, dimension-validated (see `store-assets/google-play/README.md` for the validation table and
the console upload map). No TEST BUILD banner can appear because they are not device captures.

**Original shot list** (kept as the optional post-launch upgrade: re-capture from a real release
build — the TEST BUILD banner must not appear). Eight screens, in the order that tells the product
story:

1. Home — set a pickup and drop-off
2. Price entry — the suggested price with the adjust control visible
3. Offers list — several riders with price, rating, ETA (the differentiator; lead with this)
4. Live tracking — rider on the map en route
5. Hand-over — the one-time delivery code
6. Rider board — open requests near the rider
7. Rider earnings
8. Rating screen

Use `/qa` or the device checklist in `docs/QA-DEVICE-CHECKLIST.md` to drive the app into each state.

---

## 7. Open items — founder only

These four cannot be closed from the repo.

### 7.1 ✅ Reviewer access to a login-gated app — BUILT (founder sets two secrets)

**The problem.** Sign-in is phone + OTP (SMS, via Bird). A Play reviewer in another country cannot
receive a Zimbabwean OTP, so they cannot open the app past the phone screen, and the submission is
rejected under "App access". The QA escape hatch does **not** solve it: `OTP_TEST_PHONES` returns the
live code in the HTTP response and is boot-rejected in production (an account-takeover vector).

**The mechanism (implemented).** A single allowlisted **demo account with a fixed code**, gated on two
secrets — `DEMO_OTP_PHONE` and `DEMO_OTP_CODE` (`apps/api/src/auth/auth.service.ts`,
`apps/api/src/config/env.ts`). Properties, all covered by tests:

- **Both secrets or nothing.** Either unset → the path is entirely inert and the ordinary OTP flow is
  untouched. Boot rejects one-without-the-other, a non-6-digit code, and trivially guessable codes.
- **Never echoes the code.** Unlike `OTP_TEST_PHONES`, no response ever carries it — the reviewer gets
  it out-of-band from the App-access form. `requestOtp` on the demo number sends nothing (no BSP cost)
  and stores nothing.
- **Allowed in production** — that is the point, and what distinguishes it from `OTP_TEST_PHONES`.
- **Constant-time code compare** (hashed both sides); a wrong guess is the same `Invalid code` as any
  other, so the demo number isn't distinguishable by response.
- **Low blast radius.** A throwaway **customer** account: in production it cannot self-verify as a
  rider (KYC needs real ID; the stub auto-pass is non-prod only), so it never reaches the rider board
  or payouts. The per-IP verify throttle (10/5min) still bounds brute force of the 6-digit code.
- **Audited** — a demo sign-in logs a masked-phone WARN.

**Founder action (the whole remaining task):** create two Secret Manager secrets, flip one repo
Variable to arm the deploy wiring, and enter the phone + code in Play Console → App access.

```bash
# 1. Create the secrets (values are yours; the code must be non-obvious — boot rejects 123456/111111)
printf '%s' '+2637XXXXXXXX' | gcloud secrets create DEMO_OTP_PHONE --data-file=- --project=lynia-500911
printf '%s' '<6 digits>'    | gcloud secrets create DEMO_OTP_CODE  --data-file=- --project=lynia-500911
# 2. Arm the deploy wiring (release.yml references the secrets only when this is true)
gh variable set DEMO_ACCOUNT_ENABLED --body true
# 3. Redeploy (next merge, or re-run Release) so the secrets are injected as env.
```

`release.yml` injects `DEMO_OTP_PHONE`/`DEMO_OTP_CODE` from Secret Manager only when
`DEMO_ACCOUNT_ENABLED=true` — the same opt-in pattern as Bird/WhatsApp/Sentry, so a missing secret
can never fail an un-armed deploy. The runtime SA needs `secretAccessor` on both secrets.

> ⚠️ **The demo number must not be a real user's account.** Sign-in resolves the account by phone, so
> if `DEMO_OTP_PHONE` is a number that already has (or later gets) a real profile, anyone holding the
> fixed code signs in **as that person**. Use a reserved number you control that will never be a
> genuine customer/rider. This is inherent to any phone-keyed demo account; the mitigation is
> operational — pick a dedicated number.

Brute-force of the fixed code is bounded two ways: a **per-phone cap of 10 guesses/hour** (holds
across all source IPs, so a distributed attacker can't outrun it — years to exhaust the 6-digit space
in expectation) on top of the existing per-IP verify throttle. The window resets, so a reviewer is
never permanently locked out.

That closes the blocker. It went through an adversarial self-review (the per-phone cap and this
dedicated-number warning came out of it); the design notes live at the code sites for the next
auditor.

### 7.2 Play Console + EAS credential setup

One-time, human-only, already scripted where possible — run `scripts/eas-arm.sh` and follow the
prompts (`scripts/eas-arm.sh --verify` audits what is armed). In Play Console you must, for
`zw.co.lynia`:

1. ✅ Create the app — **done 2026-08-03** (console dashboard live for `zw.co.lynia`). **Play App
   Signing** enrolment completes automatically when the first AAB is uploaded (it is mandatory for
   new apps).
2. ✅ Create a **Play Developer API service account** (Play Console → API access) and download its
   JSON key; `eas credentials` uploads it so `mobile-release.yml` can auto-submit. **Done
   2026-08-03 evening:** `id-play-publisher@lynia-500911.iam.gserviceaccount.com` created (the
   org's key-creation policy was lifted project-scoped for the minting, then re-enforced), granted
   least-privilege app-level Play access (view + release to testing tracks + manage testing
   tracks — the production-release permission is deliberately deferred until the staged rollout),
   and its key registered on EAS for submissions (API-verified). The upload keystore already
   existed (EAS-managed since 2026-06-30), so §7.2 is fully closed.

### 7.3 CDPA compliance — four duties the published notice now assumes

The privacy notice at `/legal/privacy` states Lynia's position under Zimbabwe's **Cyber and Data
Protection Act, 2021**, enforced by POTRAZ. The engineering claims in it are accurate to the code.
Four obligations sit on the *company* rather than the codebase, and publishing the notice is a public
representation that they are (or will be) met:

1. **Register as a data controller with POTRAZ.** The 2024 Licensing regulations require controllers
   to register before processing. Lynia is processing already, so this is overdue rather than
   pending — confirm status with counsel and file.
2. **Appoint a Data Protection Officer.** Required by the same regulations, and registrable with
   POTRAZ once appointed. When one exists, replace `LEGAL_CONTACT_EMAIL` in `legal.content.ts` with
   their contact — the notice currently points at the support inbox, which is honest (it is
   monitored) but is not a designated DPO.
3. **Notify POTRAZ of the cross-border transfer.** The primary region is `africa-south1`
   (Johannesburg), so **every row, image and backup lives in South Africa, not Zimbabwe**
   (`infra/terraform/variables.tf`). Under the Act that is a continuous cross-border transfer needing
   an adequacy determination or another ground plus notification. §4 of the notice discloses it
   plainly and relies on necessity-for-the-contract; counsel should confirm that ground and make the
   filing. *Do not "fix" this by quietly deleting the disclosure — the transfer is real, and an
   undisclosed one is the worse violation.*
4. **Be able to meet the 24-hour breach-notification duty.** The notice commits to notifying POTRAZ
   within 24 hours of becoming aware of a breach. `docs/IR-RUNBOOK.md` should carry POTRAZ as a named
   notification target with that clock, alongside the existing technical response steps.

Also still outstanding: replace "Lynia (LyniaGo), Zimbabwe" in the page footer with the **registered
company name, registration number and address**, and have counsel confirm the retention windows are
the right *policy* (they are accurate to the code — that is a different question).

### 7.4 Financial-features answer

Confirm §4.7 with counsel. The engineering position is solid — no money movement for goods, cash
between the parties, the wallet is a prepaid platform fee — but the answer is a regulatory
representation, not an engineering one.

---

## 8. Release sequence

Once §7.1 and §7.2 are closed:

1. **Internal testing track.** Actions → *Mobile Release (Play)* with profile `preview`
   (`eas.json` → `submit.preview.android.track: "internal"`). Verifies the whole pipeline —
   EAS build, Play App Signing, auto-submit — with no public exposure.
2. **Closed testing — mandatory, not optional.** The console states it outright: *"you'll still
   need to run a closed test before publishing to everyone in production"* (dashboard, 2026-08-03,
   with the "apply for production access" banner). For personal developer accounts Play requires a
   closed test with a minimum number of opted-in testers running for **14 consecutive days** before
   production access can even be requested — the exact tester threshold is shown on the console's
   production-access card (Google has adjusted the figure before; ~20 at the time the policy
   shipped). Recruit the internal riders/testers early, keep them opted in for the full window, and
   **count this 14-day clock into the mid-August Play-approval tripwire**
   (`docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §8). While the clock runs:
   promote the internal build here and run `docs/QA-DEVICE-CHECKLIST.md` on real handsets on the
   target network. This is also where the sensitive-permission review usually surfaces questions.
   When the window completes, **apply for production access** and answer the questionnaire about
   the test.
3. **Production, staged.** First set the repo variable **`EAS_TAG_RELEASES_ENABLED=true`** — the
   tag trigger is separately gated (2026-08-03) so that release-please's near-daily `v*` tags can
   never burn EAS build quota on premature production submits; arming it is the deliberate act of
   opening the release train. Also grant the Play service account the **Release to production**
   permission (deferred at §7.2 setup). Then: tag `v<version>` on `main` → `mobile-release.yml`
   builds and submits to the production track with `releaseStatus: inProgress` and `rollout: 0.1`
   (10%). Advance or halt in Play Console → Releases as crash-free rate holds. Sentry must be live
   before this step so a bad rollout is visible (LR20).
4. **JS-only hotfixes** go out via Actions → *Mobile OTA Update* (no review). Anything touching the
   native layer shifts the `fingerprint` runtime version and **must** go through a store release.

---

## 9. Pre-submission checklist

- [x] §7.1 reviewer-access demo account implemented — founder still sets `DEMO_OTP_PHONE`/`DEMO_OTP_CODE`
- [x] Play Console app created for `zw.co.lynia` (2026-08-03; Play App Signing enrols automatically
      with the first AAB upload)
- [x] Pipeline armed end-to-end (2026-08-03 evening): keystore ✅ · `GOOGLE_MAPS_API_KEY` ✅ ·
      PostHog ✅ · Play service-account key ✅ (API-verified) · `GOOGLE_SERVICES_JSON` ✅ (both
      envs) · robot `EXPO_TOKEN` + `EAS_PROJECT_ID` + `production-mobile` env +
      `EAS_RELEASE_ENABLED=true` ✅ (proven by run #2 executing instead of skipping) ·
      `owner: "lyniago"` in `app.config.ts` (robot tokens require it).
      `scripts/eas-arm.sh --verify` from a founder machine remains the belt-and-braces re-check.
- [ ] `production-mobile` required reviewer set — the OTA human gate (`mobile-ota.yml` bypasses
      Play review). The reviewer picker wouldn't match the owner account on first attempt; retry
      from a desktop browser. Must be closed before first OTA publish.
- [ ] Old personal Expo access token revoked (expo.dev → Access tokens) once the robot-token run
      is green
- [x] Store listing copy (§2) pasted; 512² icon uploaded (founder, 2026-08-03 — console setup tasks
      complete, dashboard at Internal testing)
- [x] Feature graphic + six screenshots (phone, 7" and 10" tablet) produced and validated —
      `store-assets/google-play/` (§6; device-captured shots remain an optional upgrade)
- [x] Data safety form (§3) submitted and matching `legal.content.ts` (founder, 2026-08-03)
- [x] Content rating questionnaire (§4.5) completed (founder, 2026-08-03)
- [ ] Foreground-service-location declaration (§5.1) submitted with demo video
- [ ] Privacy policy + deletion URLs resolving in an incognito window from outside Zimbabwe
- [ ] CDPA duties closed (§7.3): POTRAZ controller registration, DPO appointed, cross-border transfer
      notified, IR runbook carries the 24-hour POTRAZ clock, corporate identity on the pages ratified
- [ ] Sentry receiving crashes from a release build (LR20 exit test)
- [ ] Internal track build installed and smoke-tested on a real device
- [ ] Closed test run per Play's requirement (§8 step 2: opted-in testers, 14 consecutive days) and
      **production access granted** — before any production rollout
