import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * GUARDRAIL for the verdicts of `scripts/maps-key-doctor.mjs` — the phone-dispatchable check of the two
 * client keys (Maps SDK, Places) the owner runs instead of `adb logcat` and a console.
 *
 * Why this is worth a spec: the doctor is the one place the owner reads "is the new key good?" before an
 * OTA or an EAS build (a limited monthly allowance) is spent on it. A wrong CONFIDENT verdict costs a
 * release; an honest UNKNOWN costs a look at the raw message. So each branch pins both halves: the
 * answers Google actually gives map to the right cause, and nothing else is guessed at.
 *
 * The 2026-09-28 run is the reason `PROJECT_DISABLED` exists: the Maps key's project had been suspended
 * for eleven days and the doctor could only say UNKNOWN.
 *
 * The script is ESM `.mjs` outside this package's rootDir, so it is loaded by runtime dynamic import
 * from a file:// URL — the same idiom `maps-tfvars.spec.ts` uses.
 */
const SCRIPT = resolve(__dirname, "../../../../scripts/maps-key-doctor.mjs");
const CERTS = resolve(__dirname, "../../../../scripts/play-signing-certs.mjs");

type Verdict = { code: string; verdict: string; meaning: string };
type Doctor = {
  classify: (r: { status: number; body: string }) => Verdict;
  classifyPlaces: (r: { status: number; json: unknown }) => Verdict;
  classifyAllowlist: (r: { status: number; json: unknown }) => Verdict;
  summarizeAllowlist: (codes: string[], control?: string) => string;
  keyHealthVerdict: (c: Verdict) => Verdict;
  certsToTest: (o: { pkg: string; raw?: string }) => string[];
  parseSha1List: (raw?: string) => string[];
  formatSha1: (raw: string) => string;
  describeCert: (sha1: string) => string;
  redactKeys: (text: unknown) => string;
  PLACES_PROBE_BODY: Record<string, unknown>;
};
type Cert = { sha1: string; file: string; runsOn: string };
type Certs = { APP_ID: string; PLAY_SIGNING_CERTS: Cert[]; UPLOAD_CERT: Cert };

let doctor: Doctor;
let certs: Certs;

beforeAll(async () => {
  doctor = (await import(pathToFileURL(SCRIPT).href)) as Doctor;
  certs = (await import(pathToFileURL(CERTS).href)) as Certs;
});

/** Bare uppercase hex, the shape certsToTest returns. */
const bare = (sha1: string): string => sha1.replace(/:/g, "");

/** The standard Google error envelope Places API (New) refuses with. */
function refusal(status: number, googleStatus: string, message: string, reason?: string) {
  return {
    status,
    json: {
      error: {
        code: status,
        status: googleStatus,
        message,
        ...(reason ? { details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason, domain: "googleapis.com" }] } : {}),
      },
    },
  };
}

describe("classify (Maps key, static-maps probe)", () => {
  it("names a suspended project instead of shrugging", () => {
    const c = doctor.classify({
      status: 403,
      body: "The Google Maps Platform server rejected your request. Google has disabled the use of APIs from this API project.",
    });
    expect(c.code).toBe("PROJECT_DISABLED");
    expect(c.meaning).toContain("NEW BINARY");
  });

  it("leaves prose it does not know as UNKNOWN", () => {
    expect(doctor.classify({ status: 418, body: "I'm a teapot" }).code).toBe("UNKNOWN");
  });
});

