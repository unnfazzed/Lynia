/**
 * Resolve the Maps key that EAS actually BUILDS WITH — in memory, for the doctor to probe.
 *
 * WHY: `maps-key-doctor.yml` first shipped reading `secrets.GOOGLE_MAPS_API_KEY`, the GitHub secret.
 * That is the wrong key for MOB-MAP-02. The GitHub secret feeds only `android-test-apk.yml` (sideloaded
 * QA APKs); the Play build is produced by EAS, which reads the EAS *environment variable* of the same
 * name. They are two independent stores that can hold different values — and they demonstrably do: the
 * GitHub one probes INVALID_KEY while the EAS one is well-formed and valid.
 *
 * WHY THIS IS A MODULE AND NOT A STEP THAT EXPORTS TO `$GITHUB_ENV`.
 * The first version wrote the resolved key to `$GITHUB_ENV` for a later step to pick up. CodeQL flagged
 * it (js/http-to-file-access, "network data written to file") and was right to: `$GITHUB_ENV` is parsed
 * as `KEY=VALUE` lines, so a value containing a newline injects arbitrary environment variables into
 * every subsequent step of the job — a known Actions injection class. Validating the value would have
 * silenced the alert, but the better answer is that the secret never needs to touch the disk at all.
 * The doctor now imports this function and holds the key in memory for the length of one fetch.
 *
 * Reading it back is possible only because the variable is SENSITIVE rather than SECRET in the EAS
 * environment — which is required anyway for a config-consumed variable, since the CLI must be able to
 * see it (docs/PLAY-STORE-SUBMISSION.md, 2026-08-04). The SECRET case is reported explicitly.
 */

const QUERY = `
  query ($appId: String!, $environment: EnvironmentVariableEnvironment!) {
    app {
      byId(appId: $appId) {
        environmentVariablesIncludingSensitive(environment: $environment) {
          name
          value
          visibility
        }
      }
    }
  }
`;

/** Thrown with an operator-readable reason; the caller prints it and exits. Never carries the value. */
export class EasKeyError extends Error {}

/**
 * @returns {Promise<string>} the raw key value, for immediate use. Never logged, never persisted.
 */
export async function readMapsKeyFromEas({ appId, environment = "preview", token } = {}) {
  if (!token) {
    throw new EasKeyError("EXPO_TOKEN is not set — cannot read the EAS environment. Re-run with key_source: github.");
  }
  if (!appId) {
    throw new EasKeyError("EAS_APP_ID is not set. It is the EAS project id (repository variable EAS_PROJECT_ID).");
  }

  const env = String(environment).trim().toUpperCase();
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { appId, environment: env } }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    throw new EasKeyError(`EAS API error: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const vars = json?.data?.app?.byId?.environmentVariablesIncludingSensitive ?? [];
  const found = vars.find((v) => v.name === "GOOGLE_MAPS_API_KEY");

  if (!found) {
    throw new EasKeyError(
      `GOOGLE_MAPS_API_KEY is not defined in the EAS "${env}" environment. That alone would block a ` +
        "release build: app.config.ts throws rather than ship a mapless binary.",
    );
  }
  if (!found.value) {
    throw new EasKeyError(
      `GOOGLE_MAPS_API_KEY exists in "${env}" but its value is not readable (visibility: ` +
        `${found.visibility}). Only SENSITIVE and PUBLIC values can be read back; a SECRET cannot — ` +
        "which is itself a problem for a config-consumed variable (docs/PLAY-STORE-SUBMISSION.md, " +
        "2026-08-04: a Secret desynchronises the fingerprint because the CLI cannot see it).",
    );
  }

  return { value: found.value, visibility: found.visibility, environment: env };
}
