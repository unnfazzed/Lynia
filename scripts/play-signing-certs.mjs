/**
 * The certificates `zw.co.lynia` runs under, for the Maps key's Android allowlist (MOB-MAP-04).
 *
 * The app is enrolled in Google Play's quantum-ready hybrid signing (automatic for new apps), so Play
 * holds THREE app-signing certificates, and which one a phone checks depends on its Android version:
 *
 *   - Android 16 and older verify the classical signature, made with `deployment_cert`;
 *   - Android 17 and newer verify APK Signature Scheme v3.2, a hybrid of a NEW classical key
 *     (`hybrid_classical_cert`) and a post-quantum ML-DSA-65 key (`hybrid_pqc_cert`).
 *
 * Google's instruction is to register all three with every API provider that checks a fingerprint.
 * Until 2026-10-06 the Maps key allowlisted only `hybrid_classical_cert` (the Play Console's "Classical
 * key", which these docs called "the SHA-1 devices run"), so every phone on Android 16 or older was
 * refused and drew a blank map. Places kept working: its key has no application restriction.
 *
 * None of these is a secret: every one is readable from any copy of the APK.
 *
 * Source: Play Console → Protected with Play → App signing → download the certificates
 * (certificates.zip: deployment_cert.der, hybrid_classical_cert.der, hybrid_pqc_cert.der) and the
 * upload certificate (upload_cert.der); SHA-1 by `openssl x509 -inform DER -noout -fingerprint -sha1`.
 * Update this list if Play's certificates ever change (an app signing key upgrade): the Maps Key Doctor
 * tests exactly this set, and scripts/tf-maps-tfvars.mjs refuses to arm Terraform without all of it.
 */

/** The Android application id these certificates sign (apps/mobile/app.config.ts `android.package`). */
export const APP_ID = "zw.co.lynia";

/** Play's app-signing certificates. A Play-installed phone runs under one of these, never the upload one. */
export const PLAY_SIGNING_CERTS = [
  { sha1: "93:56:8F:5C:4A:A0:1E:3C:B9:CF:E9:8D:9F:73:0B:FE:74:9E:30:A9", file: "deployment_cert.der", runsOn: "Android 16 and older" },
  { sha1: "35:0F:72:18:13:30:A8:A1:4F:69:5F:E7:EB:AE:B1:6D:76:C6:FC:08", file: "hybrid_classical_cert.der", runsOn: "Android 17 and newer" },
  { sha1: "ED:43:68:09:A6:AB:A4:D8:F9:52:99:18:61:5A:E1:75:8B:A2:C0:5F", file: "hybrid_pqc_cert.der", runsOn: "Android 17 and newer" },
];

/** The EAS-managed upload keystore. Play strips this signature, so it only matters for sideloaded EAS builds. */
export const UPLOAD_CERT = {
  sha1: "C7:D2:78:02:94:1B:2C:A9:6A:85:4C:43:27:C9:DE:EE:7A:BC:FB:9F",
  file: "upload_cert.der",
  runsOn: "sideloaded EAS builds only (Play replaces it)",
};
