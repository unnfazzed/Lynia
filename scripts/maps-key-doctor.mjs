#!/usr/bin/env node
/**
 * Maps key doctor — answers "why is the Android map blank?" without a laptop and without `adb`.
 *
 * WHY THIS EXISTS
 * `MOB-MAP-02` (docs/KNOWN_BUGS.md) is the Android Maps key being refused by the installed build. Every
 * verification step written for it so far ends in `adb logcat | grep "Google Maps Android API"`, which
 * needs a USB cable and a terminal. The owner of this repo codes from a phone, so that instruction has
 * never once been executable by the person who has the broken handset in their hand — which is why the
 * cause has stayed "candidates, in likelihood order" since 2026-08-16 instead of being a known fact.
 *
 * This runs in CI (`.github/workflows/maps-key-doctor.yml`, workflow_dispatch — triggerable from the
 * GitHub mobile app) and reads the answer out of Google's own error text.
 *
 * WHAT IT CAN AND CANNOT PROVE — read this before trusting a verdict.
 * The Maps **SDK for Android** authenticates over a proprietary channel that cannot be reached with
 * curl. What CAN be reached is the Maps **web service**, which enforces the SAME key object: the same
 * application restriction (the Android package + certificate allowlist) and the same
 * enabled/billing/API-restriction state. So this probe answers, precisely:
 *
 *   ✅ Is the key alive at all, or invalid/deleted?
 *   ✅ Is billing enabled on the project?
 *   ✅ Is THIS package + SHA-1 pair on the key's Android allowlist?   <- the MOB-MAP-02 question
 *   ❌ Whether the Maps SDK for Android service itself is enabled — an API restriction that excludes
 *      the *static maps* service is reported as such and is NOT evidence about the Android SDK.
 *
 * A key restricted (correctly, per docs/SECURITY-OPS.md §B) to `maps-android-backend.googleapis.com`
 * only will refuse the static-maps probe on API grounds. That is an EXPECTED, healthy answer, and this
 * script says so rather than reporting a false alarm — the application-restriction check still runs,
 * because Google evaluates the Android package/cert allowlist for web-service calls too.
 *
 * The key is read from the environment and never printed, logged, or included in any output.
 */

const PROBE_URL = "https://maps.googleapis.com/maps/api/staticmap";
// Harare — the app's own initial region (apps/mobile/src/ui/ComposeMap.tsx HARARE).
const PROBE_QUERY = "center=-17.8292,31.0522&zoom=13&size=100x100";

/** `X-Android-Cert` wants bare uppercase hex; a pasted fingerprint is colon-separated. */
export function normalizeSha1(raw) {
  return String(raw ?? "").replace(/[:\s]/g, "").toUpperCase();
}

export function isWellFormedSha1(raw) {
  return /^[0-9A-F]{40}$/.test(normalizeSha1(raw));
}

/**
 * Map Google's response onto a cause. The bodies are prose, not codes, so this matches on the phrases
 * Google actually returns and — deliberately — falls through to UNKNOWN with the raw body rather than
 * guessing. A wrong confident verdict here costs another day of chasing the wrong cause.
 */
