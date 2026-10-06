#!/usr/bin/env node
/**
 * Arm `infra/terraform/apikeys.tf` from repo variables — the phone-operable half of Route B.
 *
 * WHY THIS EXISTS
 * `apikeys.tf` has encoded the docs/SECURITY-OPS.md §B restrictions since 2026-08-17 and has never
 * been armed, because arming it needed four values typed into `infra/terraform/terraform.tfvars` —
 * a gitignored file that lives on a laptop. The owner of this repo codes from a phone, and the one
 * CI path that reads that file (`TF_PROD_TFVARS`) is a GitHub *secret*: the web UI can overwrite it
 * but cannot show it, so "add four lines to your tfvars" is not an instruction a phone can follow
 * without first having the other eighty lines to paste back. That is why the config stayed dormant.
 *
 * So the four values move OUT of the blob and into four ordinary repo *variables*, each individually
 * readable and editable at github.com/<repo>/settings/variables/actions on a phone:
 *
 *   TF_MAPS_KEY_ID        the EXISTING Maps SDK key's id
 *   TF_PLACES_KEY_ID      the EXISTING Places key's id
 *   TF_MAPS_SHA1_PLAY     EVERY Play **app signing** certificate SHA-1, comma-separated (what
 *                         installed builds run under; three of them, see below)
 *   TF_MAPS_SHA1_UPLOAD   EAS **upload** keystore SHA-1           (sideloaded QA APKs)
 *
 * Why "every". The app uses Play's hybrid signing, so Play signs it with three certificates and a
 * phone runs under one of them depending on its Android version (scripts/play-signing-certs.mjs).
 * Arming with only one would be a "pure in-place update" that strips the others from the live key —
 * the guard in maps-keys-arm.yml would let it through, and phones on the dropped Android versions
 * would draw a blank map, which is MOB-MAP-04 done by Terraform. So for this app the list must hold
 * all of PLAY_SIGNING_CERTS, and the script refuses to arm without them.
 *
 * Variables, not secrets, on purpose. A key *id* is a resource name, not a credential — reading a
 * key's string needs `apikeys.keys.getKeyString`, which no CI identity here holds — and a signing
 * certificate's SHA-1 is extractable from any copy of the APK. Making them secrets would buy nothing
 * and cost the thing that matters most: GitHub masks secret values in logs, so the `terraform plan`
 * that IS the review artefact ("the diff IS the fix", apikeys.tf header) would render the
 * fingerprints as `***` — unreviewable, in the one place a wrong fingerprint must be caught.
 *
 * This script emits `maps.auto.tfvars`. Terraform loads `*.auto.tfvars` after `terraform.tfvars`,
 * so these four assignments override anything the TF_PROD_TFVARS blob may also say about them —
 * deterministic, and documented in infra/terraform/terraform.tfvars.example.
 *
 * FAIL CLOSED, IN BOTH DIRECTIONS. With none of the variables set it prints nothing and exits 0:
 * the gate stays off and terraform sees a zero diff, exactly as before. With *some* of them set it
 * refuses — a half-armed config is precisely how you get `android_cert_sha1_fingerprints = []`, an
 * Android restriction matching no certificate, and a blank map for every user, which is the outcome
 * apikeys.tf's precondition exists to prevent and the outcome this file must never hand it.
 *
 * IT DOES NOT VALIDATE THAT THE IDS ARE THE RIGHT KEYS. Nothing about a key id's shape can: the
 * `uid` field is a UUID too, and the import path rejects it. That check lives downstream, where it
 * can be real — `.github/workflows/maps-keys-arm.yml` imports and then refuses any plan that is not
 * a pure in-place update, and terraform-apply.yml refuses any plan that CREATES an apikeys key.
 */

import { APP_ID, PLAY_SIGNING_CERTS } from "./play-signing-certs.mjs";

/** The syntactically-valid but deliberately fake fingerprints in terraform.tfvars.example. */
export const PLACEHOLDER_FINGERPRINTS = new Set([
  "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33",
  "44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77",
]);

/**
 * Accept a SHA-1 in any of the shapes a console actually hands you — colon-separated (Play Console,
 * expo.dev), space-separated, or bare — and return the ONE shape apikeys.tf's validation accepts:
 * 20 colon-separated uppercase hex pairs. Throws with the specific reason, because "invalid
 * fingerprint" sends you back to a console to re-copy something that was already correct.
 */
