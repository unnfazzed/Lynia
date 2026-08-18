import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * GUARDRAIL for `scripts/tf-maps-tfvars.mjs` — the generator that arms `infra/terraform/apikeys.tf`
 * from the TF_MAPS_* repo variables (MOB-MAP-02, docs/SECURITY-OPS.md §B).
 *
 * Why this is worth a spec: the script's output becomes an Android application restriction on a LIVE
 * client key. Every failure mode it guards is one that reaches users as a blank map and cannot be
 * repaired by an OTA (the Maps key is native — `REL-01`):
 *
 *   - a half-set variable trio  -> `android_cert_sha1_fingerprints = []` -> a key no certificate matches
 *   - a SHA-256 pasted for SHA-1 -> restricts to a fingerprint that matches nothing, silently
 *   - the tfvars.example placeholder left in -> same, and it looks plausible in a diff
 *   - the same fingerprint twice -> the re-signing trap wearing the costume of a correct two-cert list
 *
 * The script is ESM `.mjs` outside this package's rootDir, so it is loaded by runtime dynamic import
 * from a file:// URL — the same idiom `src/parity/screen-inventory.spec.ts` uses for tools/parity.
 */
const SCRIPT = resolve(__dirname, "../../../../scripts/tf-maps-tfvars.mjs");

type Warn = (message: string) => void;
type MapsTfvars = {
  buildMapsTfvars: (env: Record<string, string | undefined>, warn?: Warn) => string | null;
  normalizeFingerprint: (raw: string, label: string) => string;
  normalizeKeyId: (raw: string, label: string, warn: Warn) => string;
  PLACEHOLDER_FINGERPRINTS: Set<string>;
};

let mod: MapsTfvars;

const PLAY_SHA1 = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01";
const UPLOAD_SHA1 = "01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67";
const ARMED = {
  TF_MAPS_KEY_ID: "9d1f2b3c-1111-2222-3333-1234567890ab",
  TF_PLACES_KEY_ID: "7c2e4a10-4444-5555-6666-0987654321fe",
  TF_MAPS_SHA1_PLAY: PLAY_SHA1,
  TF_MAPS_SHA1_UPLOAD: UPLOAD_SHA1,
};

/** Collects the non-fatal notes so "did it warn?" is assertable, not just "did it throw?". */
function build(env: Record<string, string | undefined>): { out: string | null; warnings: string[] } {
  const warnings: string[] = [];
  const out = mod.buildMapsTfvars(env, (m) => warnings.push(m));
  return { out, warnings };
}

beforeAll(async () => {
  mod = (await import(pathToFileURL(SCRIPT).href)) as MapsTfvars;
});

describe("tf-maps-tfvars · disarmed by default", () => {
  it("emits nothing when no TF_MAPS_* variable is set", () => {
    expect(build({}).out).toBeNull();
  });

  it("stays disarmed — and says so — when only the optional upload fingerprint is set", () => {
    const { out, warnings } = build({ TF_MAPS_SHA1_UPLOAD: UPLOAD_SHA1 });
    expect(out).toBeNull();
    expect(warnings.join(" ")).toContain("TF_MAPS_SHA1_UPLOAD is set");
  });
});

describe("tf-maps-tfvars · fails closed on a half-armed config", () => {
  // The whole point: `maps_api_keys_enabled = true` with an empty fingerprint list is an Android
  // restriction matching no certificate — apikeys.tf's precondition rejects it, and this rejects it
  // one layer earlier with the reason.
  it.each([
    ["only the maps key id", { TF_MAPS_KEY_ID: ARMED.TF_MAPS_KEY_ID }],
    ["only the fingerprint", { TF_MAPS_SHA1_PLAY: PLAY_SHA1 }],
    ["ids but no fingerprint", { TF_MAPS_KEY_ID: ARMED.TF_MAPS_KEY_ID, TF_PLACES_KEY_ID: ARMED.TF_PLACES_KEY_ID }],
  ])("refuses %s", (_label, env) => {
    expect(() => build(env)).toThrow(/Half-armed/);
  });
});

