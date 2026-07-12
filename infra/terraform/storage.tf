# Object storage: rider KYC selfies + item photos. Uniform access, no public
# objects — every read/write goes through a V4 signed URL the API mints.

resource "google_storage_bucket" "media" {
  name                        = var.bucket_name
  location                    = var.region
  project                     = local.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels

  # CMEK ordering: the encryption block below references the KMS key, but GCS also needs the bucket's
  # service agent to already HOLD encrypt/decrypt on that key (kms.tf) or the write of
  # default_kms_key_name is rejected with a KMS permission error. Terraform infers the key dependency
  # from the .id reference but NOT the IAM grant, so without this the first `kyc_cmek_enabled=true` apply
  # can fail and only succeed on a re-run. Depending on the IAM member makes it deterministic; when CMEK
  # is off the member has count 0 and this is an empty (no-op) dependency.
  depends_on = [google_kms_crypto_key_iam_member.gcs_media]

  versioning {
    enabled = true
  }

  # CMEK: encrypt objects with our own KMS key when enabled (var.kyc_cmek_enabled). Default off leaves
  # Google-managed encryption (still encrypted at rest). Applies to newly-written objects.
  dynamic "encryption" {
    for_each = var.kyc_cmek_enabled ? [1] : []
    content {
      default_kms_key_name = google_kms_crypto_key.media[0].id
    }
  }

  # Optional data-minimization retention (var.kyc_retention_days > 0). On this versioned bucket the age
  # rule archives the live object; the second rule purges the archived version shortly after, so data
  # is fully removed a little after the retention age. Disabled by default.
  dynamic "lifecycle_rule" {
    for_each = var.kyc_retention_days > 0 ? [1] : []
    content {
      condition {
        age        = var.kyc_retention_days
        with_state = "LIVE"
      }
      action {
        type = "Delete"
      }
    }
  }

  dynamic "lifecycle_rule" {
    for_each = var.kyc_retention_days > 0 ? [1] : []
    content {
      condition {
        days_since_noncurrent_time = 7
        with_state                 = "ARCHIVED"
      }
      action {
        type = "Delete"
      }
    }
  }

  # Needed for browser-based signed-URL PUT/GET (admin web). Native uploads are unaffected; defaults to
  # [] (deny cross-origin) — set bucket_cors_origins to real origins only if you do browser uploads.
  cors {
    origin          = var.bucket_cors_origins
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-MD5"]
    max_age_seconds = 3600
  }
}