export function normalizeFingerprint(raw, label) {
  const bare = String(raw ?? "").replace(/[:\s]/g, "").toUpperCase();
  if (bare.length === 0) throw new Error(`${label} is empty.`);
  if (!/^[0-9A-F]+$/.test(bare)) {
    throw new Error(`${label} contains non-hex characters. Copy the SHA-1 row only, not its label.`);
  }
  if (bare.length === 64) {
    throw new Error(
      `${label} is a SHA-256 (32 byte pairs), not a SHA-1. The Maps key matches on SHA-1 — a SHA-256 ` +
        `passes no validation Google runs and silently matches nothing at runtime. Both consoles show ` +
        `both digests; take the row labelled SHA-1.`,
    );
  }
  if (bare.length !== 40) {
    throw new Error(`${label} is ${bare.length / 2} byte pairs; a SHA-1 is exactly 20.`);
  }
  const pairs = bare.match(/.{2}/g) ?? [];
  const formatted = pairs.join(":");
  if (PLACEHOLDER_FINGERPRINTS.has(formatted)) {
    throw new Error(
      `${label} is still the placeholder from terraform.tfvars.example. Replace it with the real ` +
        `fingerprint — applying the placeholder restricts the Maps key to a certificate that does ` +
        `not exist, which blanks the map for every user.`,
    );
  }
  return formatted;
}

/**
 * Several fingerprints in one variable: commas, semicolons or newlines separate them (never spaces,
 * which normalizeFingerprint accepts INSIDE one). Each is normalised under its own numbered label, and a
 * repeat is dropped with a note.
 */
export function normalizeFingerprintList(raw, label, warn) {
  const parts = String(raw ?? "").split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error(`${label} is empty.`);
  const out = [];
  parts.forEach((part, i) => {
    const fp = normalizeFingerprint(part, parts.length > 1 ? `${label} (fingerprint ${i + 1})` : label);
    if (out.includes(fp)) warn(`${label} lists ${fp} twice; it is kept once.`);
    else out.push(fp);
  });
  return out;
}

/**
 * A key id is the FINAL COMPONENT of `projects/<n>/locations/global/keys/<KEY_ID>`. Pasting the whole
 * resource name is the obvious slip, and it is unambiguously recoverable, so recover it rather than
 * bouncing the founder back to a console — but say so on stderr, since the same person maintains the
 * variable.
 */
