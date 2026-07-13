# OTel collector prerequisites — the Terraform-owned half of observability activation.
#
# The collector runs as a SIDECAR of the lynia-api Cloud Run service, and Cloud Run revisions are
# deployed by CI (release.yml), not Terraform — so the sidecar container itself is deliberately NOT
# a Terraform resource (Terraform managing the service would fight every CI deploy over the image).
# What IS Terraform's to own is the config the sidecar mounts: the `otel-collector-config` secret,
# populated straight from infra/otel-collector/config.yaml so pipeline changes ship via plan/apply
# instead of hand-run `gcloud secrets versions add`. release.yml deploys the sidecar explicitly when
# the OTEL_SIDECAR_ENABLED repo Variable is true (docs/OBSERVABILITY.md → Production activation).
#
# The dashboard (infra/otel-collector/dashboard.json) stays a manual one-time import by design —
# presentation, not correctness (see its header).

resource "google_secret_manager_secret" "otel_collector_config" {
  secret_id = "otel-collector-config"
  project   = local.project_id
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "otel_collector_config" {
  secret      = google_secret_manager_secret.otel_collector_config.id
  secret_data = file("${path.module}/../otel-collector/config.yaml")
}

# The runtime SA mounts the config file at /etc/otelcol/config.yaml (release.yml --set-secrets).
resource "google_secret_manager_secret_iam_member" "otel_collector_config_runtime" {
  project   = local.project_id
  secret_id = google_secret_manager_secret.otel_collector_config.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
