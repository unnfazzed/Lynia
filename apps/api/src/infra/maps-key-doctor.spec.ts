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

type Verdict = { code: string; verdict: string; meaning: string };
type Doctor = {
  classify: (r: { status: number; body: string }) => Verdict;
  classifyPlaces: (r: { status: number; json: unknown }) => Verdict;
  redactKeys: (text: unknown) => string;
  PLACES_PROBE_BODY: Record<string, unknown>;
};

let doctor: Doctor;

beforeAll(async () => {
  doctor = (await import(pathToFileURL(SCRIPT).href)) as Doctor;
});

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
