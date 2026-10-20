/**
 * Contracts: the app version gate. Re-exported by ../contracts.ts (the front door).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// App version gate (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c)
// ---------------------------------------------------------------------------

/** `GET /app/version-gate` — the SERVER-DRIVEN force-update minimum. The build-time gate
 *  (mobile `EXPO_PUBLIC_MIN_APP_VERSION`) can only affect builds that already carry it; this value is
 *  fetched at app start so an already-installed binary can be walked to its store when a breaking
 *  change strands it. "0.0.0" (the server default when MIN_SUPPORTED_APP_VERSION is unset) = gate off.
 *  Same dotted-version dialect as the mobile comparator (`isVersionBelow` in apps/mobile/src/config.ts).
 *  Per platform via the query string: `?platform=ios` answers with MIN_SUPPORTED_APP_VERSION_IOS, and
 *  anything else (including no parameter) with MIN_SUPPORTED_APP_VERSION. The body never varies in
 *  shape: it is strict, so an added key would fail every installed client's parse. */
export const VersionGateResponse = z.object({ minSupportedVersion: z.string().max(24) }).strict();
export type VersionGateResponse = z.infer<typeof VersionGateResponse>;

/** `GET /app/version-gate?soft=1` — the same gate plus First Run v2's soft update (ledger D-82 §2 #7):
 *  `recommendedVersion` drives the U4a/U4b "A new version is ready" banners (shown once per version to a
 *  build below it) and `whatsNew` is U1's one-line "New …" pill. Both are null until set on the server
 *  (RECOMMENDED_APP_VERSION[_IOS], APP_WHATS_NEW). A SEPARATE body behind an opt-in query parameter
 *  because {@link VersionGateResponse} is strict and every installed build parses it strictly — adding
 *  keys to it would switch their force-update gate off. Only a build that sends `soft=1` gets this one,
 *  and it falls back to the plain body when an older server ignores the parameter. */
export const VersionGateSoftResponse = z
  .object({
    minSupportedVersion: z.string().max(24),
    recommendedVersion: z.string().max(24).nullable(),
    whatsNew: z.string().max(80).nullable(),
  })
  .strict();
export type VersionGateSoftResponse = z.infer<typeof VersionGateSoftResponse>;

/** `GET /app/feature-flags` — merchant-vertical kill switches, served publicly (the version-gate
 *  precedent: read at app cold start BEFORE sign-in; a dormant tab must be able to learn it's
 *  dormant). Server truth is the env flags (plan §0b.3); all-false is the launch-inert default.
 *  This is the mobile app's "remote config" for the Restaurants rollout — tabs ship dark in the
 *  binary/OTA and light up when their flag flips. Cohort gating (which pilot merchants/devices)
 *  is a separate, authenticated concern on domain rows — it does NOT belong in this contract. */
export const MerchantFeatureFlagsResponse = z
  .object({
    restaurantsEnabled: z.boolean(),
    merchantDispatchAutoEnabled: z.boolean(),
    merchantWalletEnabled: z.boolean(),
  })
  .strict();
export type MerchantFeatureFlagsResponse = z.infer<typeof MerchantFeatureFlagsResponse>;

/** `GET /app/service-flags` — the Shops and Pharmacy kill switches (browse-v2 README §7,
 *  `SHOPS_ENABLED` / `PHARMACY_ENABLED`). Its own endpoint, not two more keys on
 *  `MerchantFeatureFlagsResponse`: that body is strict, so an added key would fail every installed
 *  client's parse and drop all of their flags to defaults (the rider food board among them). */
export const ServiceFlagsResponse = z.object({ shopsEnabled: z.boolean(), pharmacyEnabled: z.boolean() }).strict();
export type ServiceFlagsResponse = z.infer<typeof ServiceFlagsResponse>;

/** `GET /app/order-flags` — Order flow v2's switches (ledger D-59): `rxEnabled` is the prescription
 *  flag (BRIEF §13, env `RX_ENABLED`, default off). Its own body, not a key on `ServiceFlagsResponse`:
 *  that body is strict and installed apps parse it strictly, so a third key would fail their parse and
 *  drop them to their defaults. Deliberately NOT strict, so a later switch is an additive key here. */
export const OrderFlagsResponse = z.object({
  rxEnabled: z.boolean(),
  /** Own bikers T9: Preferred riders is retired, so this is always true (2026-10-20); installed apps still read it. */
  preferredRetired: z.boolean().optional(),
  /** Own bikers (`FLEET_UI_LIVE`): the `/fleet` routes answer, so the biker app asks `GET /fleet/me`. */
  fleetLive: z.boolean().optional(),
});
export type OrderFlagsResponse = z.infer<typeof OrderFlagsResponse>;
