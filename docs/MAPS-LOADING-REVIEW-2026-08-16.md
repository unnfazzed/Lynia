# Maps loading on /send — review and way forward (2026-08-16)

**Report.** The owner signed in to the installed internal-track build (v0.36.1, EAS build
`ccc99fd5`, submitted to the `internal` track earlier the same day), tapped **Send parcel**, and the
map did not load — *"and prevented entering addresses."*

That second clause is the finding. A map that fails to draw is a provisioning problem. A map that
fails to draw and takes the whole flow down with it is a product problem, and it is the one this
review fixes, because it is the only half that can be repaired without another store build.

---

## 1. Why a blank map stops the flow completely

`app/send.tsx` gates the Broadcast button on `coordsOk` — a lat/lng for **both** waypoints
(`send.tsx:352`, feeding `canSubmit` at `:384`). Nothing else counts. There were exactly three
producers of a `PickedPoint`:

| Producer | Needs | Sets |
|---|---|---|
| Tap / drag on the compose map (`ComposeMap`) | a working native Google map | the active slot |
| "Use my location" pill (`ComposeMap`) | GPS + permission | the **active slot only** |
| Address search (`AddressSearch`) | `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | the active slot |

The landmark fields under "Add details" are contract-required text (`Waypoint.landmark`) and produce
no coordinate at all.

So on a build where the Places key is absent **and** the map's tiles never render, the drop-off point
cannot be set by any means available on the screen. `canSubmit` can never become true. That is not a
degraded flow, it is a closed one — exactly what was reported.

The Places key being absent is not hypothetical: the 2026-08-05 device audit
(`docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` §2.0) confirmed `placesEnabled() === false` on the
installed build, and nothing in the repo has provisioned it since —
`.github/workflows/mobile-ota.yml` passes it from a GitHub secret, `eas.json`'s build profiles carry
no `env` block, and until this change nothing asserted the EAS-side variable existed.

## 2. The failure was invisible to the app, and to us

Three separate reasons the app said nothing useful:

**2.1 The fallback watched the wrong signal.** `ComposeMap` decided "the map didn't load" by timing
out on `onMapReady`. The Android Maps SDK fires `onMapReady` as soon as it has a `GoogleMap`
object — **including when it has just rejected the API key** and will never draw a tile. An
authorization failure therefore produced a blank grey canvas with the card suppressed, under a
"Tap the map to drop your pickup pin" hint that did nothing when tapped. `onMapLoaded` ("finished
rendering all tiles", Android-supported in react-native-maps 1.18) is the signal that distinguishes
the two states, and it is what the card keys on now.

**2.2 The fallback copy pointed nowhere.** When the card did appear, `mapFallbackHint` ended with
`type your landmark under "Add details" and we'll use that`. A landmark never satisfies `coordsOk`.
On the build where the card actually shows — no Places key, no tiles — that sentence was the only
instruction on screen and it was false.

**2.3 There was no retry and no telemetry.** A transient tile or auth failure was permanent for the
life of the screen, and a blank map produced no event anywhere — the previous occurrence of this
class (`MOB-BOOT-01`) had to be diagnosed from a photograph.

## 3. Why the map itself probably failed

Not determinable from the repo — it is GCP/device state. In likelihood order, all checkable in
minutes:

1. **Play App Signing SHA-1 mismatch.** `docs/SECURITY-OPS.md` §B restricts the Maps key to package
   name + SHA-1. Google Play **re-signs** the uploaded AAB with the *app signing* certificate, whose
   SHA-1 differs from the EAS-managed *upload* keystore's. A key allowlisted only for the upload
   certificate works in a sideloaded APK and fails in every Play-installed build. This fits the
   evidence better than anything else: tiles rendered in the 2026-08-05 audit and do not now.
   **Check:** Play Console → Test and release → Setup → App integrity → *App signing key certificate*
   SHA-1, and confirm that exact fingerprint is on the key's Android restrictions list alongside
   `zw.co.lynia`.
2. **Maps SDK for Android disabled, or billing lapsed** on the GCP project. A Maps Platform key with
   no active billing account returns authorization failures and blank tiles.
3. **The key never reached the manifest for this build.** The Secret-vs-Sensitive visibility class of
   failure (`docs/PLAY-STORE-SUBMISSION.md`, 2026-08-04). Believed fixed, but the run-#21 ledger entry
   records that `eas build:list --json` returned null `channel`/`runtimeVersion` for every build in
   that window, so this run verified less than previous ones did.

**One-line confirmation, from the handset:** `adb logcat | grep -i "Google Maps Android API"` while
opening /send. An `Authorization failure` / `API Key not found` line names cause 1 or 3; silence with
blank tiles points at 2. The app now also reports the failure to Sentry as
`compose-map-not-loaded (onMapReady=…)`, so the next occurrence arrives with a device and a version
attached.

## 4. What can and cannot be fixed over the air

This split decides the whole plan, and it was previously obscured by one line of config.

- **The Maps key is native.** It is written into the merged Android manifest by
  `android.config.googleMaps.apiKey`. It is not in the JS bundle, and expo-updates matches bundles to
  binaries by a fingerprint the key itself is part of. **No OTA can repair a mapless binary** — that
  needs a new store build (`REL-01`).
