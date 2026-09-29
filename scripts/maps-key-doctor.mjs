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
 * It also checks the OTHER client key, `EXPO_PUBLIC_GOOGLE_PLACES_KEY` (address search). That call IS
 * plain HTTPS from the app's JS (apps/mobile/src/api/places.ts), so the Places probe makes the app's
 * exact request and reads Google's answer directly — see `classifyPlaces`.
 *
 * Keys are read from the environment and never printed, logged, or included in any output.
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
  // A PROJECT-level refusal: what every key of `lynia-500911` has answered since the project was
  // suspended on 2026-09-17. No setting on the key can fix it; the key has to live in another project.
  if (has("disabled the use of APIs from this API project")) {
    return {
      code: "PROJECT_DISABLED",
      verdict: "Google has disabled every API on the Cloud project this key belongs to.",
      meaning:
        "The key may be fine; its project is not. This is the answer of a suspended project. Create a " +
        "new Maps SDK for Android key in the live project (lyniago-app), set it in EAS as Sensitive, " +
        "and ship a NEW BINARY: the Maps key is native and no OTA can carry it (REL-01).",
    };
  }
  return {
    code: "UNKNOWN",
    verdict: "Google returned something this script does not recognise.",
    meaning: "Read the raw body below and update classify() in scripts/maps-key-doctor.mjs.",
  };
}

// --- Places (address search) -------------------------------------------------------------------------

const PLACES_PROBE_URL = "https://places.googleapis.com/v1/places:autocomplete";

/** The app's own autocomplete request (apps/mobile/src/api/places.ts), for a place every tester knows. */
export const PLACES_PROBE_BODY = {
  input: "westgate",
  includedRegionCodes: ["zw"],
  locationBias: { circle: { center: { latitude: -17.8292, longitude: 31.0522 }, radius: 50000 } },
};

/** Each Places verdict, by code. `classifyPlaces` only decides WHICH one applies. */
const PLACES_VERDICTS = {
  PROJECT_SUSPENDED: {
    verdict: "The key belongs to a suspended Cloud project.",
    meaning:
      "lynia-500911 has been suspended since 2026-09-17, and every key in it is refused. Create the Places " +
      "key in the live project (lyniago-app): enable 'Places API (New)', restrict the key to it, then " +
      "replace EXPO_PUBLIC_GOOGLE_PLACES_KEY in EAS (Sensitive) and in the GitHub secret mobile-ota.yml reads.",
  },
  API_NOT_ENABLED: {
    verdict: "Places API (New) is not enabled on the key's project.",
    meaning:
      "APIs & Services -> Library -> 'Places API (New)' (places.googleapis.com) -> Enable. The legacy " +
      "'Places API' is not a substitute: the app no longer calls it, and Google does not offer it to " +
      "projects created after 2025-03-01.",
  },
  APP_RESTRICTED: {
    verdict: "The key has an application restriction, and it refuses this caller.",
    meaning:
      "The app sends its Places calls from shared JS with no Android or iOS identity headers, so the app " +
      "is refused too. Set Application restrictions: None, and contain the key with an API restriction " +
      "(Places API (New) only) plus a quota cap (docs/SECURITY-OPS.md §B).",
  },
  API_RESTRICTED: {
    verdict: "The key's API restrictions do not include Places API (New).",
    meaning:
      "Credentials -> the key -> API restrictions -> add 'Places API (New)'. A key restricted to the " +
      "legacy 'Places API' answers exactly this.",
  },
  INVALID_KEY: {
    verdict: "Google does not recognise this key at all.",
    meaning: "Deleted, regenerated, or pasted wrong. Replace EXPO_PUBLIC_GOOGLE_PLACES_KEY with the key's current value.",
  },
  BILLING: {
    verdict: "Billing is not enabled on the key's project.",
    meaning: "Places API (New) needs a billing account on the project, even inside the free usage tier.",
  },
};

