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

  versioning {
    enabled = true
  }

  # Needed for browser-based signed-URL PUT/GET (admin web). Native uploads are
  # unaffected. Tighten bucket_cors_origins to real origins before launch.
  cors {
    origin          = var.bucket_cors_origins
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-MD5"]
    max_age_seconds = 3600
  }
}