- **The Places key is JS.** `EXPO_PUBLIC_*` values are Metro build-time string substitutions. It is
  shippable to an already-installed binary by `mobile-ota.yml`… *except* that `app.config.ts` also
  mirrored it into `extra.googlePlacesKey` as a "parity fallback". `@expo/fingerprint` hashes the
  whole resolved `extra` section — `fingerprint.config.js` skips only `ExpoConfigVersions` — so the
  key was a **fingerprint input**. An OTA exported with it set would have computed a runtimeVersion no
  installed binary had, and expo-updates ignores a non-matching update silently: zero devices, exit
  code 0, an update visible in the Expo console. The one key that could rescue an installed build was
  the one the config had made undeliverable.

That mirror is now removed, which is what makes step 5.1 below possible. Because the env var was
unset when v0.36.1 was built, `extra.googlePlacesKey` was `undefined` and dropped from the serialized
config — so **removing it leaves the resolved config, and therefore the fingerprint, unchanged**, and
an OTA still matches the installed binary. (If the EAS environment turns out to have the key set
after all, that no longer holds and the repair is a build, not an OTA; `mobile-ota.yml`'s
runtime-mismatch preflight will say so rather than publishing into the void.)

---

## 5. The way forward

### 5.1 Now — OTA the JS half to the installed build

Everything in §6 is JS. With `EXPO_PUBLIC_GOOGLE_PLACES_KEY` set as a GitHub secret, dispatch
`mobile-ota.yml` with **branch `preview`** (the only channel any binary was built on — `REL-02`) and
`allow_runtime_mismatch` left **off**, so the preflight aborts rather than publishing to nobody.
After that, the installed v0.36.1 can complete a send even with the map still blank: the address field
resolves, the failure card explains itself, and Retry is there for a transient failure.

### 5.2 Then — fix the key and ship a binary

Work §3 top-down, then dispatch `mobile-release.yml` with `profile: preview`. `app.config.ts` now
**refuses to build** a `preview`/`production` profile with `GOOGLE_MAPS_API_KEY` unset — the check runs
at config resolution on the EAS worker, so a mis-provisioned dispatch costs an error message instead of
one of a limited monthly build allowance plus a release with the flow's primary input dead.

### 5.3 Verify on the handset, not in CI

`docs/QA-DEVICE-CHECKLIST.md`: open /send and confirm Google tiles for Harare with the Google
attribution baked into the tile surface. Tiles are the only proof the key is accepted — a rendered
map frame is not.

---

## 6. What changed in this PR (all JS, all OTA-deliverable)

| Change | File |
|---|---|
| Failure detection moved from `onMapReady` to `onMapLoaded`, so an authorization failure is actually caught | `src/ui/ComposeMap.tsx` |
| "Retry the map" — remounts the native map; card self-clears if late tiles arrive | `src/ui/ComposeMap.tsx` |
| Failure card adopts the kit's `LJ.map_failed` copy + retry affordance | `src/ui/ComposeMap.tsx` |
| One Sentry report per mount, so a blank map is a diagnosable event | `src/ui/ComposeMap.tsx` |
| Fallback copy no longer promises the landmark field sets a location | `src/logic/map-fallback.ts` |
| **Keyless address→coordinates path** via the device geocoder — needs neither Google key nor a working map | `src/logic/geocode.ts` |
| Unkeyed `AddressSearch` is a LIVE field (device geocoder) instead of a dead explainer | `src/ui/AddressSearch.tsx` |
| `AddressHint` restored to the kit's verbatim copy (search is now always live) | `src/ui/MapHome.tsx` |
| Places key de-mirrored from `extra` — restores OTA deliverability | `app.config.ts`, `src/config.ts` |
| Release build fails fast without `GOOGLE_MAPS_API_KEY`; warns without the Places key | `app.config.ts` |
| `--verify` now checks the Places key on **both** EAS and GitHub, and that they agree | `scripts/eas-arm.sh` |

`LJ.map_failed` stays `PENDING` in `tools/parity/parity-status.mjs`: this adopts the mock's copy and
its retry pill, not the full screen structure — the mock also drops the locate pill in this state, and
here that is the one control still able to set a pin.

### Not done, deliberately

- **Routing Places through the Lynia API.** It would end the client-key restriction problem
  (`SECURITY-OPS` §B: an Android-restricted key returns `REQUEST_DENIED` for these web-service
  endpoints) and remove a key from the bundle entirely. It needs a server endpoint plus its own
  provisioning, and it does not help the phone in the owner's hand today.
- **Anything that would make a landmark substitute for a pin.** The rider navigates to the pin; the
  design's own `addr_unavailable` mock says so in as many words. The fix is to make coordinates
  obtainable, not to make them optional.

### Known limits of the device-geocoder fallback

It is a fallback, not a replacement. No as-you-type predictions (the platform geocoder has none), it
resolves only on submit, coverage for Harare street addresses is patchier than Places, and on Android
it requires foreground location permission before `Geocoder` may be used — refused permission is
reported as such rather than as "not found". Every failure names the map as the way through.
