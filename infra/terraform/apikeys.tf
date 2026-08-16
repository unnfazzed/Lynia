# Google Maps Platform client API keys — the two keys the mobile app ships.
#
# WHY THIS EXISTS
# These are the last GCP resources the product depends on that were created by
# clicking in the console, and on 2026-08-16 that cost a working send-parcel flow:
# the customer compose map rendered blank on the installed internal-track build,
# which took address entry down with it (MOB-MAP-01/-02, docs/KNOWN_BUGS.md;
# docs/MAPS-LOADING-REVIEW-2026-08-16.md). The restriction rules that prevent it are
# written down in docs/SECURITY-OPS.md §B and were simply not reflected in the
# console. A doc nobody re-reads is not a control; this file is.
#
# THE TWO KEYS TAKE OPPOSITE RESTRICTIONS. THAT IS THE WHOLE POINT.
#
#   maps    GOOGLE_MAPS_API_KEY, Maps *SDK for Android* (react-native-maps).
#           A native SDK call, so it takes an ANDROID application restriction:
#           package name + signing-certificate SHA-1.
#
#   places  EXPO_PUBLIC_GOOGLE_PLACES_KEY, Places *web service* over plain fetch
#           (apps/mobile/src/api/places.ts hits
#           maps.googleapis.com/maps/api/place/{autocomplete,details}/json).
#           Those endpoints honour IP and None restrictions ONLY. An Android
#           restriction here does not tighten anything — it returns REQUEST_DENIED
#           for every call, which apps/mobile/src/logic/places.ts flattens into the
#           same empty list a genuine no-match produces. The symptom is a search box
#           that silently never returns anything. So this key deliberately carries
#           NO application restriction, and is contained by api_targets + a quota cap
#           instead (see QUOTA below).
#
# Getting that backwards is not hypothetical — it is the documented failure mode in
# §B and the reason `AddressSearch` now carries a device-geocoder escape hatch.
#
# THE MAPS SHA-1 IS THE OTHER TRAP. Google Play RE-SIGNS the uploaded AAB with the
# *app signing* certificate, which is NOT the EAS-managed *upload* keystore. A key
# allowlisted for the upload certificate alone renders tiles perfectly in a
# sideloaded QA APK and fails in every Play-installed build — a "worked yesterday"
# regression that only appears after a track upload. List BOTH fingerprints:
#   - app signing: Play Console → Test and release → Setup → App integrity →
#                  "App signing key certificate" SHA-1   (what devices run)
#   - upload:      the EAS-managed keystore's SHA-1       (sideloaded QA APKs)
# There is no API for the first one; it is read from the Play Console by hand and
# pasted into a tfvars. That is the single manual step this file cannot remove.
#
# ENABLEMENT — OFF BY DEFAULT, AND YOU MUST IMPORT BEFORE YOU APPLY.
# Gated by var.maps_api_keys_enabled (default false), mirroring cloudflare_dns_enabled:
# with the flag off every resource here has count = 0, so a plain apply is a no-op and
# the existing hand-made keys are untouched.
#
# Both keys ALREADY EXIST. Applying with the flag on and no import creates a SECOND
# pair with new key strings, leaves the originals unmanaged, and ships nothing —
# the app reads the old values from EAS.
#
# ⚠️ `name` IS THE KEY'S IMMUTABLE ID, NOT A LABEL. In the API Keys v2 resource
# `projects/<n>/locations/global/keys/<KEY_ID>`, Terraform's `name` is KEY_ID. The API's
# patch method can only modify display_name, restrictions and annotations — never the id
# — so `name` is ForceNew. Importing a console-created key (whose KEY_ID is a
# server-generated UUID) into a config that hardcodes a pretty id would therefore plan a
# DESTROY + CREATE: the live key deleted, a new one minted with a new key string, and the
# app — which reads the old value from EAS — broken. That is the exact outcome this file
# exists to prevent, so the ids are REQUIRED INPUTS (maps_api_key_id / places_api_key_id)
# with no defaults, and both resources carry prevent_destroy.
#
# Note `uid` is a DIFFERENT field: an output-only UUID4 that the import path does not
# accept. List `name` and take its final component.
#
#   gcloud services api-keys list --project <project> --format='table(name,displayName)'
#   # -> projects/123456789/locations/global/keys/<KEY_ID>   "Maps SDK ..."
#
#   # set maps_api_key_id / places_api_key_id to those KEY_ID values FIRST, then:
#   terraform import 'google_apikeys_key.maps[0]'   projects/<project>/locations/global/keys/<KEY_ID>
#   terraform import 'google_apikeys_key.places[0]' projects/<project>/locations/global/keys/<KEY_ID>
#   terraform plan    # the diff IS the fix — read it before applying
#
# The plan after import is the review artefact. It should show ONLY in-place restriction
# (and possibly display_name) changes. If it proposes creating, destroying or replacing a
# key, stop — the id does not match, and prevent_destroy will refuse the apply anyway.
#
# DISARMING AFTER IMPORT IS NOT "SET THE FLAG BACK TO FALSE". Once the keys are in state,
# count = 0 means destroy, i.e. deleting the live keys. Use `terraform state rm` to hand
# them back to manual management. prevent_destroy turns the mistake into an error rather
# than an outage.
#
# QUOTA (§B step 3) IS NOT MANAGED HERE — deliberately. A client-side key is public by
# construction (it ships inside the app), so the cap is what bounds the bill on a
# leaked key, and it matters most for `places`, which has no application restriction at
# all. It belongs in google_service_usage_consumer_quota_override, but the metric and
# limit identifiers for the legacy Places web service are not verifiable from this repo,
# and a wrong one fails the apply for the whole module. Set it by hand — GCP console →
# APIs & Services → the API → Quotas — and replace this block with the real resource
# once the identifiers are confirmed against the live project.

