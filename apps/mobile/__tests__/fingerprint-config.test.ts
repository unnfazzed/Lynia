import fs from "fs";
import path from "path";

/**
 * Guards `fingerprint.config.js` (REL-01, docs/KNOWN_BUGS.md).
 *
 * Without that file, `@expo/fingerprint` hashes `version` into the `fingerprint` runtimeVersion, so
 * every release-please bump rotated the runtime version and OTA updates published from `main`
 * matched no installed binary — and were ignored SILENTLY, which is what made the bug survive so
 * long. There is no runtime assertion that can catch a regression here: deleting the file breaks
 * nothing that any test or build would notice, it just quietly makes the OTA lane undeliverable
 * again. Hence a structural guard.
 *
 * This deliberately does NOT compute a real fingerprint — that takes tens of seconds and needs the
 * full native module tree resolved. The behavioural verification was done out-of-band and recorded
 * in the config file's header and the ledger: with the skip, versions 0.17.9 and 0.17.10 both hash
 * to `5b175b9b…`, while flipping `targetSdkVersion` 35 → 34 still moves it to `de24d3a5…` (proving
 * the skip removes version fields only, and every native input is still hashed).
 */
describe("fingerprint.config.js (REL-01 — OTA runtime-version stability)", () => {
  const configPath = path.join(__dirname, "..", "fingerprint.config.js");

  it("exists — deleting it silently breaks OTA delivery, nothing else would fail", () => {
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("skips the expo-config version fields, so a release-please bump cannot rotate the runtime version", () => {
    const config = require("../fingerprint.config.js");
    expect(config.sourceSkips).toContain("ExpoConfigVersions");
  });

  it("declares sourceSkips as plain strings — `@expo/fingerprint` is not resolvable from apps/mobile", () => {
    // The documented alternative is `require('@expo/fingerprint').SourceSkips.ExpoConfigVersions`,
    // but that package is only a transitive dep of expo-updates and pnpm's strict layout does not
    // link it into apps/mobile — the same failure class as EAS builds 5/6/7. A require() form would
    // throw on the builder, and the config loader would fall back to hashing versions again.
    // Strip comments first — the file's own header *describes* the require() form as the thing to
    // avoid, and matching that prose would fail the test for the wrong reason.
    const code = fs
      .readFileSync(configPath, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/require\(\s*["']@expo\/fingerprint["']\s*\)/);

    const config = require("../fingerprint.config.js");
    for (const skip of config.sourceSkips) {
      expect(typeof skip).toBe("string");
    }
  });
});

/**
 * The other half of OTA deliverability, and the one that bit on 2026-08-16.
 *
 * `sourceSkips` above removes only the VERSION fields; the resolved `extra` section is still hashed in
 * full (`@expo/fingerprint`'s `normalizeExpoConfig` drops it only under `ExpoConfigExtraSection`,
 * which is not skipped here and must not be — `extra` carries real config). So any `EXPO_PUBLIC_*`
 * value mirrored into `extra` stops being a plain JS-bundle string and becomes a fingerprint input:
 * a build made WITHOUT it and an OTA exported WITH it compute different runtimeVersions, and
 * expo-updates then delivers that update to zero devices, silently.
 *
 * That is precisely the shape the Places key had. It made the one key that CAN be repaired over the
 * air — unlike the native Maps key — undeliverable by the only lane that could repair it. Nothing at
 * runtime, in a build, or in CI would notice a re-introduction, so this is a structural guard like the
 * one above.
 */
describe("app.config.ts — no EXPO_PUBLIC_ value may be mirrored into `extra`", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.config.ts"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("does not mirror the Places key into extra (OTA-repairable ⇒ must stay out of the fingerprint)", () => {
    expect(code).not.toMatch(/googlePlacesKey/);
  });

  it("reads the Places key only as a bundle-time substitution", () => {
    // The key must appear in the file solely inside the release-build provisioning warning, never as
    // an `extra` entry. Assert on the *uncommented* code so the explanatory prose above doesn't count.
    const extraSection = code.slice(code.indexOf("extra:"));
    expect(extraSection).not.toMatch(/EXPO_PUBLIC_GOOGLE_PLACES_KEY/);
  });
});
