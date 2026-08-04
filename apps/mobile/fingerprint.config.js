/**
 * @expo/fingerprint config — read by BOTH `eas update` (computing which binaries an OTA bundle may
 * land on) and `eas build` (stamping the binary's `runtimeVersion`). Both sides must load the same
 * file, which is why it is committed rather than injected.
 *
 * WHY THIS EXISTS (REL-01, docs/KNOWN_BUGS.md). `app.config.ts` sets
 * `runtimeVersion: { policy: "fingerprint" }`. The intent of that policy is "an OTA bundle can only
 * land on a binary whose NATIVE layer it was actually built against". The implementation hashes the
 * whole resolved `expoConfig`, and `version` is one of the hashed keys — so release-please bumping
 * `version` on essentially every merge to `main` rotated the runtimeVersion on changes that were not
 * native at all. Measured before this file existed, every other input held constant:
 *
 *   version 0.17.9  -> c56c13bbbfdf36abb730de66748a31fb1270e983
 *   version 0.17.10 -> 1bd7d519a42235952ee534310efaa22ea434c5c6
 *
 * An OTA published from `main` therefore computed a runtimeVersion no shipped binary had, and
 * expo-updates ignores a non-matching update SILENTLY — the CLI exits 0, the Expo console shows a
 * published update, and zero devices ever download it. That made Channel A
 * (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1a) non-functional in the normal case.
 *
 * `ExpoConfigVersions` skips exactly the version fields — app version, Android `versionCode`, iOS
 * `buildNumber` — and nothing else. Every native input (autolinked modules, native dirs, config
 * plugins, `expo-build-properties`, patches, the Maps/Firebase config blocks) is still hashed, so
 * the safety property the policy exists for is untouched: a JS bundle still cannot land on an
 * incompatible native layer. With this file, both versions above hash to the same value —
 * `5b175b9bee0740dc6297339c9e6ba2507d8f1caf` — and so does 0.17.12, i.e. the hash held across two
 * further release-please bumps that landed on `main` while this was being written, with no other
 * fingerprint input moving. Negative control: flipping `targetSdkVersion` 35 → 34 still moves it to
 * `de24d3a561cd9b5b74b0b4da9133c5d8eef88ade`, confirming native inputs are still hashed.
 *
 * NOTE ON THE FORM BELOW: `sourceSkips` is written as a STRING ARRAY on purpose. The documented
 * alternative is `require('@expo/fingerprint').SourceSkips.ExpoConfigVersions`, but that package is
 * a transitive dep of `expo-updates` and is NOT resolvable from `apps/mobile` under pnpm's strict
 * layout — the same class of failure that broke EAS builds 5, 6 and 7 (expo-asset, @sentry/cli,
 * expo-modules-autolinking). The string form needs no resolution at all.
 *
 * CAVEAT WHEN CHANGING THIS FILE: a binary's runtimeVersion is stamped at BUILD time. Editing this
 * file does not change any already-installed app — it changes what the NEXT store build computes.
 * Binaries built before a change here can never receive updates published after it, and vice versa.
 * Re-baselining therefore costs one store build; do it while the install base is small.
 */
module.exports = {
  sourceSkips: ["ExpoConfigVersions"],
};
