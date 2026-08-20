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
> live before the production staged rollout anyway (§8 step 3, LR20).
> **RESOLVED 2026-08-05:** the Sentry project (`lyniago/lynia-mobile`) now exists, org/project are
> committed as `app.config.ts` plugin props, and `SENTRY_DISABLE_AUTO_UPLOAD` is gone from `eas.json`.
> The failure mode this note describes can no longer reach gradle: `app.config.ts` fails a release
> build up front, naming the missing variable, if `EXPO_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN` are
> unset. Still pending: the founder setting those EAS variables + the device exit test. 6 of ~15 August builds
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
>
> **Status (2026-08-04, attempt-8 outcome — 🎉 FIRST GREEN BUILD; submission blocked on one GCP
> switch, no new build needed).** Build `ea538ebe` (v0.17.9, profile `preview`) **FINISHED**: every
> layer that felled attempts 2–7 passed — fingerprint parity, JS bundle, Sentry skip, javac with the
> corrected `PackageList`, plus the never-before-reached R8/resource-shrink and signing. Artifact: a
> signed `.aab`, **32,545,990 bytes (~31.0 MiB raw, pre-split** — Play's per-device download is
> smaller**)**, on the EAS build page. The Play auto-submit (submission `751d9566`, internal track)
> then errored in fastlane with the exact cause in the log:
> `PERMISSION_DENIED: Google Play Android Developer API has not been used in project 407250490173
> before or it is disabled` — the `androidpublisher.googleapis.com` API was never enabled in the
> GCP project that owns the Play publisher service account
> (`id-play-publisher@lynia-500911.iam.gserviceaccount.com`; 407250490173 is that project's
> number). **Founder fix (~1 minute):** enable it at
> <https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=407250490173>,
> wait a few minutes for propagation, then **retry the submission only** —
> `eas submit -p android --id ea538ebe-92a6-42ea-be36-d93ed3323924` (or the Retry button on the
> submission page). The build is done and reusable; a retry burns **zero** build quota (still 6 of
> ~15 used). If the retry then fails with an app/artifact-not-found class error, that's the §
> first-manual-upload constraint from the attempt-6 note — upload this `.aab` once by hand to
> Internal testing and auto-submit works thereafter. Once the internal-track release is live,
> §8 step 1 is DONE and the 14-day closed-test clock (§8 step 2) can start.
>
> **Status (2026-08-04, post-attempt-8 — androidpublisher API enabled; two Play-side rejections
> diagnosed, one repo fix shipped).** The founder enabled `androidpublisher.googleapis.com`; the
> API-disabled error is gone. The submission retry (`7b2971c5`, zero build quota) then failed with
> `Invalid request — The caller does not have permission` (classic fastlane #16164): the Play
> Console grant for `id-play-publisher@…` needs a forced refresh — Users and permissions → edit the
> SA's app permissions → re-save (documented workaround; occasionally up to 24 h to propagate).
> Meanwhile the founder attempted the manual Console upload of build `ea538ebe` and Play
> hard-rejected the artifact itself: **"Your app currently targets API level 34 and must target at
> least API level 35"** — Google's target-API floor for new apps (Android 15), while Expo SDK 52
> defaults to targetSdk 34. This blocks EVERY upload path (console and API alike), so a rebuild is
> mandatory. Fix shipped: `expo-build-properties` now pins `compileSdkVersion: 35` +
> `targetSdkVersion: 35` (compile was already 35 via the SDK 52 template; target is the change),
> and `eas.json` base gained `autoIncrement: true` so the next build gets versionCode 2 — Play may
> have registered vc 1 during the blocked upload, and preview builds previously never incremented.
> QA note for the next internal build: targeting 35 turns on enforced edge-to-edge on Android 15
> handsets — check nothing hides behind system bars (`docs/QA-DEVICE-CHECKLIST.md`). Attempt 9 goes
> out once this merges; on it, EITHER the refreshed SA lets auto-submit finish end-to-end, or the
> founder uploads the new vc-2 `.aab` manually — both paths are now unblocked.
>
> **Status (2026-08-04, ~10:00 UTC — 🚀 INTERNAL-TRACK RELEASE LIVE; §8 step 1 COMPLETE; pipeline
> proven end-to-end).** Attempt 9's build `c248fbf5` (v0.17.9, versionCode 2, targetSdk 35)
> FINISHED — second consecutive green build, confirming the API-35 change compiled clean. Its
> auto-submission and two retries still failed on the SA permission error; the founder then **added
> the service account as a Play Console user with app-level permissions** (the 2026-08-03 grant
> evidently never materialised at app level — the fresh add, not the re-save, was the actual
> unlock), and the next retry (submission `574bf5fd`, zero build quota) **FINISHED**: the `.aab`
> is on the **internal testing** track, submitted entirely from EAS servers. The Play release
> pipeline is proven END-TO-END — dispatch → frozen-parity build → auto-submit — across 9 dispatch
> attempts / 7 EAS builds (6 of ~15 August quota), every failure classed and fixed forward in this
> ledger. Founder next steps: ① Internal testing → Testers tab → email list + share the opt-in
> link; ② install on a real device and run `docs/QA-DEVICE-CHECKLIST.md` (including the
> edge-to-edge check on an Android 15 handset); ③ **Promote the release to a Closed testing track
> and get the required testers opted in — that starts the mandatory 14-day clock** (§8 step 2, the
> long pole for the mid-August tripwire); ④ housekeeping now unblocked by a green robot-token run:
> revoke the old personal Expo access token (§9 checklist), and set the `production-mobile`
> required reviewer before first OTA use.
>
> **Addendum (same event, verified against the EAS API — submission timeline, artifact, and what
> this does *not* prove).** The exact record, since "the pipeline works" is a claim the next
> incident will lean on: build `c248fbf5` finished **09:18:32 UTC**; submissions against it went
> `d6535feb` ERRORED 09:20:48 → `b8284d83` ERRORED 09:34:45 (both
> `SUBMISSION_SERVICE_ANDROID_SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS`) → **`574bf5fd` FINISHED
> 09:48:01**, track `internal`, `releaseStatus: COMPLETED`. Live artifact: **32,546,001 bytes
> (31.04 MiB raw, pre-split)**. Correction to the quota figures used above and in the attempt-5/6/8
> blocks: the EAS project shows **8 builds created in August** (2 on 08-03, 6 on 08-04) and 10
> all-time — the running "3/4/5/6 of ~15" counts drifted low. Submission retries remain free.
>
> **What it proves:** Channel B — dispatch → EAS build → EAS auto-submit → Play internal track —
> runs end to end unattended, and versionCode 2 *replaced* versionCode 1, so an **update** was
> exercised, not just a first upload. **What it does not prove:** Channel A (OTA) has never run
> once. Two defects block it — `REL-01` and `REL-02` in `docs/KNOWN_BUGS.md`, summarised in §8a.
> Do not read "the update pipeline works" as covering the OTA lane; today it means the store lane
> only, and a hotfix costs a full store round-trip.
>
> **Two things worth not losing now that it's live:** the app is on **internal testing**, not
> production — `play.google.com/store/apps/details?id=zw.co.lynia` returns **404**, exactly as a
> non-public track should. And Sentry is still unprovisioned with `SENTRY_DISABLE_AUTO_UPLOAD=true`,
> so **the live build reports no crashes and has no source map** (§8a) — LR20 is half-met, and the
> closed test in step 2 would otherwise run blind.
>
> **Update 2026-08-05:** the crash-telemetry half is now wired end to end in-repo (Sentry project
> `lyniago/lynia-mobile`, R8 mapping upload enabled, upload kill-switch removed, DSN passed through
> the OTA and QA-APK lanes, release builds refused without it). The statement above still holds for
> **the currently-installed binary** — telemetry only reaches devices in a NEW build, so the next
> store release is what actually closes this, and the closed test should not start before it.
>
> **Status (2026-08-12 — v0.30.0 shipped to the internal track; all three production lanes green in
> one pass, no failure class).** A full deploy-everything run at `main` = `96a55d3`:
> ① **API** (`release.yml` run 31591975827) — image promoted from the green staging build, migrations
> applied, no-traffic revision, canary 10% → 50% → 100% with every gate passing; promoted 11:37:34 UTC.
> Independently verified serving through the LB: `GET /healthz` → 200
> `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`. ② **Admin console**
> (`deploy-admin.yml` run 31591977498) — boot smoke green (public asset 200, gated route fails closed
> 401), IAP invoker granted, promoted 100% at 11:31:55 UTC. ③ **Mobile** (`mobile-release.yml` run #18
> = 31591984928, **profile `preview`** per the §8-step-3 rule — production remains unarmed): EAS build
> `fe622d6b-44e7-41d5-9e35-65185d4ef637` **FINISHED** (~12 min), submission
> `d8f43de1-a16a-4797-b162-20b9a28e2bcf` **FINISHED**, track `internal`. First dispatch since
> 2026-08-10 to go build→submit clean on the first attempt with zero retries.
>
> **The load-bearing detail: the fingerprint held across a version jump.** This build's
> runtimeVersion is `0132a2cf489cedbd85a573cbc829aac28066b0ee` — **byte-identical** to the 2026-08-10
> builds, across 0.22.0 → 0.30.0. That is `REL-01`'s fix (`fingerprint.config.js` `sourceSkips:
> ["ExpoConfigVersions"]`) demonstrated on a real multi-minor bump, not just asserted: version fields
> genuinely do not feed the hash, so this binary and its predecessors share one OTA runtime and the
> lane stays usable for JS-only hotfixes.
>
> **What this run does NOT establish.** It is the **internal** track, exactly as before — the app is
> still not public and `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design.
> Nothing here advances §8 step 2: the closed test, its mandatory ~14-day clock, and production access
> are all untouched and remain the gate to any production rollout. Nor does a FINISHED submission
> prove the binary *runs* — `MOB-BOOT-01` was found on a green build, so the device smoke in
> `docs/QA-DEVICE-CHECKLIST.md` is still the real exit test.
>
> **Status (2026-08-12, late — v0.31.0 shipped to the internal track; API + mobile both green, second
> clean first-attempt run in a row).** A deploy of everything that had landed since the v0.30.0 run,
> at `main` = `6f5eaae` (release-please `chore(main): release 0.31.0`, carrying the RC.home live-order
> cards and the cold-start flag-off flash fix). CI run 31614169660 green on that exact sha before
> anything was dispatched.
> ① **API** (`release.yml` run 31614169614, #567) — staging gate passed, `prisma migrate deploy`
> reported **no pending migrations** (50 found), revision `lynia-api-01146-gus` deployed with
> `--no-traffic` then canaried **10% → 50% → 100%** with every health gate passing; promoted
> 15:58:24 UTC, previous revision `lynia-api-01142-qof` left intact as the rollback target.
> Independently verified through the LB: `GET https://lyniago.lyniafinance.com/healthz` → 200
> `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`.
> ② **Admin console** — **deliberately not deployed.** Nothing under `apps/admin/**`,
> `apps/merchant/**` or `packages/shared/**` changed since `96a55d3`, so `deploy-admin.yml`'s path
> filter would not have fired and a dispatch would have shipped a byte-identical image. Recording the
> skip rather than the click.
> ③ **Mobile** (`mobile-release.yml` run #19 = 31614444306, **profile `preview`** per the §8-step-3
> rule — production stays unarmed): EAS build `8fcf3bcf-e511-476c-9769-e4606065158b` **FINISHED**
> (15:50:53 → 15:59:49 UTC, ~9 min), v0.31.0 **versionCode 11** (auto-incremented from 10), raw
> `.aab` **31.34 MiB** before Play's per-device split; submission
> `5b2fff8e-3a7d-41ac-916b-08d5ad605d34` **FINISHED**, track `internal`, `releaseStatus COMPLETED`,
> no error.
>
> **The fingerprint held again, across another minor.** This build's runtimeVersion is
> `0132a2cf489cedbd85a573cbc829aac28066b0ee` — **byte-identical** to the 0.30.0 and 2026-08-10
> builds, now across 0.22.0 → 0.30.0 → 0.31.0. `REL-01`'s fix keeps holding on real version bumps,
> so this binary shares an OTA runtime with its predecessors. The pre-dispatch guard from
> `CLAUDE.md` was run rather than assumed: `pnpm install --frozen-lockfile` locally, clean on
> pnpm 10.33.0, and `pnpm-lock.yaml`/`eas.json` were confirmed unmoved since the last green build —
> so builder and runner computed the same fingerprint, and `CONFIGURE_EXPO_UPDATES` was never at risk.
>
> **What this run does NOT establish** — unchanged from the v0.30.0 entry, and worth repeating rather
> than letting two clean runs imply progress that did not happen. It is still the **internal** track;
> `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design. §8 step 2 is untouched:
> the closed test, its mandatory ~14-day clock, and production access remain the gate to any
> production rollout, and nothing in this run started that clock. A FINISHED submission still does not
> prove the binary *runs* — `MOB-BOOT-01` was found on a green build — so the real exit test remains
> the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.
>
> **Status (2026-08-13 — v0.34.0 dispatched to the internal track by a Claude session on explicit
> request; clean first-attempt run, third consecutive.)** `mobile-release.yml` run #20
> (31667204815), **profile `preview`** per the §8-step-3 rule — production remains unarmed — ref
> `main` @ `9f4f0def` (app version `0.34.0` at that commit; release-please bumped main to `0.35.0`
> ~13 minutes later, unrelated to this build). Ownership guards run rather than assumed before
> dispatch, per `CLAUDE.md`: no other reachable Claude session and no in-flight `mobile-release.yml`
> run (so this session owned the deploy solo), CI green on the dispatched commit, and
> `pnpm install --frozen-lockfile` clean with `pnpm-lock.yaml`/`eas.json` unmoved against
> `origin/main`.
>
> EAS build `2f85f958-091f-42d4-bb80-40a680d00d02` **FINISHED**; submission
> `47feed6a-098a-4408-b10c-046a53cadc8e` **FINISHED**, track `internal`, no error — confirmed on the
> first `eas-build-status.yml` check, ~19 minutes after dispatch, no retries. runtimeVersion
> `0132a2cf489cedbd85a573cbc829aac28066b0ee` is **still byte-identical** to every build since 0.22.0
> (now spanning 0.22.0 → 0.30.0 → 0.31.0 → 0.34.0) — `REL-01`'s fingerprint fix keeps holding on real
> version bumps.
>
> **What this run does NOT establish** — unchanged from the last two entries. It is still the
> **internal** track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design.
> §8 step 2 (closed test, its mandatory ~14-day clock, production access) remains untouched — nothing
> here started that clock. A FINISHED submission does not prove the binary *runs* — the real exit
> test remains the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.
>
> **Status (2026-08-16 — v0.36.1 dispatched to the internal track by a Claude session on explicit
> "ship to Expo and Google Play, track the build" request; clean first-attempt run, fourth
> consecutive.)** Ownership guards run rather than assumed before dispatch, per `CLAUDE.md`:
> `list_sessions` showed no other reachable Claude session mid-deploy, no in-flight
> `mobile-release.yml` run (the last, run #20 / `31667204815`, completed 2026-08-13), CI green on the
> dispatched commit (run `31947129363` on `main` @ `b7bba818`), and `pnpm install --frozen-lockfile`
> clean on pnpm 10.33.0 with `pnpm-lock.yaml`/`eas.json` unmoved against `origin/main`.
>
> `mobile-release.yml` run #21 (`31947511372`), **profile `preview`** per the §8-step-3 rule —
> production remains unarmed — ref `main` @ `b7bba818240fd27beab7f3b245683c77618f0cfe` (app version
> `0.36.1`). The dispatcher job completed in 65 s (12:36:17 → 12:37:22 UTC), as expected for
> `--no-wait`: that only proves the build was queued, not that it finished, so tracking continued via
> `eas-build-status.yml`.
>
> EAS build `ccc99fd5-cd30-4e33-804b-dbd9a63663c3` **FINISHED**; submission
> `a18ea714-8b29-423a-8ef9-a0cc2afcd9c9` **FINISHED**, track `internal`, no error — confirmed on the
> first `eas-build-status.yml` check (run #24, `31948530251`, dispatched ~22 minutes after the release
> dispatch), no retries needed.
>
> **New gap found while verifying, not fixed here.** The `eas build:list --json` response carried no
> non-null `channel` or `runtimeVersion` values for **any** listed build in this run's window —
> `eas-build-status.yml`'s own jq formatting (`// "?"`) is what rendered that as `channel=?`/`runtime=?`
> in the log, not literal CLI output — including the four earlier builds whose runtimeVersion is on
> record above as `0132a2cf489cedbd85a573cbc829aac28066b0ee`. I.e. the underlying JSON fields the Recap
> step reads came back null for builds that provably have them, not just the new one. This
> run's `eas-cli` was `22.0.0` (prior entries never recorded the CLI version, so there's no in-doc
> baseline to compare against); a CLI/API field rename is the likely cause. Practical effect: **this
> run cannot confirm the runtimeVersion fingerprint held** the way every entry since 2026-08-12 did —
> the data to check it was simply not returned, not necessarily that it changed. Recording this as an
> observation rather than fixing `eas-build-status.yml`'s query, which is outside the scope of a
> ship-and-track request — worth a follow-up session.
>
> **What this run does NOT establish** — unchanged from prior entries. It is still the **internal**
> track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design. §8 step 2
> (closed test, its mandatory ~14-day clock, production access) remains untouched. A FINISHED
> submission does not prove the binary *runs* — the real exit test remains the device smoke in
> `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.
>
> **Status (2026-08-16, later — recovered an orphaned dispatch, shipped the #768 UI change, and an
> operator error queued an unintended production submission; two of three resolved, one still in
> flight.)** Three distinct events from one continuation session, in the order discovered.
>
> **① Recovered a dropped tracking obligation.** A separate session dispatched `mobile-release.yml`
> run #22 (`31958630297`, 16:26:48 UTC, `main`@`f9dbccd`, v0.37.0) and armed a one-shot `send_later`
> check-in to confirm it — but that session ended before the check-in fired, and the trigger
> auto-disabled itself (`ended_reason: auto_disabled_session_gone`) without ever checking the
> outcome. This session found the dead trigger via `list_triggers` and verified directly: EAS build
> `44c73459-ef27-46d0-b393-c35708e9efa1` **FINISHED**, submission
> `31643b12-312c-4d0d-ba1f-578075729752` **FINISHED**, track `internal`. Nothing was wrong with what
> shipped — only with who confirmed it shipped.
>
> **② v0.38.0-content is now on the internal track: #768's settings redesign.** `main` had moved two
> commits past the last confirmed build: #768 (mobile settings adopts the Account tab's card design,
> a real UI change) and #767 (Terraform-only, no mobile impact — also the commit that introduced
> `.github/CODEOWNERS` with `* @unnfazzed`, which surfaced separately while merging PRs this
> session). Ownership guards ran rather than were assumed: no reachable Claude session
> (`ListAgents`), no in-flight `mobile-release.yml` run, CI green on `main`@`909bee5`, `pnpm install
> --frozen-lockfile` clean on pnpm 10.33.0 with the lockfile unmoved. Dispatched `mobile-release.yml`
> run `31965445147` (**profile `preview`**, ref `main`@`909bee59c5d816c483a600e14faf4c24cf95bd7b`).
> EAS build `333ebcda-359d-486d-bfad-1d44fe2edc95` **FINISHED**; submission
> `fed0f9d3-d007-49f8-a59b-cd1960d510f4` **FINISHED**, track `internal`. Still internal-testing only —
> §8 step 2 (closed test, its 14-day clock, production access) remains untouched.
>
> **③ Operator error — an empty-input redispatch queued a live production submission attempt.** While
> issuing a follow-up `eas-build-status.yml` check, a mistaken parallel tool call re-dispatched
> `mobile-release.yml` itself with **no inputs**, which resolves to the workflow's declared defaults —
> `profile: production`, `submit: true` — exactly the dangerous default this doc has warned about
> since 2026-08-10 (§ "the `profile` input is load-bearing"). This was not caught before it ran: job
> `31966592192` (19:06:30–19:07:14 UTC) executed, built, and reached **"✔ Scheduled Android
> submission."** EAS build `e0298874-c136-4a51-ab78-881985094039` — app version `0.37.0` (the version
> string on `main` before #769 merges), **versionCode 16** (auto-incremented from 15) — targeted
> **`production`**, release status `IN_PROGRESS`, **rollout `0.1`** (10% staged), using the on-file
> service account (`id-play-publisher@lynia-500911.iam.gserviceaccount.com`). Submission
> `62646dbc-4c03-4a8f-abd7-25922815b253` was, as of the last check this session (19:10 UTC, via
> `eas-build-status.yml` run `31966763407`), status **`AWAITING_BUILD`** — queued behind the build,
> not yet actually attempted against the Play API — and the build itself was still **`IN_PROGRESS`**.
> Per §7.2 and the profile table above, this service account's production-release grant was
> **deliberately deferred** (testing-track permissions only), so the expected outcome once the build
> finishes and EAS actually calls Play is an `ERRORED` submission, not a live rollout — **but that
> expectation is not yet confirmed as of this entry; treat it as a live incident, not a closed one,
> until a follow-up addendum lands here.** No workflow in this repo can cancel an in-flight EAS build
> or a scheduled Play submission; that requires the Expo dashboard
> (`expo.dev/accounts/lyniago/projects/lynia/builds/e0298874-…`) or Play Console directly. Cost
> regardless of outcome: one EAS build burned from the monthly allowance for a dispatch that was
> never supposed to happen.
>
> **Net effect, pending ③'s resolution.** Two builds confirmed shipped to the **internal** track
> (recovered orphan + the #768 UI change); `play.google.com/store/apps/details?id=zw.co.lynia` still
> 404s by design; §8 step 2 remains untouched. And, newly: **the workflow's `production` default is
> not just a theoretical footgun — it fired for real today**, on a manual dispatch, not a tag push.
> Until `EAS_TAG_RELEASES_ENABLED` and the production submit train are deliberately armed (§8 step 3),
> every dispatch of `mobile-release.yml` — human or agent — must pass `profile: preview` explicitly;
> this doc already said so, and it still wasn't enough to prevent a slip. Worth a follow-up the owner
> should decide on (touches `.github/workflows/`, which is now CODEOWNERS-gated): default the
> workflow's `profile` input to `preview` instead of `production`, so an omitted/empty input fails
> safe instead of failing toward production.
>
> **Addendum (19:32 UTC, ③ resolved — submission ERRORED, no production impact).** Re-checked via
> `eas-build-status.yml` run `31967851748` with `build_id=e0298874-…` explicit. Build
> `e0298874-c136-4a51-ab78-881985094039` reached **FINISHED** (583.8s Gradle build, 31.3 MB `.aab`).
> Its submission `62646dbc-4c03-4a8f-abd7-25922815b253` reached **ERRORED** —
> `SUBMISSION_SERVICE_ANDROID_UNKNOWN_ERROR`, "Fastlane supply failed. We couldn't figure out what
> went wrong." A generic Fastlane failure rather than the specific
> `…SERVICE_ACCOUNT_IS_MISSING_PERMISSIONS` class seen historically for permission gaps, so the exact
> proximate cause is unconfirmed — but the outcome that matters is unambiguous either way: **the
> submission never reached a `FINISHED` state, so nothing was published to the production track. No
> rollout, staged or otherwise, went live.** Net cost of the whole incident: one EAS build spent from
> the monthly allowance on a dispatch that should never have happened, and about 25 minutes of
> tracking. Nothing else. Both other builds this session remain **FINISHED**/**FINISHED**, track
> `internal`, as recorded above.

> **Status (2026-08-17 — v0.38.0 dispatched to the internal track by a Claude session on explicit
> user instruction, "dispatch an EAS build and updated google play app").** Ownership guards ran
> first: no open PRs, no in-flight `mobile-release.yml` run, CI green on `main`@`962a38c` (#777, the
> weekly test-prune routine — test/docs only, no mobile code change), `pnpm install
> --frozen-lockfile` clean with the lockfile unmoved. Dispatched `mobile-release.yml` run
> `31999990280` explicitly with **`profile: preview`, `submit: true`** — never the bare/default
> dispatch, per the standing warning above and the incident it describes. GitHub-side job succeeded
> in 58s (06:01:37–06:02:35 UTC), queuing the build on Expo's servers.
>
> EAS build `7cef4273-e999-42ff-8a8a-b2e41781778e` (profile `preview`, app version `0.38.0` per
> `app.config.ts` on the built commit; exact versionCode not captured — `eas-build-status.yml`'s
> recap doesn't query that field) reached **FINISHED**. Its submission
> `151c0a0c-1fb9-4f95-8e8d-e02df2ed422a` reached **FINISHED**, track **`internal`** — confirmed via
> `eas-build-status.yml` run `32002115999`. Dispatch-to-terminal: ~31 minutes (06:02–06:33 UTC),
> consistent with the documented "tens of minutes." Still internal-testing only —
> `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design; §8 step 2 (closed test,
> 14-day clock, production access) remains untouched.

> **Status (2026-08-17, later — main's CI was red at request time; fixed forward, then v0.38.0
> re-dispatched to the internal track on a newer main.)** A Claude session was asked to "make sure
> everything is deployed to main successfully and create an EAS build and deploy to Play Store,
> track it." Checking main before dispatching (rather than assuming the morning's build meant main
> was still healthy) found `main`@`e7cc885` (#791) red: `osv-scanner`'s dependency-audit gate failed
> on **`GHSA-ggr8-5vv4-36mx`, CVSS 8.2, in `deepmerge-ts@7.1.5`** — a transitive dep of
> `@prisma/config@7.9.1` (Prisma's CLI config loader, exercised by `prisma migrate deploy` in
> `release.yml`), pinned there to an *exact* version with no newer stable Prisma release available to
> absorb a fix on its own.
>
> Fixed with a `pnpm.overrides` entry forcing `deepmerge-ts` to the patched `8.0.1` — the same
> mechanism already used for every other transitive-dep CVE in this repo (PR #792). Verified before
> pushing: `prisma validate` still loads `prisma.config.ts` cleanly against `8.0.1`, the CI-equivalent
> `osv-scanner` gate re-run locally reports 0 High/Critical, and the full `pnpm typecheck && pnpm
> build && pnpm test` (all 6 turbo packages plus `@lynia/admin` and `@lynia/merchant`, matching
> `ci.yml`'s `build` job step-for-step including its `prisma:generate` step) is green. CI confirmed
> green on `main`@`2b98457` (#792 squash-merged), and the PR was taken through the same
> draft→CI-green→merge-on-green flow as any other Claude-authored PR here.
>
> **Main kept moving underneath the fix.** `dependabot-auto-merge.yml` merged three more PRs
> (#785, #786, #788 — GitHub Actions + production-dependencies bumps) in the few minutes between
> #792 merging and dispatch. Re-ran the ownership guards against the actual moving target rather than
> the commit last observed: no other reachable Claude session (`ListAgents`), no in-flight
> `mobile-release.yml` run, CI green on the new tip `main`@`7543239` (#788), `pnpm install
> --frozen-lockfile` clean run against that exact tip (not the earlier, by-then-stale, checkout).
>
> Dispatched `mobile-release.yml` run `32045980556` (run #26) explicitly with **`profile: preview`,
> `submit: true`**, ref `main`@`75432394036e069d71a8c0bccf0c4395bffb5d17`. GitHub-side job succeeded
> in 67s (16:31:16–16:32:23 UTC). EAS build `98d1a388-de43-48c4-a755-32b1d02b6ace` (profile
> `preview`, app version `0.38.0`, **versionCode 18**) reached **FINISHED**; its submission
> `de358530-e095-44ac-8b59-652695edc2a2` reached **FINISHED**, track **`internal`**, no error —
> confirmed on the *first* `eas-build-status.yml` check (run `32046972874`, ~13 minutes after
> dispatch), no retries needed. `eas-build-status.yml`'s `runtime=?` gap (recorded 2026-08-16, a
> jq-formatting issue reading null `runtimeVersion` from `eas build:list --json`) is still open and
> not fixed here — out of scope for a ship-and-track request, same as last time.
>
> **Housekeeping left for a human/future session:** PR #787 (dev-dependencies bump) and #782
> (release-please `chore(main): release 0.39.0`) are still open; the former will likely auto-merge via
> `dependabot-auto-merge.yml`, the latter is not auto-merged by anything in this repo and needs an
> explicit decision to cut the release. Neither blocks this entry's "deployed to main successfully"
> claim — no open PR represented unmerged feature work, and both are routine/bot-owned. **What this
> run does NOT establish** — unchanged from every entry since 2026-08-12: still the **internal** track
> only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design; §8 step 2 (closed
> test, 14-day clock, production access) remains untouched; a FINISHED submission does not prove the
> binary *runs* — the real exit test remains the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a
> handset, by a human.

> **Status (2026-08-17, night — v0.40.1 shipped to the internal track; the whole deploy surface
> checked first, and two of its three lanes needed nothing.)** A Claude session was asked to "check
> all PRs properly deployed" and then build and ship. The check came first and is the reason this
> entry can claim more than "the mobile build was green".
>
> **The deploy surface, lane by lane.** ① **Open PRs: none** — every PR was merged, so no unshipped
> work was sitting in review. `main` = `a972733` (release-please `chore(main): release 0.40.1`).
> ② **API** (`release.yml` run 633 = `32069637896`) — staging gate passed, image promoted from the
> green staging build, migrations applied (the in-VPC Cloud Run job correctly skipped, the proxy path
> having handled them), new revision deployed `--no-traffic` with the rollback target captured, then
> the graduated canary passed and promoted at **21:19:53 UTC**; the roll-back-on-failed-canary step
> skipped, as it should on a clean run. Verified independently through the LB rather than inferred
> from the green tick: `GET https://lyniago.lyniafinance.com/healthz` → 200
> `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`. ③ **Admin/merchant — deliberately not
> dispatched.** Nothing under `apps/admin/**`, `apps/merchant/**` or `packages/shared/**` has changed
> since `deploy-admin.yml` run #79 (`e768b7e`); the one `packages/shared/src/design-tokens.ts` change
> in this window (`732de11`) was already carried by that deploy. A dispatch would have shipped a
> byte-identical image, so this records the skip rather than the click — same call as the v0.31.0 entry.
>
> **Why the mobile build was genuinely due.** Since the last shipped build (`98d1a388`, v0.38.0
> versionCode 18, at `7543239`), **91 files under `apps/mobile`** changed: the customer-home rebuild to
> the 8c handoff, the rider board's mint header, the always-online rider change (pill and switch
> removed), the rider location row going detect-only, and the removal of the last two manual refreshes.
> This is a real UI delta, not a version-string bump.
>
> **Ownership guards ran rather than were assumed**, per `CLAUDE.md`: no reachable Claude session
> (`ListAgents`), no in-flight `mobile-release.yml` run (last was #26, completed 16:31 UTC), CI green
> on the dispatched commit (run `32069637526` on `main`@`a972733` — 7 jobs success, `design-freeze`
> skipped as it is PR-only), and `pnpm install --frozen-lockfile` clean on pnpm 10.33.0 against that
> exact tip with `pnpm-lock.yaml` unmoved afterward.
>
> Dispatched `mobile-release.yml` run #27 (`32070032517`) explicitly with **`profile: preview`,
> `submit: true`** — never the bare/default dispatch, per the standing warning above and the
> 2026-08-16 incident where an empty-input redispatch queued a live production submission. The
> dispatcher job succeeded in 51 s (21:14:12 → 21:15:03 UTC), which under `--no-wait` proves only that
> the build was queued.
>
> EAS build `7ecf82b4-805c-4eb0-93c0-0f1df7e49a0a` (profile `preview`, app version **0.40.1**,
> **versionCode 19**, auto-incremented from 18) reached **FINISHED**. Its submission
> `3ac2d711-43f6-4b1b-afc3-83fd219d5fec` reached **FINISHED**, track **`internal`**, no error —
> confirmed on the *first* `eas-build-status.yml` check (run #32, `32071644611`), no retries.
> Dispatch-to-terminal ≈ 19 minutes (21:14 → 21:33 UTC). The submit step logged `Rollout: undefined`
> and `Release status: COMPLETED` against track `internal`, i.e. the preview lane's config, **not** the
> production profile's 10% staged rollout — worth recording because it is the exact field that would
> have differed had the dangerous default fired.
>
> **Two observations recorded rather than acted on.** ① Expo reported a **partial EAS Submit outage**
> in the dispatch log ("iOS Submissions hanging on App Store Connect build uploads"). It did not affect
> this Android submission, which finished clean — noted so a future session reading this log line does
> not mistake it for a cause. ② The **`runtime=?` gap first recorded 2026-08-16 is still open**: the
> Recap again rendered `runtime=?` for all three listed builds, so — as on 2026-08-16 and 2026-08-17
> (16:31) — **this run cannot confirm the runtimeVersion fingerprint held**. The data was not returned;
> that is not evidence it changed. Still out of scope for a ship-and-track request, and still worth a
> follow-up session to fix `eas-build-status.yml`'s jq/query.
>
> **What this run does NOT establish** — unchanged from every entry since 2026-08-12: still the
> **internal** track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design;
> §8 step 2 (closed test, its mandatory ~14-day clock, production access) remains untouched and nothing
> here started that clock; and a FINISHED submission does not prove the binary *runs* — `MOB-BOOT-01`
> was found on a green build, so the real exit test remains the device smoke in
> `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.

> **Status (2026-08-18 — v0.41.1 shipped to the internal track; clean single-session run covering PRs,
> GCP, and mobile in one pass.)** A Claude session was asked to "make sure all PRs merged and in GCP,
> then build expo and push to google play, track rollout completion."
>
> **The deploy surface, checked before dispatching anything.** ① **Open PRs: none** —
> `list_pull_requests` returned empty; `main` = `83b3a5a` (release-please `chore(main): release 0.41.1`,
> merging #810), CI green (run 1811). ② **API** (`release.yml` run 640) — green at that exact sha;
> independently verified through the LB rather than inferred from the tick: `GET
> https://lyniago.lyniafinance.com/healthz` → 200 `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`.
> ③ **Admin console — deliberately not dispatched.** Nothing under `apps/admin/**`, `apps/merchant/**`
> or `packages/shared/**` changed since `deploy-admin.yml` run #80 (`9b5e0de`); a dispatch would have
> shipped a byte-identical image, so this records the skip rather than the click.
>
> **Why the mobile build was genuinely due.** Since the last shipped build (`7ecf82b4`, v0.38.0, at
> `7543239`), 49 files under `apps/mobile` changed — the customer-journey load-perf work (RCA + D1-D6,
> #805/#806), including a new `RemoteImage.tsx` and touches to `Avatar`, `ComposeMap`, `CoverPhoto`,
> `FoodThumb`, `MapPicker`, `MenuRow`, `ShopLogo`, `RestaurantCard`, `PickupPhoto`, `SendPriceQuote`,
> `util.ts`. A real UI/perf delta, not a version-string bump.
>
> **Ownership guards ran rather than were assumed**, per `CLAUDE.md`: no reachable Claude session
> (`ListAgents`), no in-flight `mobile-release.yml` run (last was run #27, completed 2026-08-17
> 21:14 UTC), CI green on the dispatched commit, and `pnpm install --frozen-lockfile` clean on
> pnpm 10.33.0 with `pnpm-lock.yaml`/`eas.json` unmoved against `origin/main`.
>
> Dispatched `mobile-release.yml` run #28 (`32118917055`) explicitly with **`profile: preview`,
> `submit: true`** — never the bare/default dispatch, per the standing warning above and the
> 2026-08-16 incident. Ref `main`@`83b3a5a5cfb9e8da37b568a52a573c582f24de22` (app version **0.41.1**).
> The dispatcher job succeeded in 47 s (08:55:57 → 08:56:44 UTC), which under `--no-wait` proves only
> that the build was queued.
>
> EAS build `834ab6d1-f86b-4e7e-813a-62c88d5e2296` (profile `preview`, created 08:56:39 UTC) reached
> **FINISHED**. Its submission `ac6ddbc6-2ba5-40ed-afe3-7a90e3a33f90` reached **FINISHED**, track
> **`internal`**, no error — confirmed on the *first* `eas-build-status.yml` check (run #33,
> `32120920844`, dispatched ~23 minutes after the release dispatch), no retries needed. Exact
> versionCode not captured — `eas-build-status.yml`'s recap doesn't query that field.
>
> **The `runtime=?` gap first recorded 2026-08-16 is still open.** This run's Recap again rendered
> `runtime=?` for every listed build, so — as on every check since — this run cannot confirm the
> runtimeVersion fingerprint held. The data was not returned; that is not evidence it changed. Still
> out of scope for a ship-and-track request.
>
> **What this run does NOT establish** — unchanged from every entry since 2026-08-12: still the
> **internal** track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design;
> §8 step 2 (closed test, its mandatory ~14-day clock, production access) remains untouched and nothing
> here started that clock; a FINISHED submission does not prove the binary *runs* — the real exit test
> remains the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.

> **Status (2026-08-19 — v0.42.0 shipped to the internal track; a stuck release-please CI run and a
> 21-minute GCP deploy pause both diagnosed and resolved without any code change.)** A Claude session
> was asked to "deploy EAS build and push to play store, make sure all PRs are merged to main and to
> GCP, track until completion."
>
> **① Open PRs: one, and it wasn't running.** `list_pull_requests` found `#828`
> (`chore(main): release 0.42.0`, release-please, base `main`@`0b08e9c`). Its CI run
> (`32249620876`) had concluded **`action_required` with zero jobs created** — the run's
> `triggering_actor` was `github-actions[bot]` itself (release-please's own push), and this repo's
> Actions settings evidently gate bot-triggered runs behind an approval the same way fork PRs are
> gated. No tool here can click "Approve and run," but re-running the same workflow run
> (`rerun_workflow_run`) re-attributed `triggering_actor` to this session's own write-access identity
> and the gate cleared on attempt 2 — CI went green (8/8 checks) in under 3 minutes. **This will
> recur on every future release-please PR** until someone with write access disables that Actions
> setting (Settings → Actions → General) or a session repeats this one-time rerun nudge; not a code
> bug, so nothing was changed to "fix" it beyond noting the workaround here.
>
> PR #828 was merged (`fb094420`) once green. **Its diff was empty** — `git diff 0b08e9c..fb094420`
> returns nothing, and both commits share `tree_id` `0f110a5…2755`. Release-please had opened #828
> against a base that, by merge time, already carried equivalent content from an earlier
> release-please cycle (#826, merged minutes earlier as part of `0b08e9c`) — a race between two
> overlapping release PRs, not a merge error. Worth recording since it also explains ②: a zero-file
> push vacuously satisfies every `paths-ignore` pattern, so `release.yml` never fired for `fb094420`
> at all — by design, not a miss.
>
> **② API** (`release.yml` run `32249607092`, on `main`@`0b08e9c` — pushed by the #827/#826 merges
> just before this session started, and covering `fb094420` too since their trees are identical).
> Staging gate passed at 11:54:59 UTC. The `build · migrate · deploy` job then sat at
> **`status: waiting`, zero step progress, for 21 minutes** — indistinguishable from a stuck
> required-reviewer gate on the `production` environment. Flagged to the user as needing their
> action rather than guessed at or bypassed; it resolved on its own at 12:16:14 UTC with no human
> intervention, so it reads as a bounded environment wait-timer, not an approval gate — recording
> both readings since only one was ever confirmed. Once started: migrations applied (Cloud SQL Auth
> Proxy path; the in-VPC job correctly skipped), no-traffic revision deployed, canary graduated
> **10% → 50% → 100%**, promoted 12:22:09 UTC, rollback step skipped as expected on a clean run.
> Independently verified through the LB rather than inferred from the tick: `GET
> https://lyniago.lyniafinance.com/healthz` → 200 `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`.
>
> **Admin/merchant — deliberately not dispatched.** Nothing under `apps/admin/**`, `apps/merchant/**`
> or `packages/shared/**` changed since `deploy-admin.yml`/`deploy-merchant.yml`'s last green runs
> (both at `640adb1`); only mobile files, docs, and the release manifest moved since — recording the
> skip rather than the click, same call as every prior entry.
>
> **Why the mobile build was genuinely due.** #827 (merged just before this session) carried
> `eb3d983`, a real mobile fix (nav key, prewarm yield, guardrail hole) on top of the tap-latency
> feature already released in #826 — not a version-string-only bump.
>
> **Ownership guards ran rather than were assumed**, per `CLAUDE.md`: `ListAgents` clear (checked
> before and after the CI-gate fix), no in-flight `mobile-release.yml` run (last was run #28,
> completed 2026-08-18), CI green on the dispatched commit (`main`@`fb094420`, run `32251667585`),
> and `pnpm install --frozen-lockfile` clean on pnpm 10.33.0 against that exact tip in an isolated
> worktree (`pnpm-lock.yaml` and `apps/mobile/eas.json` unmoved afterward).
>
> Dispatched `mobile-release.yml` run #29 (`32251984657`) explicitly with **`profile: preview`,
> `submit: true`** — never the bare/default dispatch, per the standing warning above and the
> 2026-08-16 incident. Ref `main`@`fb094420a3a47381d69b103e4a3508d0fa32a6fc`. The dispatcher job
> succeeded in 63 s (12:18:33 → 12:19:36 UTC), which under `--no-wait` proves only that the build was
> queued.
>
> EAS build `1253099d-3248-45a7-8b7a-d2c12c45e379` (profile `preview`, created 12:19:29 UTC) reached
> **FINISHED** quickly. Its submission `126bbba4-c5cc-44cc-9547-0ffd27b93ba4` reached **FINISHED**,
> track **`internal`**, no error — the first `eas-build-status.yml` check (run `32252879757`, ~10 min
> after dispatch) still showed it `IN_PROGRESS`; the second (run `32253473281`, ~17 min after
> dispatch) confirmed `FINISHED`. Total dispatch-to-terminal ≈ 18 minutes.
>
> **The `runtime=?` gap first recorded 2026-08-16 is still open** — this run's Recap again rendered
> `runtime=?` for every listed build. Still out of scope for a ship-and-track request.
>
> **What this run does NOT establish** — unchanged from every entry since 2026-08-12: still the
> **internal** track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design;
> §8 step 2 (closed test, its mandatory ~14-day clock, production access) remains untouched and
> nothing here started that clock; a FINISHED submission does not prove the binary *runs* — the real
> exit test remains the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human. And
> newly: the 21-minute GCP `waiting` pause was never conclusively diagnosed as timer-vs-approval —
> if it recurs and does NOT clear on its own within a similar window, that is the signal a required
> reviewer really was added to the `production` environment and needs a human's attention, not
> another wait.

> **Status (2026-08-19, later — v0.42.1 shipped to the internal track; second mobile dispatch of the
> day, on top of the same-day v0.42.0 entry above.)** A Claude session was asked to "deploy to EAS
> build and push a google play version, tell me the updated version number after, all PRs committed
> and GCP updated, track to the end."
>
> **① Open PRs: none.** `list_pull_requests` returned empty — everything was merged to `main` already.
> **② GCP/API: current and healthy.** `release.yml` had already run green on every commit up to the
> tip, including `main`@`866455b` itself (run `32261720314`, success 14:03:19 UTC). Independently
> verified through the LB rather than inferred from the tick: `GET
> https://lyniago.lyniafinance.com/healthz` → 200 `{"status":"ok","db":true,"redis":true,"provider":"gcp"}`.
> **Admin/merchant — deliberately not dispatched**: `git diff` between the last mobile build
> (`fb094420a3`) and the new tip (`866455b`) touched only `apps/mobile/**` — no admin/merchant/shared
> change to ship, same call as every prior entry.
>
> **Why the mobile build was genuinely due.** Two real mobile PRs landed on `main` since the morning's
> v0.42.0 build (`1253099d`, at `fb094420a3`): **#829** (live deliver-to on the restaurant list, RC.list
> header parity — `home-location.ts`, `food-list.ts`, `RestaurantRow.tsx`) and **#830** (keep the suburb
> through a location pick, tighter area matching), plus release-please's `#831` bumping `main` to
> **0.42.1**. 11 files under `apps/mobile` changed — a real UI/logic delta, not a version-string bump.
>
> **Ownership guards ran rather than were assumed**, per `CLAUDE.md`: `ListAgents` clear, no in-flight
> `mobile-release.yml` run (last was run #29, completed 2026-08-19 12:18:33 UTC), CI green on the
> dispatched commit (`main`@`866455b`, run `32261720218`), and `pnpm install --frozen-lockfile` clean
> on pnpm 10.33.0 with `pnpm-lock.yaml`/`apps/mobile/eas.json` unmoved afterward.
>
> Dispatched `mobile-release.yml` run #30 (`32271247407`) explicitly with **`profile: preview`,
> `submit: true`** — never the bare/default dispatch, per the standing warning above and the
> 2026-08-16 incident. Ref `main`@`866455b7da699c0e472e099d94b6fcc66f6ef5c7` (app version **0.42.1**).
> The dispatcher job succeeded in 62 s (15:38:17 → 15:39:19 UTC), which under `--no-wait` proves only
> that the build was queued.
>
> EAS build `6dc910c2-1e22-46ea-b5e1-dbfb6567d08c` (profile `preview`, created 15:39:12 UTC) reached
> **FINISHED**. Its submission `2419e096-6b28-4773-885c-b22ddabcfe2e` reached **FINISHED**, track
> **`internal`**, no error — confirmed via `eas-build-status.yml` run #36 (`32302804548`). Exact
> versionCode not captured — `eas-build-status.yml`'s recap doesn't query that field, same known gap
> as every entry since 2026-08-17.
>
> **The `runtime=?` gap first recorded 2026-08-16 is still open.** This run's Recap again rendered
> `runtime=?` for every listed build. Still out of scope for a ship-and-track request.
>
> **What this run does NOT establish** — unchanged from every entry since 2026-08-12: still the
> **internal** track only; `play.google.com/store/apps/details?id=zw.co.lynia` still 404s by design;
> §8 step 2 (closed test, its mandatory ~14-day clock, production access) remains untouched and
> nothing here started that clock; a FINISHED submission does not prove the binary *runs* — the real
> exit test remains the device smoke in `docs/QA-DEVICE-CHECKLIST.md`, on a handset, by a human.

> **2026-08-20 — internal-track build #31: the New Architecture and the Didit native SDK, together,
> on their first build. Both halves FINISHED.**
>
> What shipped: `main`@`a80e1456` — PR **#847**, the Route A KYC swap. Riders no longer leave LyniaGo
> to verify: `WebBrowser.openAuthSessionAsync` is gone from both launch sites and Didit's native SDK
> draws capture and liveness over the app. Riding with it: `newArchEnabled: true` (#835), which had
> **never been built before this run**.
>
> **This build carried a risk the plan had explicitly wanted sequenced away.** Phase 2 of
> `docs/plans/2026-08-20-kyc-in-app-plan.md` asked for the New Architecture to be proven on a device
> *before* a line of KYC code, so a failed migration could not strand finished KYC work. The owner
> directed the KYC code first, so the two rode the same build. **That risk did not land** — the build
> is green — but it was real when dispatched, and the plan records why it stayed survivable: the flag
> is one line in `app.config.ts` and the SDK is behind one seam (`src/kyc/verify.ts`), so either
> reverts without the other.
>
> Dispatched `mobile-release.yml` run `32422046604` explicitly with **`profile: preview`,
> `submit: true`** — never the bare/default dispatch, per the standing warning above. The default
> (`production`) would have built fine and then failed at submission on service-account permissions,
> burning one of a limited monthly allowance.
>
> EAS build `6294977b-aa53-4bbd-a4d8-a2b839646765` (profile `preview`, created 21:59:21 UTC) reached
> **FINISHED**. Its submission `f65a2b9b-924c-427e-98d2-7424649f9d36` reached **FINISHED**, track
> **`internal`**, no error — confirmed via `eas-build-status.yml` run `32424204118`, after run
> `32422210230` at 22:01 caught it mid-flight (`IN_PROGRESS` / `AWAITING_BUILD`) and was re-checked
> rather than assumed. Under `--no-wait` the green dispatcher job proves only that the build was
> queued, which is exactly why both checks happened.
>
> **Failure class: none.** First clean first-attempt build+submission pair since the lane was armed.
>
> Two known gaps unchanged: exact versionCode not captured, and `runtime=?` still rendered for every
> listed build (open since 2026-08-16). Neither is in scope for a ship-and-track request.
>
> **What this run does NOT establish.** Everything in the entry above still holds — **internal** track
> only, the store URL still 404s by design, §8 step 2 untouched. And one thing specific to this build:
> a FINISHED build proves the New Architecture and the Didit SDK **compile and link** together. It
> does not prove the SDK's camera and liveness UI actually *runs* on a handset, which is the whole
> point of Route A. That is the device smoke in `docs/QA-DEVICE-CHECKLIST.md` — on a real phone, by a
> human — and it is now the only remaining gate on this work.

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

**The mechanism (implemented).** Allowlisted **demo accounts with a fixed code**, gated on two
secrets — `DEMO_OTP_PHONE` and `DEMO_OTP_CODE` (`apps/api/src/auth/auth.service.ts`,
`apps/api/src/config/env.ts`). Properties, all covered by tests:

- **Both secrets or nothing.** Either unset → the path is entirely inert and the ordinary OTP flow is
  untouched. Boot rejects one-without-the-other, a non-6-digit code, and trivially guessable codes.
- **`DEMO_OTP_PHONE` is a comma-separated LIST**, one reserved number per demo identity, all sharing
  the single `DEMO_OTP_CODE`. This exists because a profile carries exactly **one** `role`: the same
  number cannot demo both the rider/customer app and the merchant kitchen dashboard. Without a list
  the only ways to add a kitchen demo were to repoint the secret (losing the app demo) or to convert
  a real account's role — which is **irreversible**, since `POST /riders/become` throws
  `already_rider` before it writes a role and nothing else restores one. Boot validates every entry
  and rejects duplicates: `demoPhones()` silently DROPS anything `normalizePhone` rejects, so an
  unvalidated typo would boot green and simply stop authenticating that demo account.
- **Adding a number adds no guessing budget to any other** — the fixed-code brute-force cap
  (10/hour) is keyed per phone.
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
# DEMO_OTP_PHONE is comma-separated — one reserved number per demo identity (app demo, kitchen demo).
printf '%s' '+2637XXXXXXXX,+2637YYYYYYYY' | gcloud secrets create DEMO_OTP_PHONE --data-file=- --project=lynia-500911
printf '%s' '<6 digits>'    | gcloud secrets create DEMO_OTP_CODE  --data-file=- --project=lynia-500911
# 2. Arm the deploy wiring (release.yml references the secrets only when this is true)
gh variable set DEMO_ACCOUNT_ENABLED --body true
# 3. Redeploy (next merge, or re-run Release) so the secrets are injected as env.
```

`release.yml` injects `DEMO_OTP_PHONE`/`DEMO_OTP_CODE` from Secret Manager only when
`DEMO_ACCOUNT_ENABLED=true` — the same opt-in pattern as Bird/WhatsApp/Sentry, so a missing secret
can never fail an un-armed deploy. The runtime SA needs `secretAccessor` on both secrets.

> **Adding a number later** is `gcloud secrets versions add DEMO_OTP_PHONE --data-file=-` with the
> full new list (secret versions replace, they do not append), then a redeploy. A **kitchen** demo
> additionally needs its profile upgraded once: sign in on the merchant dashboard with that number +
> the fixed code, then `POST /merchant/become {"name":"…"}` with the resulting bearer token. Do that
> on a reserved number, never on one whose role you would miss — the upgrade cannot be undone through
> any API.
>
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

1. ✅ **Internal testing track — DONE 2026-08-04.** Actions → *Mobile Release (Play)* with profile
   `preview` (`eas.json` → `submit.preview.android.track: "internal"`). Verifies the whole pipeline —
   EAS build, Play App Signing, auto-submit — with no public exposure. **Closed by build `c248fbf5`
   (v0.17.9, versionCode 2) + submission `574bf5fd` (FINISHED 09:48:01 UTC, track `internal`)** —
   see the attempt-9 status block at the top of this doc. The pipeline is repeatable: re-dispatching
   the workflow is now the normal way to ship a new internal build.
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
   ⚠️ **This lane does not work today — do not reach for it in an incident** until `REL-01` and
   `REL-02` (§8a) are closed. It has never been run: zero updates exist on the EAS project.

---

## 8a. Post-go-live gaps (found reviewing the live state, 2026-08-04)

Going live surfaced three things that the pre-launch docs assumed were fine. None of them blocks the
internal track; all three block the *next* steps.

| # | Gap | Consequence | Tracked as |
|---|---|---|---|
| 1 | ~~**A version bump rotates the OTA runtime version.**~~ **FIXED 2026-08-04** — `apps/mobile/fingerprint.config.js` now sets `sourceSkips: ["ExpoConfigVersions"]`, so the version fields no longer feed the hash. Both 0.17.9 and 0.17.10 hash to `5b175b9b…`; a native change (`targetSdkVersion` 35 → 34) still moves it, so the anti-brick property is intact. | ⚠️ **The live vc-2 binary is not rescued** — its runtimeVersion `6c72c486…` was stamped at build time. The fix applies from the **next store build** onward; re-baseline before the closed test starts, while the install base is still internal testers. | `REL-01` |
| 2 | **`mobile-ota.yml` defaults to a branch that does not exist.** Its `branch` input defaults to `production`; the EAS project has exactly one channel and one branch, both named `preview`, and the live binary was built on the `preview` channel. | A default OTA dispatch publishes to a branch no channel maps to — again reaching nobody, silently. | `REL-02` |
| 3 | **The live build has no crash reporting.** Wiring is now complete in-repo (2026-08-05): project `lyniago/lynia-mobile`, R8 mapping + native symbol upload enabled, `SENTRY_DISABLE_AUTO_UPLOAD` removed, DSN threaded through the OTA and QA-APK lanes, and a release build that refuses to start without it. **Remaining: the founder's EAS variables + a new build.** | Crashes on the internal track are invisible *until a new binary ships* — telemetry cannot reach an already-installed APK. The closed test (step 2) would still run blind on the current build, and step 3 explicitly requires Sentry live. **This directly cost us on gap 4** — that build failed with zero telemetry and had to be diagnosed from a photograph. | LR20 / §7.2 |
| 4 | **The shipped build does not start at all.** The first real-device install (v0.17.12, internal track, 2026-08-04) showed the launcher icon on white and stayed there — no crash, no error screen, nothing in logcat. Bounded-gate + resource-shrinking defect; full mechanism in `docs/KNOWN_BUGS.md` → `MOB-BOOT-01`. | **The internal track is blocked** — testers cannot open the app, so the §8 step-2 14-day closed-test clock cannot start. | `MOB-BOOT-01` |

**Gap 4 is fixed in code but needs a new build to reach anyone.** It is a native config change, so
the `fingerprint` runtimeVersion shifts and OTA cannot rescue the live vc-2 binary (the same
constraint as `REL-01`). Cut the store build described below — it now carries *three* reasons to
exist: the boot fix, the OTA re-baseline, and, if Sentry is provisioned first, the crash telemetry
that would have made gap 4 a five-minute diagnosis. **Verify on that build that the app starts
*and* renders Inter rather than the system font** — the second half confirms the root cause, not
just the mitigation.

**Both `REL-01` and `REL-02` are now fixed** — `REL-01` by skipping the version fields out of the
fingerprint (`apps/mobile/fingerprint.config.js`), `REL-02` by a preflight in `mobile-ota.yml` that
resolves the target channel and compares the computed runtime version against finished builds on it,
aborting instead of publishing to nobody.

**The OTA lane is still not usable yet, for one remaining reason:** the live binary was built before
the fingerprint fix, so its runtimeVersion (`6c72c486…`) belongs to the old scheme and no update
published now can match it. **Cut one more store build** — that binary's runtimeVersion will be
stable across future version bumps, and OTA becomes real from then on. Do it before the closed test
starts: re-baselining costs one build now and a great deal more once testers are opted in and the
14-day clock is running. Until that build ships, step 4 above remains fenced off and every fix
travels through the store lane.

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
