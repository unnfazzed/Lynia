# Two service accounts, least-privilege:
#   * runtime  — Cloud Run's identity at request time.
#   * deployer — the CI identity the release workflow authenticates as.

# --- Runtime SA (Cloud Run service identity) ---
resource "google_service_account" "runtime" {
  account_id   = "lynia-run"
  display_name = "Lynia Cloud Run runtime"
  project      = local.project_id
}

# Connect to Cloud SQL via the Auth Proxy unix socket.
resource "google_project_iam_member" "runtime_sql_client" {
  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Object read/write, scoped to the media bucket only (not project-wide storage).
resource "google_storage_bucket_iam_member" "runtime_bucket" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.runtime.email}"
}

# Mint V4 signed URLs from Cloud Run with NO exported private key: the SA signs
# blobs for itself via the IAM Credentials signBlob API (ADC path used by
# gcs.storage.ts). This self-grant is what makes keyless V4 signing work.
resource "google_service_account_iam_member" "runtime_sign_self" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.runtime.email}"
}

# Per-secret accessor (tighter than a project-wide grant). Defined in secrets.tf
# via google_secret_manager_secret_iam_member.

# --- Deployer SA (CI / release.yml) ---
resource "google_service_account" "deployer" {
  account_id   = "lynia-deployer"
  display_name = "Lynia CI deployer"
  project      = local.project_id
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset([
    "roles/run.admin",                 # deploy the Cloud Run service
    "roles/artifactregistry.writer",   # push the image
    "roles/cloudsql.client",           # Auth Proxy for `prisma migrate deploy`
  ])
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# `gcloud run deploy` must actAs the runtime SA it sets on the service.
resource "google_service_account_iam_member" "deployer_actas_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Optional JSON key for GCP_SA_KEY. Lands in TF state — prefer WIF (see README)
# and set emit_deployer_sa_key = false once WIF is wired.
resource "google_service_account_key" "deployer" {
  count              = var.emit_deployer_sa_key ? 1 : 0
  service_account_id = google_service_account.deployer.name
}