/** google.rpc.ErrorInfo reasons → verdict. The machine answer, so it always wins over message text. */
const PLACES_REASONS = {
  CONSUMER_SUSPENDED: "PROJECT_SUSPENDED",
  SERVICE_DISABLED: "API_NOT_ENABLED",
  API_KEY_ANDROID_APP_BLOCKED: "APP_RESTRICTED",
  API_KEY_IOS_APP_BLOCKED: "APP_RESTRICTED",
  API_KEY_HTTP_REFERRER_BLOCKED: "APP_RESTRICTED",
  API_KEY_IP_ADDRESS_BLOCKED: "APP_RESTRICTED",
  API_KEY_SERVICE_BLOCKED: "API_RESTRICTED",
  API_KEY_INVALID: "INVALID_KEY",
  BILLING_DISABLED: "BILLING",
};

/**
 * Message phrases → verdict, consulted ONLY when Google sent no reason this script knows. Order
 * matters: an app restriction's message also ends "are blocked", so it is tested before the API one.
 */
const PLACES_PHRASES = [
  ["has been suspended", "PROJECT_SUSPENDED"],
  ["disabled the use of APIs from this API project", "PROJECT_SUSPENDED"],
  ["has not been used in project", "API_NOT_ENABLED"],
  ["client application", "APP_RESTRICTED"],
  ["referer", "APP_RESTRICTED"],
  ["IP address", "APP_RESTRICTED"],
  ["Requests to this API", "API_RESTRICTED"],
  ["API key not valid", "INVALID_KEY"],
  ["billing", "BILLING"],
];

/**
 * Map a Places API (New) answer onto a cause. Unlike the static-maps prose above, these errors carry
 * a machine `reason` (google.rpc.ErrorInfo): that decides the verdict whenever it is one this script
 * knows, and the message text is only a fallback. Anything unrecognised is UNKNOWN, as above.
 */
export function classifyPlaces({ status, json }) {
  const error = json?.error;
  if (status === 200 && !error) {
    const first = (Array.isArray(json?.suggestions) ? json.suggestions : []).find((x) => x?.placePrediction)?.placePrediction;
    const top = first?.text?.text || first?.structuredFormat?.mainText?.text;
    return top
      ? {
          code: "OK",
          verdict: `The key works. Google's top suggestion for "westgate": ${top}.`,
          meaning: "Address search offers suggestions in any build or OTA that carries this key.",
        }
      : {
          code: "OK_NO_RESULTS",
          verdict: 'The key works, but Google returned no suggestions for "westgate" in Zimbabwe.',
          meaning: "Not a key problem: the request was accepted. A miss here is a data question.",
        };
  }

  const reason = (Array.isArray(error?.details) ? error.details : []).map((d) => d?.reason).find((r) => typeof r === "string" && r) ?? "";
  const message = String(error?.message ?? "").toLowerCase();
  const code =
    PLACES_REASONS[reason] ?? PLACES_PHRASES.find(([phrase]) => message.includes(phrase.toLowerCase()))?.[1];
  if (code) return { code, ...PLACES_VERDICTS[code] };
  return {
    code: "UNKNOWN",
    verdict: `Google returned something this script does not recognise (HTTP ${status}${reason ? `, reason ${reason}` : ""}).`,
    meaning: "Read the raw message below and update classifyPlaces() in scripts/maps-key-doctor.mjs.",
  };
}

/**
 * Blank out anything shaped like a Google API key before text from Google reaches the CI log. Google
 * quotes the key back in some refusals ("Consumer 'api_key:AIza…' has been suspended"), and a check
 * for the exact configured value misses the echo whenever the stored value differs from what was
 * sent — a stray space, which fetch trims from a header, is enough.
 */
export function redactKeys(text) {
  return String(text ?? "").replace(/AIza[0-9A-Za-z_-]{35}/g, "<api key redacted>");
}

/** Redact, then withhold outright anything that still contains the key (a malformed one, say). */
function scrub(text, key) {
  const redacted = redactKeys(text);
  return key && redacted.includes(key) ? "(withheld — it contained the API key)" : redacted;
}

