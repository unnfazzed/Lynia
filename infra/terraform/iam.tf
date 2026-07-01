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

# Send FCM pushes from Cloud Run via ADC (the attached runtime SA, no key) — the firebase-admin
# messaging path in fcm.push.ts (A4). Scoped to the messaging admin role on the project.
resource "google_project_iam_member" "runtime_fcm" {
  project = local.project_id
  role    = "roles/firebasecloudmessaging.admin"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

# Observability: the OTel Collector sidecar runs under the runtime SA and exports OTLP telemetry
# to Google via ADC — metrics to Cloud Monitoring (Managed Service for Prometheus ingest) and spans
# to Cloud Trace. Both grants are additive and only take effect once the sidecar is deployed
# (docs/OBSERVABILITY.md → "Production activation").
resource "google_project_iam_member" "runtime_monitoring_writer" {
  project = local.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_project_iam_member" "runtime_trace_agent" {
  project = local.project_id
  role    = "roles/cloudtrace.agent"
  member  = "serviceAccount:${google_service_account.runtime.email}"
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
