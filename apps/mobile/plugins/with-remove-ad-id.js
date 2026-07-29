// Expo config plugin: strip the Google advertising-ID permission from the merged Android manifest.
//
// WHY — the Play Console "Data safety" form asks whether the app uses the advertising ID, and Play
// enforces the answer against the MERGED AndroidManifest.xml, not our source. LyniaGo does not use the
// advertising ID (no ads SDK; PostHog/Sentry/Maps/FCM-messaging don't request it), so we answer "No".
// A transitive dependency could still merge `com.google.android.gms.permission.AD_ID` into the final
// manifest, which would contradict that "No" and risk a policy flag. This plugin forces the manifest
// merger to drop the permission via `tools:node="remove"`, so the shipped manifest can never carry it
// and the "No" declaration stays truthful regardless of what any SDK's library manifest declares.
//
// If an ads/attribution SDK is ever added and the advertising ID is genuinely needed, REMOVE this
// plugin from app.config.ts (and answer "Yes" on the Data safety form) — leaving it would silently
// break that SDK's ad-ID access.
//
// This edits the native manifest, so — like the other native config in app.config.ts — it only takes
// effect in a fresh build (the expo-updates fingerprint runtimeVersion shifts); it is NOT OTA-able.

const { withAndroidManifest } = require("@expo/config-plugins");

const AD_ID_PERMISSION = "com.google.android.gms.permission.AD_ID";
const TOOLS_NS = "http://schemas.android.com/tools";

/** @type {import('@expo/config-plugins').ConfigPlugin} */
module.exports = function withRemoveAdId(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // `tools:node="remove"` only resolves if the tools namespace is declared on <manifest>.
    manifest.$ = manifest.$ ?? {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS;
    }

    const permissions = manifest["uses-permission"] ?? [];

    // Drop any real declaration of the permission first (belt-and-braces), then add the merger marker
    // so a library manifest that declares it later is also removed at merge time.
    const withoutAdId = permissions.filter((p) => p?.$?.["android:name"] !== AD_ID_PERMISSION);
    withoutAdId.push({ $: { "android:name": AD_ID_PERMISSION, "tools:node": "remove" } });
    manifest["uses-permission"] = withoutAdId;

    return cfg;
  });
};