async function probePlaces(key) {
  const res = await fetch(PLACES_PROBE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify(PLACES_PROBE_BODY),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Not JSON (a proxy page, say): classified UNKNOWN with no message to show.
  }
  return { status: res.status, json };
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
  // Defence in depth: this body is echoed verbatim into a CI log. Google's static-maps prose does not
  // quote the key today, but if that ever changes it is redacted rather than leaked (see `scrub`).
  return { status: res.status, body: scrub(raw, key).slice(0, 800) };
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

/**
 * The Places key, from the same store `key_source` names. On `github` that is the OTA lane's copy:
 * mobile-ota.yml exports bundles with `secrets.EXPO_PUBLIC_GOOGLE_PLACES_KEY`, a separate store from
 * the EAS variable the store build inlines — the same two-stores trap as the Maps key above.
 */
async function resolvePlacesKey() {
  if ((process.env.KEY_SOURCE || "eas").trim() !== "eas") {
    return { value: process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY?.trim(), origin: "the GitHub Actions secret (the OTA lane's copy)" };
  }
  const { readKeyFromEas } = await import("./eas-read-maps-key.mjs");
  const r = await readKeyFromEas({
    appId: process.env.EAS_APP_ID?.trim(),
    environment: process.env.EAS_ENVIRONMENT || "preview",
    token: process.env.EXPO_TOKEN?.trim(),
    name: "EXPO_PUBLIC_GOOGLE_PLACES_KEY",
  });
  return { value: r.value, origin: `the EAS "${r.environment}" environment (visibility: ${r.visibility})` };
}

/**
 * The Places half of the report. Never throws, and never prints an error's own text: a failed
 * request's message can quote the key (undici names an invalid header VALUE in full), and this log
 * is public. A missing key is a finding, not a crash.
 */
async function placesSection() {
  console.log("Places key (address search) — EXPO_PUBLIC_GOOGLE_PLACES_KEY\n");
  let resolved;
  try {
    resolved = await resolvePlacesKey();
  } catch (err) {
    // The EAS reader's own messages never carry the value; anything else is redacted regardless.
    console.log(`  ${redactKeys(err?.message ?? err)}\n`);
    return "NOT_READABLE";
  }
  const raw = resolved.value ?? "";
  console.log(`  source  : ${resolved.origin}`);
  if (!raw.trim()) {
    console.log("  key     : NOT SET — the app falls back to the phone's own geocoder (no suggestions).\n");
    return "NOT_SET";
  }
  // Same constant-string shape check as the Maps key, on the value AS STORED — stray whitespace is
  // exactly what it is there to catch — then probe with the trimmed key, as fetch would send it.
  console.log(
    /^AIza[0-9A-Za-z_-]{35}$/.test(raw)
      ? "  key     : present, well-formed (never printed)\n"
      : "  key     : present but NOT shaped like a Google API key — expected 'AIza' + 35 chars. " +
          "Check the value for truncation or stray whitespace.\n",
  );
  const key = raw.trim();

  let answer;
  try {
    answer = await probePlaces(key);
  } catch {
    console.log('PLACES API (NEW) AUTOCOMPLETE "westgate" -> no answer  [PROBE_FAILED]');
    console.log("  The request failed before Google answered: the network, or a key holding characters a header");
    console.log("  cannot carry. The error text is not shown, because it can quote the key.\n");
    return "PROBE_FAILED";
  }
  const c = classifyPlaces(answer);
  const message = String(answer.json?.error?.message ?? "");
  console.log(`PLACES API (NEW) AUTOCOMPLETE "westgate" -> HTTP ${answer.status}  [${c.code}]`);
  console.log(`  ${c.verdict}`);
  console.log(`  ${c.meaning}`);
  // A suspended consumer's message quotes the key ("Consumer 'api_key:…' has been suspended").
  if (message) console.log(`  raw: ${scrub(message, key).slice(0, 800)}`);
  console.log("");
  return c.code;
}

/**
 * The Maps half of the report. Returns its verdict and the exit code it asks for, and never throws,
 * so an unreadable Maps key or a mistyped SHA-1 no longer stops the Places check from running.
 */
async function mapsSection() {
  const pkg = (process.env.ANDROID_PACKAGE || "zw.co.lynia").trim();
  const sha1 = process.env.ANDROID_CERT_SHA1?.trim();

  let resolved;
  try {
    resolved = await resolveKey();
  } catch (err) {
    console.error(`Maps key could not be read: ${redactKeys(err?.message ?? err)}`);
    return { code: "NOT_READABLE", exitCode: 1 };
  }
  const raw = resolved.value ?? "";

  if (!raw.trim()) {
    console.error(
      "No Maps key could be resolved. With key_source: github the repository secret " +
        "GOOGLE_MAPS_API_KEY must be set (android-test-apk.yml uses the same one).",
    );
    return { code: "NOT_SET", exitCode: 2 };
  }

  console.log("Maps key doctor — MOB-MAP-02\n");
  console.log(`  source  : ${resolved.origin}`);
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
  // from the secret into the sink at all. It runs on the value AS STORED, so the whitespace case
  // is still caught; the probes then use the trimmed key.
  const looksLikeGoogleKey = /^AIza[0-9A-Za-z_-]{35}$/.test(raw);
  console.log(
    looksLikeGoogleKey
      ? "  key     : present, well-formed (never printed)\n"
      : "  key     : present but NOT shaped like a Google API key — expected 'AIza' + 35 chars. " +
          "Check the secret for truncation or stray whitespace.\n",
  );
  const key = raw.trim();

  if (sha1 && !isWellFormedSha1(sha1)) {
    console.error(
      `The supplied fingerprint is not a SHA-1. Expected 40 hex characters (20 colon-separated byte ` +
        `pairs); got ${normalizeSha1(sha1).length}. A SHA-256 is 64 — the wrong algorithm, and it fails ` +
        `to match silently at runtime rather than erroring.`,
    );
    return { code: "BAD_SHA1", exitCode: 2 };
  }

  // Two probes: with the Android identity, and without. The pair is what separates "this cert is not
  // allowed" from "the key refuses every unidentified caller", which look identical from one request.
  let withId;
  let bare;
  try {
    withId = sha1 ? await probe({ key, pkg, sha1 }) : null;
    bare = await probe({ key });
  } catch {
    console.error("The Maps probe failed before Google answered. The error text is not shown: it can quote the key.");
    return { code: "PROBE_FAILED", exitCode: 1 };
  }

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
        "the Play *app signing* certificate SHA-1: Play Console -> Protected with Play -> App signing ->\n" +
        "'Classical key' -> SHA-1 certificate fingerprint. That is the certificate installed builds run under;\n" +
        "the EAS upload keystore is a different one and allowlisting only it is the documented trap.",
    );
  }
  return { code: withId ? classify(withId).code : cb.code, exitCode: 0 };
}

async function main() {
  const maps = await mapsSection();
  console.log("");
  const places = await placesSection();

  // Never fail the job on a diagnosis — this is a read-only report, and a non-zero exit would read as
  // "the tool is broken" rather than "the key is misconfigured". Only unusable INPUT (no key, a bad
  // SHA-1) or a probe that could not run exits non-zero, and only after both halves have reported.
  console.log(`::notice title=Maps key doctor::${maps.code}`);
  console.log(`::notice title=Places key doctor::${places}`);
  if (maps.exitCode) process.exitCode = maps.exitCode;
}

// Only run when invoked directly, so the pure helpers above stay unit-testable.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // Both sections catch their own failures, so this is a bug in the script. Its message is still
    // withheld: this log is public, and an error thrown near a request can quote the key.
    console.error(`Probe failed to run: ${err?.name ?? "Error"} (message withheld — it can quote a key).`);
    process.exit(1);
  });
}