locals {
  # api_targets pins each key to the ONE service it is allowed to call, so a leaked key
  # cannot be spent against any other Maps Platform product. These are the service names
  # the API Keys API expects, which are NOT the endpoint hostnames the client calls.
  maps_android_service = "maps-android-backend.googleapis.com"
  places_service       = "places-backend.googleapis.com"
}

# The API Keys API itself, plus the two services the keys target. Kept inside the gate
# (rather than in project.tf's always-on list) so a disabled flag really is a zero diff —
# nothing here is enabled for anyone who has not opted in.
resource "google_project_service" "apikeys" {
  for_each = var.maps_api_keys_enabled ? toset([
    "apikeys.googleapis.com", # required to manage google_apikeys_key at all
    local.maps_android_service,
    local.places_service,
  ]) : toset([])

  project            = local.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- Maps SDK for Android (GOOGLE_MAPS_API_KEY) ---
# Native SDK ⇒ Android application restriction. Both certificate fingerprints are
# listed against the one package; see the SHA-1 trap in the header.
resource "google_apikeys_key" "maps" {
  count = var.maps_api_keys_enabled ? 1 : 0

  project      = local.project_id
  name         = var.maps_api_key_id
  display_name = "LyniaGo — Maps SDK for Android"

  restrictions {
    android_key_restrictions {
      dynamic "allowed_applications" {
        for_each = toset(var.android_cert_sha1_fingerprints)
        content {
          package_name     = var.android_package_name
          sha1_fingerprint = allowed_applications.value
        }
      }
    }

    api_targets {
      service = local.maps_android_service
    }
  }

  depends_on = [google_project_service.apikeys]

  lifecycle {
    # `name` is ForceNew and this key is live: a plan that destroys it takes the map down
    # for every user and mints a key string nothing has. Refuse rather than proceed.
    prevent_destroy = true

    # An android_key_restrictions block with zero allowed_applications is a key nothing
    # may use — i.e. the blank map this file exists to prevent, applied deliberately.
    # Fail at plan time with the reason rather than shipping it.
    precondition {
      condition     = length(var.android_cert_sha1_fingerprints) > 0
      error_message = "maps_api_keys_enabled is on but android_cert_sha1_fingerprints is empty. Restricting the Maps SDK key to no certificate blanks the map for everyone. Supply at least the Play app-signing SHA-1 (Play Console → Test and release → Setup → App integrity)."
    }

    precondition {
      condition     = length(trimspace(var.maps_api_key_id)) > 0
      error_message = "maps_api_keys_enabled is on but maps_api_key_id is empty. It must be the EXISTING key's id — the final component of `gcloud services api-keys list --format='table(name)'` — because `name` is ForceNew: a mismatch plans a destroy+create of the live Maps key. See the header of apikeys.tf."
    }
  }
}

# --- Places web service (EXPO_PUBLIC_GOOGLE_PLACES_KEY) ---
# NO application restriction, on purpose — see the header. `restrictions` carries the
# api_targets block only, which is the containment §B actually calls for on this key.
resource "google_apikeys_key" "places" {
  count = var.maps_api_keys_enabled ? 1 : 0

  project      = local.project_id
  name         = var.places_api_key_id
  display_name = "LyniaGo — Places API (web service)"

  restrictions {
    api_targets {
      service = local.places_service
    }
  }

  depends_on = [google_project_service.apikeys]

  lifecycle {
    # Same reasoning as `maps` above: live key, ForceNew id.
    prevent_destroy = true

    precondition {
      condition     = length(trimspace(var.places_api_key_id)) > 0
      error_message = "maps_api_keys_enabled is on but places_api_key_id is empty. It must be the EXISTING key's id — the final component of `gcloud services api-keys list --format='table(name)'` — because `name` is ForceNew: a mismatch plans a destroy+create of the live Places key. See the header of apikeys.tf."
    }
  }
}