export function classify({ status, body }) {
  const b = String(body ?? "");
  const has = (s) => b.toLowerCase().includes(s.toLowerCase());

  if (status === 200) {
    return {
      code: "OK",
      verdict: "The key accepted this package + SHA-1 pair.",
      meaning:
        "The application restriction is NOT the cause: this certificate is on the allowlist, the key is " +
        "alive and billing is active. If the map is still blank on a build signed with THIS certificate, " +
        "the remaining cause is the Maps SDK for Android service being disabled on the project — check " +
        "APIs & Services -> Enabled APIs for 'Maps SDK for Android'.",
    };
  }
  if (has("blocked") && (has("android") || has("client application"))) {
    return {
      code: "ANDROID_RESTRICTION_REJECTED",
      verdict: "This package + SHA-1 pair is NOT on the key's Android allowlist.",
      meaning:
        "This is MOB-MAP-02, confirmed. Add this exact fingerprint against the package in GCP -> APIs & " +
        "Services -> Credentials -> the Maps key -> Application restrictions -> Android apps. If the " +
        "fingerprint you passed is the Play *app signing* certificate, this is the documented " +
        "re-signing trap in docs/SECURITY-OPS.md §B: Play re-signs the AAB, so the upload keystore's " +
        "SHA-1 is not what installed builds run under.",
    };
  }
  // Two different refusals that read alike but point at different places. Keep them apart: one is a
  // property of the KEY, the other of the PROJECT, and they have different fixes.
  if (has("not activated on your API project") || has("API not activated") || has("has not been used in project")) {
    return {
      code: "API_NOT_ACTIVATED",
      verdict: "The key is valid and billing is active, but THIS API is not enabled on the GCP project.",
      meaning:
        "Rules out two candidates outright: an invalid/regenerated key and lapsed billing both return a " +
        "different message than this one. Expected in itself — the probe calls the static-maps service, " +
        "which this project has no reason to enable. What it does NOT prove is the state of the Maps SDK " +
        "for Android, and it means the Android allowlist could not be reached either, because Google " +
        "checks API activation BEFORE the application restriction (so re-running with another " +
        "fingerprint tells you nothing). >>> NEXT: GCP -> APIs & Services -> Enabled APIs, and confirm " +
        "'Maps SDK for Android' is listed. If it is missing, that is the blank map — nothing in this " +
        "repo has ever guaranteed it, since infra/terraform/apikeys.tf (which would enable " +
        "maps-android-backend.googleapis.com) is gated off and was never imported.",
    };
  }
  if (has("not authorized to use this API")) {
    return {
      code: "API_RESTRICTED",
      verdict: "The key exists and billing is fine, but the KEY's own API restriction forbids this call.",
      meaning:
        "A key-level restriction, not a project-level one — healthy if the key is correctly restricted to " +
        "maps-android-backend.googleapis.com (docs/SECURITY-OPS.md §B / infra/terraform/apikeys.tf). It " +
        "says NOTHING about the Android SDK, and the Android allowlist could not be reached. Verify the " +
        "allowlist by eye in the console.",
    };
  }
  if (has("billing")) {
    return {
      code: "BILLING",
      verdict: "Billing is not enabled (or has lapsed) on the GCP project.",
      meaning:
        "A Maps Platform key with no active billing account returns authorization failures and renders " +
        "blank tiles. Fix in GCP -> Billing. This is candidate 2 in MAPS-LOADING-REVIEW-2026-08-16 §3.",
    };
  }
  if (has("API key is invalid") || has("provided API key is invalid")) {
    return {
      code: "INVALID_KEY",
      verdict: "Google does not recognise this key at all.",
      meaning:
        "The key was deleted or regenerated in GCP and the EAS environment still holds the old string. " +
        "Re-create it in EAS with Sensitive visibility and ship a NEW BINARY — the Maps key is native and " +
        "no OTA can carry it (REL-01).",
    };
  }
  return {
    code: "UNKNOWN",
    verdict: "Google returned something this script does not recognise.",
    meaning: "Read the raw body below and update classify() in scripts/maps-key-doctor.mjs.",
  };
}

async function probe({ key, pkg, sha1 }) {
  const headers = {};
  if (pkg && sha1) {
    headers["X-Android-Package"] = pkg;
    headers["X-Android-Cert"] = normalizeSha1(sha1);
  }
  const res = await fetch(`${PROBE_URL}?${PROBE_QUERY}&key=${encodeURIComponent(key)}`, { headers });
  // A success serves a PNG; only the error path carries prose worth reading.
  const type = res.headers.get("content-type") ?? "";
  const raw = type.startsWith("image/") ? "(binary image — the request succeeded)" : await res.text();
  // Defence in depth: this body is echoed verbatim into a CI log. Google's error prose does not quote
  // the key today, but if that ever changes, drop the whole body rather than leak it — the key is used
  // here only as a predicate, so nothing derived from it can reach the caller.
  const safe = raw.includes(key) ? "(response withheld — it contained the API key)" : raw;
  return { status: res.status, body: safe.slice(0, 800) };
}

/**
 * Which of the two independent GOOGLE_MAPS_API_KEY stores to probe.
 *
 *   eas     the EAS environment variable — what `mobile-release.yml` builds the Play binary with, and
 *           therefore the key MOB-MAP-02 is about. Resolved in memory; it never touches the disk.
 *   github  the GitHub Actions secret — used only by `android-test-apk.yml` for sideloaded QA APKs.
 *
 * Getting these confused is not hypothetical: this script's first run probed the GitHub secret and
 * reported INVALID_KEY, which is true of that secret and says nothing about the Play build.
 */