describe("tf-maps-tfvars · fingerprint validation", () => {
  it("normalises a bare lowercase digest to colon-separated uppercase", () => {
    expect(mod.normalizeFingerprint("abcdef0123456789abcdef0123456789abcdef01", "f")).toBe(PLAY_SHA1);
  });

  it("accepts the shape both consoles actually print (colon-separated)", () => {
    expect(mod.normalizeFingerprint(PLAY_SHA1.toLowerCase(), "f")).toBe(PLAY_SHA1);
  });

  it("rejects a SHA-256 by name — the digest the same console page shows one row up", () => {
    expect(() => mod.normalizeFingerprint("A".repeat(64), "f")).toThrow(/SHA-256/);
  });

  it("rejects the terraform.tfvars.example placeholders", () => {
    for (const placeholder of mod.PLACEHOLDER_FINGERPRINTS) {
      expect(() => mod.normalizeFingerprint(placeholder, "f")).toThrow(/placeholder/);
    }
  });

  it("rejects non-hex input rather than silently truncating it", () => {
    expect(() => mod.normalizeFingerprint("SHA-1: ZZ:CD:EF", "f")).toThrow(/non-hex/);
  });

  it("refuses the same certificate listed twice as both roles", () => {
    expect(() => build({ ...ARMED, TF_MAPS_SHA1_UPLOAD: PLAY_SHA1 })).toThrow(/identical/);
  });

  it("warns, but proceeds, when only the Play app-signing certificate is supplied", () => {
    const { out, warnings } = build({ ...ARMED, TF_MAPS_SHA1_UPLOAD: "" });
    expect(out).toContain(PLAY_SHA1);
    expect(out).not.toContain(UPLOAD_SHA1);
    expect(warnings.join(" ")).toContain("sideloaded QA APKs");
  });
});

describe("tf-maps-tfvars · key ids", () => {
  it("recovers the id from a pasted full resource name", () => {
    const notes: string[] = [];
    const id = mod.normalizeKeyId(
      "projects/1234/locations/global/keys/9d1f2b3c-1111-2222-3333-1234567890ab",
      "TF_MAPS_KEY_ID",
      (m) => notes.push(m),
    );
    expect(id).toBe("9d1f2b3c-1111-2222-3333-1234567890ab");
    expect(notes.join(" ")).toContain("final component");
  });

  it("rejects a leftover placeholder", () => {
    expect(() => mod.normalizeKeyId("REPLACE-with-the-KEY_ID-printed-above", "k", () => {})).toThrow(
      /placeholder/,
    );
  });

  it("rejects a value that is not a key id at all", () => {
    expect(() => mod.normalizeKeyId("LyniaGo — Maps SDK for Android", "k", () => {})).toThrow(/not a key id/);
  });
});

describe("tf-maps-tfvars · emitted HCL", () => {
  it("sets every variable apikeys.tf needs, with both fingerprints", () => {
    const { out } = build(ARMED);
    expect(out).not.toBeNull();
    const text = out as string;
    expect(text).toContain("maps_api_keys_enabled          = true");
    expect(text).toContain(`maps_api_key_id                = "${ARMED.TF_MAPS_KEY_ID}"`);
    expect(text).toContain(`places_api_key_id              = "${ARMED.TF_PLACES_KEY_ID}"`);
    // Must match apps/mobile/app.config.ts `android.package` — a mismatch blanks the map.
    expect(text).toContain('android_package_name           = "zw.co.lynia"');
    expect(text).toContain(`"${PLAY_SHA1}",`);
    expect(text).toContain(`"${UPLOAD_SHA1}",`);
  });

  it("emits fingerprints in the exact shape apikeys.tf's own validation accepts", () => {
    const { out } = build(ARMED);
    const listed = (out as string).match(/^ {2}"([^"]+)"/gm)?.map((l) => l.replace(/[ "]/g, "")) ?? [];
    expect(listed).toHaveLength(2);
    for (const f of listed) expect(f).toMatch(/^([0-9A-F]{2}:){19}[0-9A-F]{2}$/);
  });

  it("rejects an application id that is not the app's", () => {
    expect(() => build({ ...ARMED, TF_MAPS_PACKAGE: "not a package" })).toThrow(/application id/);
  });
});