describe("classifyPlaces (Places key, the app's own autocomplete request)", () => {
  it("probes with exactly the request the app sends", () => {
    expect(doctor.PLACES_PROBE_BODY).toEqual({
      input: "westgate",
      includedRegionCodes: ["zw"],
      locationBias: { circle: { center: { latitude: -17.8292, longitude: 31.0522 }, radius: 50000 } },
    });
  });

  it("reports a working key with the top suggestion, so the owner can see it is the right place", () => {
    const c = doctor.classifyPlaces({
      status: 200,
      json: {
        suggestions: [
          { queryPrediction: { text: { text: "westgate harare" } } },
          { placePrediction: { placeId: "w", text: { text: "Westgate Shopping Centre, Harare, Zimbabwe" } } },
        ],
      },
    });
    expect(c.code).toBe("OK");
    expect(c.verdict).toContain("Westgate Shopping Centre, Harare, Zimbabwe");
  });

  it("separates an accepted-but-empty answer from a refusal", () => {
    expect(doctor.classifyPlaces({ status: 200, json: {} }).code).toBe("OK_NO_RESULTS");
  });

  it.each([
    ["the suspended old project", refusal(403, "PERMISSION_DENIED", "Permission denied: Consumer has been suspended.", "CONSUMER_SUSPENDED"), "PROJECT_SUSPENDED"],
    [
      "Places API (New) not enabled on the project",
      refusal(403, "PERMISSION_DENIED", "Places API (New) has not been used in project 123 before or it is disabled.", "SERVICE_DISABLED"),
      "API_NOT_ENABLED",
    ],
    [
      "a key restricted to another API (e.g. the legacy Places API)",
      refusal(403, "PERMISSION_DENIED", "Requests to this API places.googleapis.com method google.maps.places.v1.Places.AutocompletePlaces are blocked.", "API_KEY_SERVICE_BLOCKED"),
      "API_RESTRICTED",
    ],
    [
      "an Android application restriction the app's JS cannot satisfy",
      refusal(403, "PERMISSION_DENIED", "Requests from this Android client application <empty> are blocked.", "API_KEY_ANDROID_APP_BLOCKED"),
      "APP_RESTRICTED",
    ],
    ["an invalid key", refusal(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "API_KEY_INVALID"), "INVALID_KEY"],
    ["billing off", refusal(403, "PERMISSION_DENIED", "This API method requires billing to be enabled.", "BILLING_DISABLED"), "BILLING"],
  ])("names %s", (_label, answer, code) => {
    expect(doctor.classifyPlaces(answer).code).toBe(code);
  });

  // The fixtures above carry a matching message too, so they cannot tell a reason match from a text
  // match. These carry the reason alone, which is what a localised or reworded message amounts to.
  it.each([
    ["CONSUMER_SUSPENDED", "PROJECT_SUSPENDED"],
    ["SERVICE_DISABLED", "API_NOT_ENABLED"],
    ["API_KEY_SERVICE_BLOCKED", "API_RESTRICTED"],
    ["API_KEY_ANDROID_APP_BLOCKED", "APP_RESTRICTED"],
    ["API_KEY_IOS_APP_BLOCKED", "APP_RESTRICTED"],
    ["API_KEY_HTTP_REFERRER_BLOCKED", "APP_RESTRICTED"],
    ["API_KEY_IP_ADDRESS_BLOCKED", "APP_RESTRICTED"],
    ["API_KEY_INVALID", "INVALID_KEY"],
    ["BILLING_DISABLED", "BILLING"],
  ])("maps reason %s to %s with no usable message", (reason, code) => {
    expect(doctor.classifyPlaces(refusal(403, "PERMISSION_DENIED", "", reason)).code).toBe(code);
  });

  it("lets the reason win over message text that points somewhere else", () => {
    const answer = refusal(403, "PERMISSION_DENIED", "Consumer has been suspended until billing is enabled.", "BILLING_DISABLED");
    expect(doctor.classifyPlaces(answer).code).toBe("BILLING");
  });

  it("falls back to the message when Google sends no reason", () => {
    expect(doctor.classifyPlaces(refusal(403, "PERMISSION_DENIED", "Places API (New) has not been used in project 9 before or it is disabled.")).code).toBe(
      "API_NOT_ENABLED",
    );
    // An app-restriction message also ends "are blocked" — it must not be mistaken for an API restriction.
    expect(doctor.classifyPlaces(refusal(403, "PERMISSION_DENIED", "Requests from this Android client application <empty> are blocked.")).code).toBe(
      "APP_RESTRICTED",
    );
  });

  it("guesses at nothing else", () => {
    expect(doctor.classifyPlaces(refusal(500, "INTERNAL", "Internal error encountered.")).code).toBe("UNKNOWN");
    expect(doctor.classifyPlaces({ status: 502, json: null }).code).toBe("UNKNOWN");
  });
});

/**
 * MOB-MAP-04: the static-maps probe stops at "API not activated" on lyniago-app, so it never reached the
 * certificate allowlist, and the key allowlisted only one of Play's three signing certificates for weeks.
 * The allowlist probe sends Places API (New) with the MAPS key: Google checks the application restriction
 * before the API list, so an allowlisted certificate is refused for the API and a missing one for the app.
 * Both answers below are the live ones from 2026-10-06.
 */
