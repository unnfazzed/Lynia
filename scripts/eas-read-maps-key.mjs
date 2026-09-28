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

/** What a missing variable costs, per key — the reader's error names it so the log is actionable. */
const MISSING_IMPACT = {
  GOOGLE_MAPS_API_KEY:
    "That alone would block a release build: app.config.ts throws rather than ship a mapless binary.",
  EXPO_PUBLIC_GOOGLE_PLACES_KEY:
    "Builds still succeed without it (app.config.ts only warns), but address search then runs on the " +
    "phone's own geocoder: one point per search, no suggestions.",
};

/** Why an unreadable (SECRET) value is a problem beyond this reader, per key. */
const UNREADABLE_IMPACT = {
  GOOGLE_MAPS_API_KEY:
    "which is itself a problem for a config-consumed variable (docs/PLAY-STORE-SUBMISSION.md, " +
    "2026-08-04: a Secret desynchronises the fingerprint because the CLI cannot see it).",
  EXPO_PUBLIC_GOOGLE_PLACES_KEY:
    "and the Places key is meant to be Sensitive (docs/plans/2026-09-24-gcp-to-azure-migration.md §7, " +
    "M2 step 3). Re-create it with --visibility sensitive.",
};

/**
 * Read one key variable from an EAS environment. `name` defaults to the Maps key, which is what this
 * module was written for; the doctor also reads `EXPO_PUBLIC_GOOGLE_PLACES_KEY` through it.
 *
 * @returns {Promise<{ value: string, visibility: string, environment: string }>} the raw key value, for
 *   immediate use. Never logged, never persisted.
 */
export async function readKeyFromEas({ appId, environment = "preview", token, name = "GOOGLE_MAPS_API_KEY" } = {}) {
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
  const found = vars.find((v) => v.name === name);

  if (!found) {
    throw new EasKeyError(`${name} is not defined in the EAS "${env}" environment. ${MISSING_IMPACT[name] ?? ""}`.trim());
  }
  if (!found.value) {
    throw new EasKeyError(
      `${name} exists in "${env}" but its value is not readable (visibility: ` +
        `${found.visibility}). Only SENSITIVE and PUBLIC values can be read back; a SECRET cannot — ` +
        (UNREADABLE_IMPACT[name] ?? "so this reader cannot check it."),
    );
  }

  return { value: found.value, visibility: found.visibility, environment: env };
}

/** The Maps key — the original, and still the default, use of this module. */
export function readMapsKeyFromEas(options = {}) {
  return readKeyFromEas({ ...options, name: "GOOGLE_MAPS_API_KEY" });
}