export function normalizeKeyId(raw, label, warn) {
  const trimmed = String(raw ?? "").trim();
  if (trimmed.length === 0) throw new Error(`${label} is empty.`);
  let id = trimmed;
  const asResourceName = /^projects\/[^/]+\/locations\/global\/keys\/(.+)$/.exec(trimmed);
  if (asResourceName) {
    id = asResourceName[1];
    warn(`${label}: took the final component of the resource name ("${id}"). That is the value Terraform's \`name\` wants.`);
  }
  if (/replace|example|your[-_]?key|xxx/i.test(id)) {
    throw new Error(`${label} still looks like a placeholder ("${id}").`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(id)) {
    throw new Error(
      `${label} ("${id}") is not a key id. It is the final path component of ` +
        `\`gcloud services api-keys list --format='table(name,displayName)'\` — and NOT the \`uid\` ` +
        `field, which the import path rejects.`,
    );
  }
  return id;
}

/**
 * Build the tfvars text, or `null` when nothing is armed. `warn` receives non-fatal notes (stderr in
 * the CLI, collected in tests). Pure: no filesystem, no process.
 */
export function buildMapsTfvars(env, warn = () => {}) {
  const read = (name) => String(env[name] ?? "").trim();
  const mapsKeyId = read("TF_MAPS_KEY_ID");
  const placesKeyId = read("TF_PLACES_KEY_ID");
  const sha1Play = read("TF_MAPS_SHA1_PLAY");
  const sha1Upload = read("TF_MAPS_SHA1_UPLOAD");
  const packageName = read("TF_MAPS_PACKAGE") || APP_ID;

  const required = { TF_MAPS_KEY_ID: mapsKeyId, TF_PLACES_KEY_ID: placesKeyId, TF_MAPS_SHA1_PLAY: sha1Play };
  const provided = Object.entries(required).filter(([, v]) => v.length > 0);
  if (provided.length === 0) {
    // Disarmed — the default, and the state every run before the founder opts in. Not an error.
    if (sha1Upload) {
      warn("TF_MAPS_SHA1_UPLOAD is set but the required variables are not — the Maps keys stay unmanaged.");
    }
    return null;
  }
  if (provided.length !== Object.keys(required).length) {
    const missing = Object.entries(required).filter(([, v]) => v.length === 0).map(([k]) => k);
    throw new Error(
      `Half-armed Maps key config: ${missing.join(", ")} unset while ${provided.map(([k]) => k).join(", ")} ` +
        `${provided.length === 1 ? "is" : "are"} set. Set all three or none — a partial set is how the ` +
        `Maps key ends up restricted to no certificate at all, which blanks the map for every user.`,
    );
  }

  if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(packageName)) {
    throw new Error(`TF_MAPS_PACKAGE ("${packageName}") is not an Android application id.`);
  }

  const play = normalizeFingerprintList(sha1Play, "TF_MAPS_SHA1_PLAY", warn);
  const upload = sha1Upload ? normalizeFingerprint(sha1Upload, "TF_MAPS_SHA1_UPLOAD") : null;
  if (upload && play.includes(upload)) {
    throw new Error(
      "TF_MAPS_SHA1_UPLOAD is identical to one of the TF_MAPS_SHA1_PLAY certificates. They are different " +
        "certificates by construction — Play re-signs the uploaded AAB with its own app-signing keys, " +
        "none of which is the EAS upload keystore — so one of them was pasted twice. Re-read both " +
        "(Play Console → Protected with Play → App signing, and expo.dev → Credentials → Android).",
    );
  }
  if (packageName === APP_ID) {
    const missing = PLAY_SIGNING_CERTS.filter((c) => !play.includes(c.sha1));
    if (missing.length) {
      throw new Error(
        `TF_MAPS_SHA1_PLAY leaves out ${missing.map((c) => `${c.sha1} (${c.file}, ${c.runsOn})`).join(" and ")}. ` +
          `Play signs ${APP_ID} with ${PLAY_SIGNING_CERTS.length} certificates and a phone runs under one of ` +
          `them depending on its Android version, so a key missing one blanks the map on those phones ` +
          `(MOB-MAP-04). List all of scripts/play-signing-certs.mjs, comma-separated; if Play's certificates ` +
          `have changed, update that file first.`,
      );
    }
    for (const fp of play.filter((f) => !PLAY_SIGNING_CERTS.some((c) => c.sha1 === f))) {
      warn(`TF_MAPS_SHA1_PLAY includes ${fp}, which is not in scripts/play-signing-certs.mjs. It is kept; check it is meant.`);
    }
  }
  if (!upload) {
    warn(
      "TF_MAPS_SHA1_UPLOAD is unset: the Maps key will accept ONLY Play's app-signing certificates. " +
        "Play-installed builds keep working; sideloaded QA APKs (android-test-apk.yml) will render a " +
        "blank map. Set it unless you mean that.",
    );
  }

  const playComment = (fp) => {
    const known = PLAY_SIGNING_CERTS.find((c) => c.sha1 === fp);
    return known ? `Play ${known.file} — ${known.runsOn}` : "Play app signing — not in scripts/play-signing-certs.mjs";
  };
  const fingerprints = [
    ...play.map((value) => ({ value, comment: playComment(value) })),
    ...(upload ? [{ value: upload, comment: "EAS upload keystore — sideloaded QA APKs" }] : []),
  ];

  return [
    "# GENERATED by scripts/tf-maps-tfvars.mjs from the TF_MAPS_* repo variables. Do not commit.",
    "# Loaded after terraform.tfvars (Terraform reads *.auto.tfvars later), so these four win.",
    "maps_api_keys_enabled          = true",
    `maps_api_key_id                = "${normalizeKeyId(mapsKeyId, "TF_MAPS_KEY_ID", warn)}"`,
    `places_api_key_id              = "${normalizeKeyId(placesKeyId, "TF_PLACES_KEY_ID", warn)}"`,
    `android_package_name           = "${packageName}"`,
    "android_cert_sha1_fingerprints = [",
    ...fingerprints.map((f) => `  "${f.value}", # ${f.comment}`),
    "]",
    "",
  ].join("\n");
}

// --- CLI -------------------------------------------------------------------------------------
// Prints the tfvars to stdout (nothing when disarmed) and exits non-zero on any validation failure,
// so a `set -e` workflow step fails closed rather than planning against a half-armed config.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    const out = buildMapsTfvars(process.env, (m) => console.error(`note: ${m}`));
    if (out === null) {
      console.error("TF_MAPS_* variables unset — apikeys.tf stays gated off (zero diff).");
    } else {
      process.stdout.write(out);
    }
  } catch (err) {
    console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
