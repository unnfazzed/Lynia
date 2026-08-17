#!/usr/bin/env node
/**
 * Resolve the Maps key that EAS actually BUILDS WITH, and hand it to the doctor — masked.
 *
 * WHY: `maps-key-doctor.yml` first shipped reading `secrets.GOOGLE_MAPS_API_KEY`, the GitHub secret.
 * That is the wrong key for MOB-MAP-02. The GitHub secret feeds only `android-test-apk.yml` (sideloaded
 * QA APKs); the Play build is produced by EAS, which reads the EAS *environment variable* of the same
 * name. They are two independent stores that can hold different values — and on the first run of the
 * doctor they demonstrably did, because the GitHub one came back INVALID_KEY while the Play-installed
 * app had been rendering tiles as recently as 2026-08-05. Probing the GitHub secret answers a real
 * question (is the QA lane armed?) but not the one MOB-MAP-02 asks.
 *
 * The key is SENSITIVE, not SECRET, in the EAS environment (`eas env:list`), which is exactly what makes
 * this possible: Expo's rule is that config-consumed variables must be Sensitive so the CLI can read
 * them back (docs/PLAY-STORE-SUBMISSION.md, 2026-08-04). Secret-visibility variables are unreadable and
 * this script says so rather than failing obscurely.
 *
 * The value is masked with `::add-mask::` BEFORE it is written anywhere, so it is redacted in the job
 * log even if a later step echoes it, and it is passed on through `$GITHUB_ENV` rather than stdout.
 */
import { appendFileSync } from "node:fs";

const APP_ID = process.env.EAS_APP_ID?.trim();
const ENVIRONMENT = (process.env.EAS_ENVIRONMENT || "preview").trim().toUpperCase();
const TOKEN = process.env.EXPO_TOKEN?.trim();

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

async function main() {
  if (!TOKEN) {
    console.error("EXPO_TOKEN is not set — cannot read the EAS environment. Re-run with key_source: github.");
    process.exit(2);
  }
  if (!APP_ID) {
    console.error("EAS_APP_ID is not set. It is the EAS project id (repository variable EAS_PROJECT_ID).");
    process.exit(2);
  }

  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { appId: APP_ID, environment: ENVIRONMENT } }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    console.error(`EAS API error: ${json.errors.map((e) => e.message).join("; ")}`);
    process.exit(1);
  }

  const vars = json?.data?.app?.byId?.environmentVariablesIncludingSensitive ?? [];
  const found = vars.find((v) => v.name === "GOOGLE_MAPS_API_KEY");

  if (!found) {
    console.error(
      `GOOGLE_MAPS_API_KEY is not defined in the EAS "${ENVIRONMENT}" environment. That alone would ` +
        "block a release build: app.config.ts throws rather than ship a mapless binary.",
    );
    process.exit(1);
  }
  if (!found.value) {
    console.error(
      `GOOGLE_MAPS_API_KEY exists in "${ENVIRONMENT}" but its value is not readable (visibility: ` +
        `${found.visibility}). Only SENSITIVE and PUBLIC values can be read back; a SECRET cannot — ` +
        "which is itself a problem for a config-consumed variable (see docs/PLAY-STORE-SUBMISSION.md, " +
        "2026-08-04: a Secret desynchronises the fingerprint because the CLI cannot see it).",
    );
    process.exit(1);
  }

  // Mask BEFORE the value can reach any log line, including this script's own diagnostics.
  console.log(`::add-mask::${found.value}`);
  console.log(`Resolved GOOGLE_MAPS_API_KEY from the EAS "${ENVIRONMENT}" environment (visibility: ${found.visibility}).`);

  if (!process.env.GITHUB_ENV) {
    console.error("GITHUB_ENV is unset — this script is meant to run inside GitHub Actions.");
    process.exit(2);
  }
  appendFileSync(process.env.GITHUB_ENV, `GOOGLE_MAPS_API_KEY=${found.value}\n`);
}

main().catch((err) => {
  console.error(`Failed to read the EAS environment: ${err?.message ?? err}`);
  process.exit(1);
});
