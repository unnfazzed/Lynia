# Customer-managed encryption keys (CMEK) for the media bucket. Opt-in via var.kyc_cmek_enabled
# (default off). When enabled, the KYC/media bucket is encrypted with a key WE own and rotate, rather
# than Google-managed keys — so we control key lifecycle and can revoke access to the data at the key
# layer. All resources are count-gated so a default apply creates nothing. See docs/SECURITY.md P3-4.

# The GCS service agent that must be granted encrypt/decrypt on the key to write CMEK objects.
data "google_storage_project_service_account" "gcs" {
  count   = var.kyc_cmek_enabled ? 1 : 0
  project = local.project_id
}

resource "google_kms_key_ring" "media" {
  count    = var.kyc_cmek_enabled ? 1 : 0
  name     = "lynia-media-keyring"
  location = var.region
  project  = local.project_id

  depends_on = [google_project_service.apis]
}

resource "google_kms_crypto_key" "media" {
  count           = var.kyc_cmek_enabled ? 1 : 0
  name            = "lynia-media-key"
  key_ring        = google_kms_key_ring.media[0].id
  rotation_period = "7776000s" # 90 days — automatic key rotation

  lifecycle {
    prevent_destroy = false # pilot; set true once real KYC data is stored under this key
  }
}

# The bucket's service agent needs encrypt/decrypt to read+write CMEK-wrapped objects.
resource "google_kms_crypto_key_iam_member" "gcs_media" {
  count         = var.kyc_cmek_enabled ? 1 : 0
  crypto_key_id = google_kms_crypto_key.media[0].id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${data.google_storage_project_service_account.gcs[0].email_address}"
}
