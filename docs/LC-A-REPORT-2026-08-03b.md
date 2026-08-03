# LC-A report — 2026-08-03b (size & data diet)

Audit territory `A-T5` (native binary levers inventory — ABI/AAB delivery config, resource
shrinking, per-device download measurement path; explicitly **report-only while EAS is dormant**
per `docs/plans/2026-08-01-low-connectivity-program.md` §5) swept this run. **Zero defects, zero
new optimization items** — every lever this territory was scoped to inventory is already applied
or is blocked on founder-gated EAS/Play access that this environment doesn't have. This closes out
Lane A's Audit-territory phase (`A-T1`…`A-T5` all now checked); Lane A moves permanently into
OPTIMIZE MODE for future firings. No code changed in this PR; docs only.

## Method

A static config/workflow read (this environment has no EAS token / Play Console access, so a live
build+measure pass isn't possible — matching why the program doc scoped this territory
report-only). Read: `apps/mobile/app.config.ts` (plugins block, `expo-build-properties` config),
`apps/mobile/eas.json` (build profiles), `.github/workflows/mobile-release.yml` (the AAB
measurement step), `.github/workflows/android-test-apk.yml` (the QA-APK size-report step),
`docs/APP-SIZE.md` (the existing levers-applied + guardrails record). `apps/mobile/android/` is
not committed (Expo CNG/prebuild owns it — confirmed absent), so there is no hand-editable
`build.gradle` outside the `expo-build-properties`/config-plugin surface to inventory separately.

## Findings, by inventory line item

**ABI / AAB delivery config — already optimal, no lever to pull.** `eas.json`'s `production`
profile builds `android.buildType: "app-bundle"` (an `.aab`, not a universal APK). Play splits an
App Bundle **per device** at install time along all three axes that matter here — ABI, screen
density, *and* language — so the per-device download already excludes the other ABIs' native
`.so` files and other locales' resource strings without any manual `splits`/`resConfigs`
Gradle config. The QA sideload APK (`android-test-apk.yml`) is deliberately built as a **universal**
APK containing all ABIs — correct and already documented in `docs/APP-SIZE.md` as an intentional
upper-bound artifact for sideloading, not a real per-user delivery shape. No manual ABI-split
config is needed or would improve on what AAB delivery already does; a locale-restricting
`resConfigs` Gradle lever (the pre-App-Bundle-era technique) would be redundant with AAB's
automatic per-device language split.

**Resource shrinking — already enabled, confirmed effective.** `app.config.ts`'s
`expo-build-properties` plugin block sets both `enableProguardInReleaseBuilds` (R8 code shrink +
obfuscation) and `enableShrinkResourcesInReleaseBuilds` (strip unused drawables/strings/layouts),
paired as required (`shrinkResources` only takes effect with R8 on). `docs/APP-SIZE.md`'s
2026-07-20 measurement already shows this landing: `classes*.dex` −75% (34.6→8.6 MiB) with a
measured before/after run. No further shrink-config knob was found unapplied — `extraProguardRules`
is deliberately minimal (only the one library, `react-native-maps`, that ships no consumer
ProGuard rules of its own; everything else already ships its own).

**Per-device download measurement path — exists, but numerically blocked on EAS being armed
(founder-gated, not actionable from this environment).** `mobile-release.yml`'s "Measure AAB size"
step already reports the raw `.aab` byte size on every armed release and explicitly notes (in its
own `GITHUB_STEP_SUMMARY` text) that Play's real per-device download is smaller and lives in the
Play Console's "App bundle explorer." The workflow **deliberately does not vendor `bundletool`** to
compute the exact per-device split itself — the existing code comment states the rationale plainly:
pulling an unpinned third-party jar into a release job is a supply-chain risk not worth taking for
a number Play Console already reports authoritatively. That tradeoff is sound and needed no change.
The measurement path is therefore complete as designed; it simply has nothing to measure yet
because `EAS_RELEASE_ENABLED` is unset (`mobile-release.yml:47`) and no release has ever run. This
is the one line item in this territory that is genuinely "unmeasured," and it stays that way until
a founder arms EAS per the workflow's own header comment — no JS/config-only action closes it.

**Native launcher assets — checked, immaterial.** `apps/mobile/assets/{icon,adaptive-icon,splash-
icon}.png` (confirmed native-build-only by `A-T3`, zero OTA/export cost) total ~105 KB on disk
(12–46 KB each, already reasonably compressed PNGs for 512–1024px RGBA sources). Native-binary
cost is real but three orders of magnitude below the ~7 MiB app total; not worth a dedicated
optimization line.

## Why this closes the territory rather than seeding new checklist items

Every lever this territory's scope names (ABI/AAB delivery, resource shrinking, the measurement
path) is either already correctly configured (confirmed against the actual `app.config.ts`/
`eas.json`/workflow source, not assumed) or requires founder-side EAS provisioning this environment
cannot perform — which is exactly the "report-only while EAS dormant" framing the program doc
already anticipated for this item, not a gap this firing left behind. `A-T5`'s existing checklist
neighbor `A-O8` (`expo-image` migration, "needs native build train") already covers the one lever
in this program that genuinely needs a native build to land; nothing new of that shape surfaced
here.

## Verification

Docs-only change (this report + the program-doc checkbox); `pnpm typecheck && pnpm lint && pnpm
test` run to confirm the docs-only diff didn't regress anything.
