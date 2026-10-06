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
 * curl. What CAN be reached is Google's web APIs, which enforce the SAME key object: the same
 * application restriction (the Android package + certificate allowlist) and the same
 * enabled/billing/API-restriction state. Two probes use that:
 *
 *   KEY HEALTH  one Static Maps call with no identity: is the key alive, its project live, its billing
 *               on? Static Maps is not enabled on lyniago-app, so the healthy answer is API_NOT_ACTIVATED,
 *               and Google stops at that check: this probe never reaches the certificate allowlist.
 *               Until 2026-10-06 it was the only probe, which is why every run said "fine" while every
 *               phone on Android 16 or older was refused (MOB-MAP-04).
 *   ALLOWLIST   one Places API (New) call per certificate, sent with the MAPS key and that certificate's
 *               X-Android-Package / X-Android-Cert. Places (New) IS enabled on the project (the Places
 *               key needs it), so Google gets as far as the key's restrictions, and it checks the
 *               application restriction before the API list. An allowlisted certificate is therefore
 *               refused for the API (API_KEY_SERVICE_BLOCKED: the Maps key's API list rightly leaves out
 *               Places) and a missing one for the app (API_KEY_ANDROID_APP_BLOCKED). With no `sha1`
 *               input it tests every Play certificate in scripts/play-signing-certs.mjs.
 *
 *   ✅ Is the key alive, its project live, its billing on?
 *   ✅ Is each package + SHA-1 pair on the key's Android allowlist?
 *   ❌ Whether the Maps SDK for Android service is enabled and on the key's API list. No web call
 *      reaches that service: check APIs & Services -> Enabled APIs and the key's API restrictions.
 *
 * It also checks the OTHER client key, `EXPO_PUBLIC_GOOGLE_PLACES_KEY` (address search). That call IS
 * plain HTTPS from the app's JS (apps/mobile/src/api/places.ts), so the Places probe makes the app's
 * exact request and reads Google's answer directly — see `classifyPlaces`.
 *
 * Keys are read from the environment and never printed, logged, or included in any output.
 */

import { APP_ID, PLAY_SIGNING_CERTS, UPLOAD_CERT } from "./play-signing-certs.mjs";

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
        "The healthy answer here: the probe calls Static Maps, which this project has no reason to enable, " +
        "and an invalid/regenerated key or lapsed billing would have answered differently. Google stops at " +
        "this check, so it says nothing about the certificate allowlist (tested below, through Places API " +
        "(New)) or about the Maps SDK for Android (GCP -> APIs & Services -> Enabled APIs must list " +
        "'Maps SDK for Android', and the key's API restrictions must include it).",
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

// --- Maps key: the Android certificate allowlist (through Places API (New)) ---------------------------

/** "93568F…" → "93:56:8F:…", the shape the Play Console and GCP both show. */
export function formatSha1(raw) {
  return (normalizeSha1(raw).match(/.{2}/g) ?? []).join(":");
}

/**
 * Split the `sha1` input into fingerprints. Commas, semicolons or newlines separate them; colons and
 * spaces inside one are dropped, so every shape a console hands you works. Repeats collapse.
 */
export function parseSha1List(raw) {
  const out = [];
  for (const part of String(raw ?? "").split(/[,;\n]+/)) {
    const sha1 = normalizeSha1(part);
    if (sha1 && !out.includes(sha1)) out.push(sha1);
  }
  return out;
}

/**
 * The certificates to test: whatever the `sha1` input lists; with none, every Play signing certificate
 * when the package is this app's (a Play-installed phone runs under one of those, never the upload
 * certificate). Another package has no default.
 */
export function certsToTest({ pkg, raw }) {
  const listed = parseSha1List(raw);
  if (listed.length) return listed;
  return pkg === APP_ID ? PLAY_SIGNING_CERTS.map((c) => normalizeSha1(c.sha1)) : [];
}

/** Which of this app's certificates a fingerprint is, and which phones run under it. */
export function describeCert(sha1) {
  const hex = normalizeSha1(sha1);
  const known = [...PLAY_SIGNING_CERTS, UPLOAD_CERT].find((c) => normalizeSha1(c.sha1) === hex);
  return known ? `${known.file}, ${known.runsOn}` : "not one of this app's known certificates";
}