describe("classifyAllowlist (Maps key, certificate allowlist through Places API (New))", () => {
  it("reads an API-list refusal as a certificate that got through the allowlist", () => {
    const c = doctor.classifyAllowlist(
      refusal(403, "PERMISSION_DENIED", "Requests to this API places.googleapis.com method google.maps.places.v1.Places.AutocompletePlaces are blocked.", "API_KEY_SERVICE_BLOCKED"),
    );
    expect(c.code).toBe("ALLOWED");
  });

  it("reads an Android-app refusal as a missing certificate, and says the fix needs no build", () => {
    const c = doctor.classifyAllowlist(
      refusal(403, "PERMISSION_DENIED", "Requests from this Android client application zw.co.lynia are blocked.", "API_KEY_ANDROID_APP_BLOCKED"),
    );
    expect(c.code).toBe("NOT_ALLOWED");
    expect(c.meaning).toContain("No new build");
  });

  it("flags a key that answered the Places call, since its API list does not keep it to the map", () => {
    expect(doctor.classifyAllowlist({ status: 200, json: { suggestions: [] } }).code).toBe("ALLOWED_UNRESTRICTED");
  });

  it.each([
    ["API_KEY_IOS_APP_BLOCKED", "WRONG_RESTRICTION_TYPE"],
    ["API_KEY_HTTP_REFERRER_BLOCKED", "WRONG_RESTRICTION_TYPE"],
    ["API_KEY_IP_ADDRESS_BLOCKED", "WRONG_RESTRICTION_TYPE"],
    ["SERVICE_DISABLED", "CANNOT_TEST"],
    ["CONSUMER_SUSPENDED", "PROJECT_SUSPENDED"],
    ["API_KEY_INVALID", "INVALID_KEY"],
    ["BILLING_DISABLED", "BILLING"],
  ])("maps reason %s to %s", (reason, code) => {
    expect(doctor.classifyAllowlist(refusal(403, "PERMISSION_DENIED", "", reason)).code).toBe(code);
  });

  it("falls back to the message when Google sends no reason, telling Android from iOS", () => {
    const by = (message: string): string => doctor.classifyAllowlist(refusal(403, "PERMISSION_DENIED", message)).code;
    expect(by("Requests from this Android client application zw.co.lynia are blocked.")).toBe("NOT_ALLOWED");
    expect(by("Requests from this iOS client application <empty> are blocked.")).toBe("WRONG_RESTRICTION_TYPE");
    expect(by("Requests to this API places.googleapis.com method x are blocked.")).toBe("ALLOWED");
  });

  it("guesses at nothing else", () => {
    expect(doctor.classifyAllowlist(refusal(500, "INTERNAL", "Internal error encountered.")).code).toBe("UNKNOWN");
    expect(doctor.classifyAllowlist({ status: 502, json: null }).code).toBe("UNKNOWN");
  });
});

describe("summarizeAllowlist (the one word in the job summary)", () => {
  it.each([
    [[], "ALLOWLIST_NOT_TESTED"],
    [["ALLOWED", "ALLOWED", "ALLOWED"], "ALLOWLIST_OK"],
    [["ALLOWED", "ALLOWED_UNRESTRICTED"], "ALLOWLIST_OK"],
    // The 2026-10-06 state before the fix: one of three Play certificates on the key.
    [["NOT_ALLOWED", "ALLOWED", "NOT_ALLOWED"], "ALLOWLIST_MISSING"],
    [["ALLOWED", "CANNOT_TEST"], "CANNOT_TEST"],
  ])("%j -> %s", (codes, summary) => {
    expect(doctor.summarizeAllowlist(codes, "NOT_ALLOWED")).toBe(summary);
  });

  // A key with no application restriction lets the no-identity control through to the API list, and
  // then every certificate "passes" too. Without the control, that key would read ALLOWLIST_OK.
  it("reports a key with no application restriction as ALLOWLIST_ABSENT, whatever the certificates say", () => {
    expect(doctor.summarizeAllowlist(["ALLOWED", "ALLOWED", "ALLOWED"], "ALLOWED")).toBe("ALLOWLIST_ABSENT");
    expect(doctor.summarizeAllowlist(["ALLOWED_UNRESTRICTED"], "ALLOWED_UNRESTRICTED")).toBe("ALLOWLIST_ABSENT");
  });
});

