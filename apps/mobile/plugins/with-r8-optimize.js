// Expo config plugin: let R8 optimize the release build, not only shrink and obfuscate it.
//
// WHY — the SDK 54 template's app/build.gradle reads
//   proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
// and AGP's proguard-android.txt carries `-dontoptimize`. So enableMinifyInReleaseBuilds (expo-build-
// properties, app.config.ts) gives tree-shaking and obfuscation, but R8 skips every optimization pass:
// no inlining, no class merging, no constant/dead-branch folding. Play Console's Android vitals flagged
// release 47 (0.52.0) with "Optimization isn't enabled". proguard-android-optimize.txt is the same AGP
// default file without `-dontoptimize`. expo-build-properties@1.0.10 has no option for it.
//
// CNG regenerates android/ on every build, so the swap has to happen here rather than by hand.
// The swap only matters with minifyEnabled (release); debug and dev-client builds are untouched.
//
// RISK — optimization can remove or merge code that is reached only by reflection. Every library this
// app ships either has consumer keep rules or a keep in extraProguardRules (react-native-maps), and
// those rules hold under optimization too. Still: a sideloaded android-test-apk.yml cold start on a
// real handset before any EAS/Play dispatch, same gate as every other native change (docs/APP-SIZE.md).
//
// A native build setting: it moves the expo-updates fingerprint and ships only in a store build.

const UNOPTIMIZED = 'getDefaultProguardFile("proguard-android.txt")';
const OPTIMIZED = 'getDefaultProguardFile("proguard-android-optimize.txt")';

/**
 * Pure transform over app/build.gradle, split out so it can be unit tested without running prebuild
 * (same seam as with-gradle-memory.js). Throws when the template line is missing, so a template change
 * fails the build loudly instead of silently shipping an unoptimized one again.
 *
 * @param {string} contents
 */
function useOptimizedProguardFile(contents) {
  if (contents.includes(OPTIMIZED)) return contents;
  if (!contents.includes(UNOPTIMIZED)) {
    throw new Error(
      `with-r8-optimize: app/build.gradle no longer contains ${UNOPTIMIZED}. ` +
        "The Expo template changed — check how it now picks the default ProGuard file and update this plugin.",
    );
  }
  return contents.split(UNOPTIMIZED).join(OPTIMIZED);
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withR8Optimize(config) {
  // Required here rather than at the top: jest-expo's environment can't load @expo/config-plugins (a
  // Node-only package), and __tests__/r8-optimize-plugin.test.ts only needs the transform above.
  const { withAppBuildGradle } = require("@expo/config-plugins");
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error("with-r8-optimize: expected a Groovy app/build.gradle");
    }
    cfg.modResults.contents = useOptimizedProguardFile(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withR8Optimize;
module.exports.useOptimizedProguardFile = useOptimizedProguardFile;
module.exports.OPTIMIZED = OPTIMIZED;
module.exports.UNOPTIMIZED = UNOPTIMIZED;