/** Each allowlist verdict, by code. `classifyAllowlist` only decides WHICH one applies. */
const ALLOWLIST_VERDICTS = {
  ALLOWED: {
    verdict: "On the allowlist.",
    meaning:
      "Google accepted this package + certificate, then refused the call only because the Maps key's API " +
      "list leaves out Places, as it should. Phones running the app under this certificate get the map.",
  },
  ALLOWED_UNRESTRICTED: {
    verdict: "On the allowlist, but the Maps key also answered a Places call.",
    meaning:
      "The certificate is accepted. The key's API list does not keep it to the map, though: it served " +
      "Places (New) too. Restrict it to 'Maps SDK for Android' (docs/SECURITY-OPS.md §B).",
  },
  NOT_ALLOWED: {
    verdict: "NOT on the allowlist.",
    meaning:
      "Phones that run the app under this certificate are refused and draw a blank map. Add it: GCP -> " +
      "APIs & Services -> Credentials -> the Maps key -> Application restrictions -> Android apps -> the " +
      "package + this SHA-1. No new build or OTA: the key string in the app does not change.",
  },
  WRONG_RESTRICTION_TYPE: {
    verdict: "The key's application restriction is not 'Android apps'.",
    meaning:
      "It is restricted to websites, IP addresses or iOS apps, so the Android map is refused on every phone. " +
      "Set Application restrictions -> Android apps, with every certificate in scripts/play-signing-certs.mjs.",
  },
  CANNOT_TEST: {
    verdict: "Could not reach the allowlist: Places API (New) is not enabled on the key's project.",
    meaning:
      "This check rides on a Places (New) call, and Google tests whether an API is enabled before it reads " +
      "the key's restrictions. Check the allowlist by eye in the console instead.",
  },
  PROJECT_SUSPENDED: {
    verdict: "The key belongs to a suspended Cloud project.",
    meaning:
      "Every phone draws a blank map. Create the key in the live project (lyniago-app), set it in EAS as " +
      "Sensitive and ship a NEW BINARY: the Maps key is native and no OTA can carry it (REL-01).",
  },
  INVALID_KEY: {
    verdict: "Google does not recognise this key at all.",
    meaning: "Deleted, regenerated or pasted wrong. The Maps key is native, so replacing it needs a NEW BINARY (REL-01).",
  },
  BILLING: {
    verdict: "Billing is not enabled on the key's project.",
    meaning: "The map needs an active billing account on the project: GCP -> Billing.",
  },
};

/**
 * google.rpc.ErrorInfo reasons → allowlist verdict. The order Google checks in is what makes the first
 * two readable: the application restriction comes before the API list, so a certificate that gets as
 * far as the API list (SERVICE_BLOCKED) has passed the allowlist.
 */
const ALLOWLIST_REASONS = {
  API_KEY_SERVICE_BLOCKED: "ALLOWED",
  API_KEY_ANDROID_APP_BLOCKED: "NOT_ALLOWED",
  API_KEY_IOS_APP_BLOCKED: "WRONG_RESTRICTION_TYPE",
  API_KEY_HTTP_REFERRER_BLOCKED: "WRONG_RESTRICTION_TYPE",
  API_KEY_IP_ADDRESS_BLOCKED: "WRONG_RESTRICTION_TYPE",
  SERVICE_DISABLED: "CANNOT_TEST",
  CONSUMER_SUSPENDED: "PROJECT_SUSPENDED",
  API_KEY_INVALID: "INVALID_KEY",
  BILLING_DISABLED: "BILLING",
};

/** Message phrases, consulted only when Google sent no reason this script knows. First match wins. */
const ALLOWLIST_PHRASES = [
  ["has been suspended", "PROJECT_SUSPENDED"],
  ["disabled the use of APIs from this API project", "PROJECT_SUSPENDED"],
  ["has not been used in project", "CANNOT_TEST"],
  ["Android client application", "NOT_ALLOWED"],
  ["client application", "WRONG_RESTRICTION_TYPE"],
  ["referer", "WRONG_RESTRICTION_TYPE"],
  ["IP address", "WRONG_RESTRICTION_TYPE"],
  ["Requests to this API", "ALLOWED"],
  ["API key not valid", "INVALID_KEY"],
  ["billing", "BILLING"],
];

/** Map one allowlist probe's answer onto a verdict. Like classifyPlaces: the reason wins, text is a fallback. */
export function classifyAllowlist({ status, json }) {
  const error = json?.error;
  if (status === 200 && !error) return { code: "ALLOWED_UNRESTRICTED", ...ALLOWLIST_VERDICTS.ALLOWED_UNRESTRICTED };
  const reason = (Array.isArray(error?.details) ? error.details : []).map((d) => d?.reason).find((r) => typeof r === "string" && r) ?? "";
  const message = String(error?.message ?? "").toLowerCase();
  const code =
    ALLOWLIST_REASONS[reason] ?? ALLOWLIST_PHRASES.find(([phrase]) => message.includes(phrase.toLowerCase()))?.[1];
  if (code) return { code, ...ALLOWLIST_VERDICTS[code] };
  return {
    code: "UNKNOWN",
    verdict: `Google returned something this script does not recognise (HTTP ${status}${reason ? `, reason ${reason}` : ""}).`,
    meaning: "Read the raw message below and update classifyAllowlist() in scripts/maps-key-doctor.mjs.",
  };
}

