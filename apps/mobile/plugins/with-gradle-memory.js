// Expo config plugin: give the Android Gradle daemon enough memory for an Expo SDK 54 release build.
//
// WHY — the template's `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m` runs out of Metaspace
// on this app's first SDK 54 release build: `:expo-updates:kspReleaseKotlin` failed with
// `java.lang.OutOfMemoryError: Metaspace` (KSP, lint, Kotlin 2.1 and AGP all load their classes into
// the same daemon). The failed daemon did not exit. The `Android Test APK` job (run 36414633349) sat
// silent for 58 minutes until it was cancelled, and an EAS build would burn quota on the same hang,
// because EAS runs the same prebuild and reads the same gradle.properties (docs/KNOWN_BUGS.md SDK54-07).
//
// CNG regenerates android/ on every build, so the value has to be set here rather than by hand.
// The Kotlin daemon inherits these arguments unless `kotlin.daemon.jvmargs` is set, which it isn't.
// Both build machines have 16 GB of RAM (GitHub's ubuntu-latest, EAS's default Android worker),
// which fits a 4 GB daemon heap plus the Kotlin daemon and Metro.
//
// A native build setting: it moves the expo-updates fingerprint and ships only in a store build.

const JVM_ARGS_KEY = "org.gradle.jvmargs";
const JVM_ARGS = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";

/**
 * Pure transform over the parsed gradle.properties items, split out so it can be unit tested without
 * running prebuild (same seam as metro-shims/*-redirect.js). Replaces the template's value in place,
 * so the line keeps its position under the template's comment, or appends it if the key is absent.
 *
 * @param {import('@expo/config-plugins').AndroidConfig.Properties.PropertiesItem[]} properties
 */
function setGradleJvmArgs(properties) {
  const existing = properties.find((item) => item.type === "property" && item.key === JVM_ARGS_KEY);
  if (existing) {
    existing.value = JVM_ARGS;
  } else {
    properties.push({ type: "property", key: JVM_ARGS_KEY, value: JVM_ARGS });
  }
  return properties;
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
function withGradleMemory(config) {
  // Required here rather than at the top: jest-expo's environment can't load @expo/config-plugins (a
  // Node-only package), and __tests__/gradle-memory-plugin.test.ts only needs the transform above.
  const { withGradleProperties } = require("@expo/config-plugins");
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = setGradleJvmArgs(cfg.modResults);
    return cfg;
  });
}

module.exports = withGradleMemory;
module.exports.setGradleJvmArgs = setGradleJvmArgs;
module.exports.JVM_ARGS = JVM_ARGS;
