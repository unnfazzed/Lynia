const { withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Strip the legacy `oss.sonatype.org` snapshots Maven repo from the Android root build.gradle.
 *
 * Sonatype's OSSRH host (oss.sonatype.org) is being sunset and intermittently returns
 * `504 Gateway Time-out`. Because Gradle treats a 5xx from any configured repo as a fatal error
 * (not a "try the next repo"), a single sonatype timeout breaks dependency resolution for whatever
 * it happens to query there — e.g. the Kotlin compiler classpath (`kotlin-script-runtime`). Those
 * artifacts all live on Maven Central, so removing the broken repo lets resolution succeed.
 */
module.exports = function withRemoveSonatype(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /maven\s*\{[^{}]*oss\.sonatype\.org[^{}]*\}/g,
      "// oss.sonatype.org snapshots removed (OSSRH sunset — returns 504, breaks resolution)",
    );
    return cfg;
  });
};