/**
 * The one-word answer for the job summary: all allowed, something missing, or the first other answer.
 *
 * `control` is the same call sent with NO Android identity. A key whose allowlist is enforced refuses
 * it as an app (NOT_ALLOWED). A key with no application restriction lets it through to the API list
 * (ALLOWED), and then every certificate "passes" too, so the per-certificate answers prove nothing:
 * that is ALLOWLIST_ABSENT, whatever they say.
 */
export function summarizeAllowlist(codes, control) {
  const allowed = (c) => c === "ALLOWED" || c === "ALLOWED_UNRESTRICTED";
  if (allowed(control)) return "ALLOWLIST_ABSENT";
  if (codes.length === 0) return "ALLOWLIST_NOT_TESTED";
  if (codes.includes("NOT_ALLOWED")) return "ALLOWLIST_MISSING";
  if (codes.every(allowed)) return "ALLOWLIST_OK";
  return codes.find((c) => !allowed(c));
}

/**
 * What the no-identity Static Maps call says about the key. Two of classify()'s answers are worded for a
 * call that carried a certificate, and this one carries none, so those two are restated.
 */
export function keyHealthVerdict(c) {
  if (c.code === "OK") {
    return {
      ...c,
      verdict: "The key answered a call that carried no Android identity: it has NO application restriction.",
      meaning: "docs/SECURITY-OPS.md §B restricts the Maps key to Android apps, with every certificate in scripts/play-signing-certs.mjs.",
    };
  }
  if (c.code === "ANDROID_RESTRICTION_REJECTED") {
    return {
      ...c,
      verdict: "The key refuses callers with no Android identity, as an Android-restricted key should.",
      meaning: "Which certificates it lets through is tested below.",
    };
  }
  return c;
}

/** One allowlist call. With no `pkg`/`sha1` it carries no Android identity: the control. */
async function probeAllowlist({ key, pkg, sha1 }) {
  const headers = { "Content-Type": "application/json", "X-Goog-Api-Key": key };
  if (pkg && sha1) {
    headers["X-Android-Package"] = pkg;
    headers["X-Android-Cert"] = normalizeSha1(sha1);
  }
  const res = await fetch(PLACES_PROBE_URL, { method: "POST", headers, body: JSON.stringify(PLACES_PROBE_BODY) });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Not JSON (a proxy page, say): classified UNKNOWN with no message to show.
  }
  return { status: res.status, json };
}

