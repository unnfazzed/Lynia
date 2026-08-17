# MOB-MAP-02 — the Android map is blank on the installed build

**Status: OPEN, ops-side.** The fix is a GCP console change; no code change or OTA can reach it (the
Maps key is written into the native manifest, and expo-updates matches bundles to binaries by a
fingerprint the key is part of — `REL-01`).

This runbook exists because every previously written verification step for this bug ended in
`adb logcat | grep "Google Maps Android API"` — a USB cable and a terminal. The owner of this repo
codes from a phone, so the one person holding the broken handset could never run the check. **Step 1
replaces it with something a phone can do.**

---

## What the evidence already rules in and out

Three causes were listed in `docs/MAPS-LOADING-REVIEW-2026-08-16.md` §3. Two facts found on 2026-08-17
(`docs/SENTRY-TRIAGE-2026-08-17.md`) change that ranking materially — read this before spending time on
the wrong one.

**❌ ELIMINATED — "the key never reached the manifest" (was candidate 3).** `apps/mobile/app.config.ts`
now *throws* at config resolution on the EAS worker when `GOOGLE_MAPS_API_KEY` is unset for a
`preview`/`production` profile. That guard is present in **v0.37.0 and v0.38.0** (absent in v0.36.1),
and v0.38.0 **built and submitted successfully** on 2026-08-17 (EAS build `333ebcda` FINISHED →
submission `fed0f9d3` FINISHED, track `internal`, `docs/PLAY-STORE-SUBMISSION.md`). A build that
finished is a build whose key was present. **The key IS in the EAS `preview` environment.**

**⚠️ RE-FRAMED — "the Play app-signing SHA-1 was never listed" (was candidate 1, ranked most likely).**
This cannot be the whole story as originally written. The 2026-08-05 device audit
(`docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` §2.0) records a **photograph of the installed Android
build showing Google tiles for Harare rendering, with the Google attribution baked into the tile
surface** — and the Play internal track had been live since 2026-08-04 ~10:00 UTC. If the app-signing
certificate had never been on the allowlist, that build would have been blank too.

So the question is not "was the SHA-1 ever added" but **"what changed between 2026-08-05 and
2026-08-16"**. The most likely answer is that the `SECURITY-OPS.md` §B restriction hardening was applied
to the key in that window and listed only the **upload** keystore's SHA-1, or an API restriction was
added that excludes the Maps SDK for Android. That still lands on the same console page — but it means
you are looking for a *recent edit*, not an *omission*, and GCP shows you the key's edit history.

**Still live — billing / API enablement (was candidate 2).** Unchanged, and step 1 tests it directly.

---

## Step 1 — Get the answer without a cable (2 minutes, from your phone)

1. Get the **Play app-signing SHA-1**. This is the certificate installed builds actually run under.
   (The EAS upload keystore is a *different* certificate; allowlisting only that one is the documented
   re-signing trap in `docs/SECURITY-OPS.md` §B.)

   > **Can't find it?** Two things trip this up. The Play Console **mobile app does not have this page
   > at all** — App integrity is web-only, so open `play.google.com/console` in a browser. And the left
   > nav has been reshuffled repeatedly: "Setup" is a collapsible group under *Test and release*, and in
   > some accounts App integrity now sits directly under *Test and release* with no "Setup" level.
   > **Use the search box at the top of Play Console and type "app signing"** — it jumps straight there
   > regardless of the menu layout. Then: *App signing* tab → **App signing key certificate** → SHA-1.

   **Or skip Play Console entirely for a first pass.** `expo.dev → project → Credentials → Android`
   shows the EAS-managed **upload** keystore's SHA-1 in a browser. That is not the app-signing cert, but
   probing with it is still decisive: `OK` means the upload cert is allowlisted while Play-installed
   builds are blank — the re-signing trap, so you then need the Play value; `ANDROID_RESTRICTION_REJECTED`
   means not even the upload cert is on the allowlist, which you can fix without the Play value at all.
2. GitHub → **Actions → "Maps Key Doctor" → Run workflow**, paste the SHA-1 into `sha1`, run it.
3. Read the job log. It probes the real key against Google and names the cause:

| Verdict | What it means | What to do |
|---|---|---|
| `ANDROID_RESTRICTION_REJECTED` | **This is MOB-MAP-02 confirmed.** That certificate is not on the key's allowlist. | Step 2 |
| `BILLING` | Billing is off or lapsed on the project. | GCP → Billing. Nothing else will work until this is fixed. |
| `INVALID_KEY` | Google does not recognise the key — it was deleted or regenerated and EAS still holds the old string. | Re-create in EAS (Sensitive visibility) **and ship a new binary** — no OTA can carry it. |
| `API_NOT_ACTIVATED` | Key valid, billing active, but this API isn't enabled **on the project**. | **This is what the 2026-08-17 run returned.** See §1.5 below. |
| `API_RESTRICTED` | Key valid, billing active, but the **key's own** API restriction forbids the call. | Healthy if the key is correctly restricted to `maps-android-backend.googleapis.com`; verify the Android allowlist by eye in the console. |
| `OK` | The certificate **is** allowlisted, key alive, billing active. | The remaining cause is the *Maps SDK for Android* service being disabled: GCP → APIs & Services → Enabled APIs. |