async function resolveKey() {
  if ((process.env.KEY_SOURCE || "eas").trim() !== "eas") {
    return { value: process.env.GOOGLE_MAPS_API_KEY?.trim(), origin: "the GitHub Actions secret (QA-APK lane)" };
  }
  const { readMapsKeyFromEas } = await import("./eas-read-maps-key.mjs");
  const r = await readMapsKeyFromEas({
    appId: process.env.EAS_APP_ID?.trim(),
    environment: process.env.EAS_ENVIRONMENT || "preview",
    token: process.env.EXPO_TOKEN?.trim(),
  });
  return { value: r.value, origin: `the EAS "${r.environment}" environment (visibility: ${r.visibility})` };
}

async function main() {
  const pkg = (process.env.ANDROID_PACKAGE || "zw.co.lynia").trim();
  const sha1 = process.env.ANDROID_CERT_SHA1?.trim();

  const { value: key, origin } = await resolveKey();

  if (!key) {
    console.error(
      "No Maps key could be resolved. With key_source: github the repository secret " +
        "GOOGLE_MAPS_API_KEY must be set (android-test-apk.yml uses the same one).",
    );
    process.exit(2);
  }

  console.log("Maps key doctor — MOB-MAP-02\n");
  console.log(`  source  : ${origin}`);
  console.log(`  package : ${pkg}`);
  console.log(`  sha-1   : ${sha1 ? normalizeSha1(sha1) : "(none supplied — allowlist NOT tested)"}`);
  // Shape check reported as CONSTANT strings, never a value derived from the key.
  //
  // The first version of this line printed `key.length` — "safe", since a Google key is a fixed 39
  // characters and the length discloses nothing. CodeQL flagged it anyway (js/clear-text-logging,
  // high), and it was right to: this output goes to a CI log readable by anyone with repo read access,
  // and "it's only a derived value" is the reasoning that turns into a real leak the next time someone
  // extends the line. Branching on the key and logging fixed text keeps the diagnostic that actually
  // matters — a truncated or whitespace-mangled secret is the real failure mode — with no data flow
  // from the secret into the sink at all.
  const looksLikeGoogleKey = /^AIza[0-9A-Za-z_-]{35}$/.test(key);
  console.log(
    looksLikeGoogleKey
      ? "  key     : present, well-formed (never printed)\n"
      : "  key     : present but NOT shaped like a Google API key — expected 'AIza' + 35 chars. " +
          "Check the secret for truncation or stray whitespace.\n",
  );

  if (sha1 && !isWellFormedSha1(sha1)) {
    console.error(
      `The supplied fingerprint is not a SHA-1. Expected 40 hex characters (20 colon-separated byte ` +
        `pairs); got ${normalizeSha1(sha1).length}. A SHA-256 is 64 — the wrong algorithm, and it fails ` +
        `to match silently at runtime rather than erroring.`,
    );
    process.exit(2);
  }

  // Two probes: with the Android identity, and without. The pair is what separates "this cert is not
  // allowed" from "the key refuses every unidentified caller", which look identical from one request.
  const withId = sha1 ? await probe({ key, pkg, sha1 }) : null;
  const bare = await probe({ key });

  if (withId) {
    const c = classify(withId);
    console.log(`AS THE APP (X-Android-Package + X-Android-Cert) -> HTTP ${withId.status}  [${c.code}]`);
    console.log(`  ${c.verdict}`);
    console.log(`  ${c.meaning}`);
    console.log(`  raw: ${withId.body.trim() || "(empty)"}\n`);
  }

  const cb = classify(bare);
  console.log(`WITHOUT ANY ANDROID IDENTITY -> HTTP ${bare.status}  [${cb.code}]`);
  console.log(`  ${cb.verdict}`);
  console.log(`  raw: ${bare.body.trim() || "(empty)"}\n`);

  if (!sha1) {
    console.log(
      "No SHA-1 supplied, so the allowlist — the actual MOB-MAP-02 question — was not tested. Re-run with\n" +
        "the Play *app signing* certificate SHA-1: Play Console -> Test and release -> Setup -> App\n" +
        "integrity -> 'App signing key certificate'. That is the certificate installed builds run under;\n" +
        "the EAS upload keystore is a different one and allowlisting only it is the documented trap.",
    );
  }

  // Never fail the job on a diagnosis — this is a read-only report, and a non-zero exit would read as
  // "the tool is broken" rather than "the key is misconfigured".
  const summary = withId ? classify(withId).code : cb.code;
  console.log(`::notice title=Maps key doctor::${summary}`);
}

// Only run when invoked directly, so the pure helpers above stay unit-testable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`Probe failed to run: ${err?.message ?? err}`);
    process.exit(1);
  });
}