describe("which certificates the doctor tests", () => {
  it("tests every Play signing certificate by default, including the one Android 16 and older run under", () => {
    const tested = doctor.certsToTest({ pkg: certs.APP_ID, raw: "" });
    expect(tested).toEqual(certs.PLAY_SIGNING_CERTS.map((c) => bare(c.sha1)));
    expect(tested).toContain("93568F5C4AA01E3CB9CFE98D9F730BFE749E30A9");
  });

  it("has no default for another package", () => {
    expect(doctor.certsToTest({ pkg: "com.example.other", raw: "" })).toEqual([]);
  });

  it("tests exactly the listed fingerprints, in any shape a console prints, once each", () => {
    expect(
      doctor.parseSha1List("c7:d2:78:02:94:1b:2c:a9:6a:85:4c:43:27:c9:de:ee:7a:bc:fb:9f, 93 56 8F 5C 4A A0 1E 3C B9 CF E9 8D 9F 73 0B FE 74 9E 30 A9\nC7D27802941B2CA96A854C4327C9DEEE7ABCFB9F"),
    ).toEqual(["C7D27802941B2CA96A854C4327C9DEEE7ABCFB9F", "93568F5C4AA01E3CB9CFE98D9F730BFE749E30A9"]);
    expect(doctor.certsToTest({ pkg: certs.APP_ID, raw: certs.UPLOAD_CERT.sha1 })).toEqual([bare(certs.UPLOAD_CERT.sha1)]);
  });

  it("prints fingerprints the way the consoles show them and names the known ones", () => {
    expect(doctor.formatSha1("93568F5C4AA01E3CB9CFE98D9F730BFE749E30A9")).toBe("93:56:8F:5C:4A:A0:1E:3C:B9:CF:E9:8D:9F:73:0B:FE:74:9E:30:A9");
    expect(doctor.describeCert("93568f5c4aa01e3cb9cfe98d9f730bfe749e30a9")).toBe("deployment_cert.der, Android 16 and older");
    expect(doctor.describeCert("00".repeat(20))).toBe("not one of this app's known certificates");
  });
});

describe("play-signing-certs.mjs (the one list the doctor and Terraform share)", () => {
  it("holds three distinct Play certificates, none of them the upload certificate", () => {
    const play = certs.PLAY_SIGNING_CERTS.map((c) => c.sha1);
    expect(new Set(play).size).toBe(3);
    expect(play).not.toContain(certs.UPLOAD_CERT.sha1);
    for (const sha1 of [...play, certs.UPLOAD_CERT.sha1]) expect(sha1).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
  });

  it("covers both halves of Play's hybrid signing: the older phones and Android 17+", () => {
    const runsOn = certs.PLAY_SIGNING_CERTS.map((c) => c.runsOn);
    expect(runsOn).toContain("Android 16 and older");
    expect(runsOn.filter((r) => r === "Android 17 and newer")).toHaveLength(2);
  });
});

describe("keyHealthVerdict (the no-identity Static Maps call)", () => {
  const base = (code: string): Verdict => ({ code, verdict: "v", meaning: "m" });

  it("restates the two answers classify() words for a call that carried a certificate", () => {
    expect(doctor.keyHealthVerdict(base("OK")).verdict).toContain("NO application restriction");
    expect(doctor.keyHealthVerdict(base("ANDROID_RESTRICTION_REJECTED")).verdict).toContain("as an Android-restricted key should");
  });

  it("passes every other answer through untouched", () => {
    expect(doctor.keyHealthVerdict(base("API_NOT_ACTIVATED"))).toEqual(base("API_NOT_ACTIVATED"));
  });
});

/**
 * The doctor prints Google's messages into a PUBLIC Actions log, and Google quotes the key back in some
 * refusals. An equality check against the configured value missed that echo whenever the stored value
 * had a stray space (fetch trims a header value; the check did not) — reproduced during review.
 */
describe("redactKeys (nothing key-shaped reaches the log)", () => {
  const KEY = `AIza${"x".repeat(35)}`;

  it("blanks a key Google quotes back, whatever surrounds it", () => {
    const echoed = `Permission denied: Consumer 'api_key:${KEY}' has been suspended.`;
    expect(doctor.redactKeys(echoed)).toBe("Permission denied: Consumer 'api_key:<api key redacted>' has been suspended.");
    expect(doctor.redactKeys(`${KEY} and ${KEY}`)).not.toContain(KEY);
  });

  it("leaves ordinary messages alone and tolerates non-strings", () => {
    expect(doctor.redactKeys("API key not valid. Please pass a valid API key.")).toBe("API key not valid. Please pass a valid API key.");
    expect(doctor.redactKeys(undefined)).toBe("");
  });
});