> The probe reaches the Maps **web service**, which enforces the same key object — same application
> restriction, same billing and enablement state — as the SDK. It cannot reach the Maps SDK for Android
> itself, so it never claims to have tested that service. The script says which question it answered.

## Step 1.5 — What the 2026-08-17 run actually found

The doctor was run against the **EAS `preview`** key (the one `mobile-release.yml` builds the Play
binary with) using the EAS-managed upload keystore's SHA-1. Result:

```
key     : present, well-formed (never printed)
AS THE APP (X-Android-Package + X-Android-Cert) -> HTTP 403
  raw: The Google Maps Platform server rejected your request. This API is not activated on your
       API project. You may need to enable this API in the Google Cloud Console: ...
```

**Established:**

- ✅ The EAS key is **well-formed and valid** — not truncated, not stale, not regenerated. An invalid
  key returns "The provided API key is invalid"; this is a different message.
- ✅ **Billing is active** on the project. A lapsed billing account returns a billing-specific message.
  That retires candidate 2.
- ❌ The Android **allowlist question is still unanswered** — Google evaluates API activation *before*
  the application restriction, so the probe never reached it. Re-running with a different fingerprint
  will return the same thing; don't bother.

**The live hypothesis is now the one nobody had ranked first: `Maps SDK for Android` may not be enabled
on the GCP project.** The probe calls the static-maps service, which this project has no reason to
enable, so that refusal is expected in itself — but it proves the project has only a *narrow* set of
Maps APIs turned on, and nothing in this repo has ever guaranteed the Android SDK is among them:
`infra/terraform/apikeys.tf` would enable `maps-android-backend.googleapis.com`, and it is gated off and
was never imported.

**Next check, one screen:** GCP → **APIs & Services → Enabled APIs & services** → is **Maps SDK for
Android** listed? If not, enable it — that is the blank map, and it needs no new build.

> Separately, the **GitHub Actions** secret `GOOGLE_MAPS_API_KEY` (used only by `android-test-apk.yml`
> for sideloaded QA APKs — a different store from the EAS variable) probes as `INVALID_KEY` and does not
> even match the `AIza` + 35-character shape. That does not affect the Play build, but the QA-APK lane
> would ship a mapless APK today. Re-run the doctor with `key_source: github` after fixing it.

## Step 2 — Fix the allowlist

GCP → **APIs & Services → Credentials** → the Maps SDK key → **Application restrictions → Android apps**.
List **both** fingerprints against `zw.co.lynia`:

- the Play **app signing** certificate SHA-1 (from step 1) — what installed builds run under;
- the EAS-managed **upload** keystore SHA-1 — so sideloaded QA APKs keep working.

Under **API restrictions**, the key must be allowed to call **Maps SDK for Android**
(`maps-android-backend.googleapis.com`).

Changes propagate within about 5 minutes. **No new build is required** — the key string in the installed
binary is unchanged; only its server-side permissions were wrong.

## Step 3 — Confirm

Re-run **Maps Key Doctor** with the same SHA-1 and expect `OK` (or `API_RESTRICTED`, which is the
healthy answer for a correctly API-restricted key). Then open `/send` on the handset and confirm
Google tiles for Harare with the attribution baked into the tile surface — tiles are the only proof the
key is accepted; a rendered map *frame* is not.

The app also reports itself now: a still-blank map sends `compose-map-not-loaded` to Sentry tagged
`map_load_signal=onMapLoaded` (`docs/SENTRY-TRIAGE-2026-08-17.md`). No event after a successful send
means the map is drawing.

## Step 4 — Make it stick

`infra/terraform/apikeys.tf` already encodes exactly the restrictions above, including listing both
fingerprints — it is gated off (`maps_api_keys_enabled = false`) and was never imported. Arming it turns
this from a console state that can silently drift into a reviewable plan diff. It needs three values you
now have or can read once:

- `maps_api_key_id` / `places_api_key_id` — `gcloud services api-keys list --format='table(name,displayName)'`,
  taking the **final component of `name`** (not `uid`);
- `android_cert_sha1_fingerprints` — both SHA-1s, colon-separated uppercase.

**Import before applying.** Both keys already exist; applying without an import creates a second pair
with new key strings, leaves the originals unmanaged, and reaches no device. Read the header of
`apikeys.tf` first — it has the exact commands and the reason `name` is ForceNew.

---

## Why this cannot be fixed in the app

The Maps key is written into the merged Android manifest by `android.config.googleMaps.apiKey`. It is
not in the JS bundle, and `@expo/fingerprint` makes it part of the runtimeVersion, so an OTA carrying a
different key would compute a version no installed binary has and reach zero devices (`REL-01`,
`REL-02`). What the app *can* do — and now does — is fail honestly instead of silently: `/send` keeps a
working address path via Places or the device geocoder, shows the `LJ.map_failed` card with a retry, and
reports the failure to Sentry with the tags that distinguish this bug from a false alarm.
