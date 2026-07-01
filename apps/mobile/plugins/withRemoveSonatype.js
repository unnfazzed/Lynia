const { withProjectBuildGradle } = require("@expo/config-plugins");

/**
 * Remove the decommissioned `oss.sonatype.org` snapshots repo from the Android build.
 *
 * React Native's Gradle plugin (`DependencyUtils.configureRepositories`) programmatically adds
 * `https://oss.sonatype.org/content/repositories/snapshots/` to every project's repositories — and
 * it adds it *before* mavenCentral. Sonatype's legacy OSSRH host is sunset and returns 504, so Gradle
 * queries it first, times out, and fatally aborts resolution for artifacts that actually live on
 * Maven Central (Fresco, the Kotlin compiler classpath, the image cropper). There is no `maven {}`
 * block on disk to edit (it's added at configuration time, inside the app project's afterEvaluate),
 * so we append a `projectsEvaluated` hook to the root build.gradle. `projectsEvaluated` runs *after*
 * every project's afterEvaluate — i.e. after RN has added the repo — so the removal is reliable
 * (a plain afterEvaluate hook races the RN plugin and would be a no-op).
 */
const SNIPPET = `

// --- withRemoveSonatype: strip sunset oss.sonatype.org snapshots repo (RN adds it before Central; it 504s) ---
gradle.projectsEvaluated { g ->
    g.rootProject.allprojects { p ->
        def removed = p.repositories.removeAll { repo ->
            (repo instanceof org.gradle.api.artifacts.repositories.MavenArtifactRepository) &&
                repo.url != null && repo.url.toString().contains('oss.sonatype.org')
        }
        if (removed) { p.logger.lifecycle('[withRemoveSonatype] removed oss.sonatype.org repo from ' + p.path) }
    }
}
// --- end withRemoveSonatype ---
`;

module.exports = function withRemoveSonatype(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    if (!cfg.modResults.contents.includes("withRemoveSonatype")) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