/** The key-health call: Static Maps with no Android identity (see the header for why it cannot test certificates). */
async function probe({ key }) {
  const res = await fetch(`${PROBE_URL}?${PROBE_QUERY}&key=${encodeURIComponent(key)}`);
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
 * The Maps half of the report. Returns its two verdicts (key health, certificate allowlist) and the exit
 * code it asks for, and never throws, so an unreadable Maps key or a mistyped SHA-1 no longer stops the
 * Places check from running.
 */
async function mapsSection() {
  const pkg = (process.env.ANDROID_PACKAGE || APP_ID).trim();
  const certs = certsToTest({ pkg, raw: process.env.ANDROID_CERT_SHA1 });
  const fromInput = parseSha1List(process.env.ANDROID_CERT_SHA1).length > 0;
  const stop = (code, exitCode) => ({ health: code, allowlist: code, exitCode });

  let resolved;
  try {
    resolved = await resolveKey();
  } catch (err) {
    console.error(`Maps key could not be read: ${redactKeys(err?.message ?? err)}`);
    return stop("NOT_READABLE", 1);
  }
  const raw = resolved.value ?? "";

  if (!raw.trim()) {
    console.error(
      "No Maps key could be resolved. With key_source: github the repository secret " +
        "GOOGLE_MAPS_API_KEY must be set (android-test-apk.yml uses the same one).",
    );
    return stop("NOT_SET", 2);
  }

  console.log("Maps key doctor\n");
  console.log(`  source  : ${resolved.origin}`);
  console.log(`  package : ${pkg}`);
  console.log(
    `  certs   : ${
      certs.length === 0
        ? "none (no sha1 input, and no default for this package): the allowlist is NOT tested"
        : `${certs.length}, ${fromInput ? "from the sha1 input" : "every Play signing certificate (scripts/play-signing-certs.mjs)"}`
    }`,
  );
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

  // Position and length only, never the value: a key pasted into the sha1 box by mistake must not land
  // in this public log.
  const bad = certs.map((s, i) => ({ i, s })).filter(({ s }) => !isWellFormedSha1(s));
  if (bad.length) {
    console.error(
      `Not a SHA-1: ${bad.map(({ i, s }) => `fingerprint ${i + 1} has ${s.length} characters`).join("; ")}. ` +
        `Each must be 40 (20 colon-separated byte pairs), and several are separated by commas. A SHA-256 ` +
        `is 64: the wrong algorithm, and it fails to match silently at runtime rather than erroring.`,
    );
    return stop("BAD_SHA1", 2);
  }

  let exitCode = 0;
  let health;
  try {
    const bare = await probe({ key });
    const c = keyHealthVerdict(classify(bare));
    health = c.code;
    console.log(`KEY HEALTH (Static Maps, no Android identity) -> HTTP ${bare.status}  [${c.code}]`);
    console.log(`  ${c.verdict}`);
    console.log(`  ${c.meaning}`);
    console.log(`  raw: ${bare.body.trim() || "(empty)"}\n`);
  } catch {
    // Reported, then carry on: the allowlist probes below are independent of this one.
    console.error("The key-health probe failed before Google answered. The error text is not shown: it can quote the key.\n");
    health = "PROBE_FAILED";
    exitCode = 1;
  }

  // The control: no Android identity at all. It is what makes an ALLOWED below mean something.
  let control;
  if (certs.length) {
    try {
      const answer = await probeAllowlist({ key, pkg: "", sha1: "" });
      const c = classifyAllowlist(answer);
      control = c.code;
      console.log(`ALLOWLIST CONTROL (no Android identity) -> HTTP ${answer.status}  [${c.code}]`);
      if (c.code === "NOT_ALLOWED") {
        console.log("  Refused as an app, as it should be: the key's Android allowlist is enforced.\n");
      } else if (c.code === "ALLOWED" || c.code === "ALLOWED_UNRESTRICTED") {
        console.log("  Let through: the Maps key has NO application restriction, so every certificate below passes and");
        console.log("  proves nothing. The map works, but anyone holding the key can use it. docs/SECURITY-OPS.md §B:");
        console.log("  Application restrictions -> Android apps, with every certificate in scripts/play-signing-certs.mjs.\n");
      } else {
        console.log(`  ${c.verdict}`);
        console.log(`  ${c.meaning}\n`);
      }
    } catch {
      console.log("ALLOWLIST CONTROL (no Android identity) -> no answer  [PROBE_FAILED]\n");
      control = "PROBE_FAILED";
      exitCode = 1;
    }
  }

  const codes = [];
  for (const sha1 of certs) {
    let answer;
    try {
      answer = await probeAllowlist({ key, pkg, sha1 });
    } catch {
      console.log(`ALLOWLIST ${formatSha1(sha1)} -> no answer  [PROBE_FAILED]`);
      console.log("  The request failed before Google answered. The error text is not shown: it can quote the key.\n");
      codes.push("PROBE_FAILED");
      exitCode = 1;
      continue;
    }
    const c = classifyAllowlist(answer);
    codes.push(c.code);
    console.log(`ALLOWLIST ${formatSha1(sha1)} -> HTTP ${answer.status}  [${c.code}]`);
    console.log(`  cert : ${describeCert(sha1)}`);
    console.log(`  ${c.verdict}`);
    if (c.code !== "ALLOWED") {
      console.log(`  ${c.meaning}`);
      const message = String(answer.json?.error?.message ?? "");
      if (message) console.log(`  raw: ${scrub(message, key).slice(0, 400)}`);
    }
    console.log("");
  }

  const allowlist = summarizeAllowlist(codes, control);
  if (allowlist === "ALLOWLIST_MISSING") {
    console.log("At least one certificate is missing from the Maps key: phones that run under it draw a blank map.\n");
  } else if (allowlist === "ALLOWLIST_NOT_TESTED") {
    console.log("No certificate was tested. Pass the SHA-1s (comma-separated) in the sha1 input.\n");
  }
  return { health, allowlist, exitCode };
}

async function main() {
  const maps = await mapsSection();
  console.log("");
  const places = await placesSection();

  // Never fail the job on a diagnosis — this is a read-only report, and a non-zero exit would read as
  // "the tool is broken" rather than "the key is misconfigured". Only unusable INPUT (no key, a bad
  // SHA-1) or a probe that could not run exits non-zero, and only after both halves have reported.
  console.log(`::notice title=Maps key health::${maps.health}`);
  console.log(`::notice title=Maps key allowlist::${maps.allowlist}`);
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
