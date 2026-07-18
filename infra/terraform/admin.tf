# Admin console tier (docs/plans/2026-admin-console-deployment.md) — a second Cloud Run service
# (lynia-admin) in the SAME project/VPC, exposed through the EXISTING external ALB under
# var.admin_domain, with IAP in front. The console holds a privileged admin token, so IAP (Workspace
# SSO + MFA) is the human-auth boundary; the app middleware additionally VERIFIES the IAP JWT.
#
# GATED OFF BY DEFAULT: every resource is behind var.admin_enabled (false), so this file is a
# zero-diff no-op until the founder sets admin_enabled = true and applies. Like prod/staging, the
# Cloud Run SERVICE itself is created by CI (deploy-admin.yml); Terraform provisions the edge (NEG,
# backend + IAP, cert), the runtime SA, and the ADMIN_API_TOKEN secret container.
#
# Ownership split (mirrors the API): deploy-admin.yml owns the Cloud Run service; Terraform owns the
# edge + IAM + secret. The url-map host rule and the cert on the HTTPS proxy live in lb.tf (a url map
# and proxy are single resources), gated on the same var.admin_enabled.

# Project number for the IAP JWT audience string.
data "google_project" "current" {
  project_id = local.project_id
}

# --- Admin runtime SA (least privilege: read ADMIN_API_TOKEN + run; NO Cloud SQL / bucket) ---
resource "google_service_account" "admin_runtime" {
  count        = var.admin_enabled ? 1 : 0
  account_id   = "lynia-run-admin"
  display_name = "Lynia Cloud Run runtime (admin console)"
  project      = local.project_id
}

# CI deployer must be able to set the admin SA on the admin service.
resource "google_service_account_iam_member" "deployer_actas_admin_runtime" {
  count              = var.admin_enabled ? 1 : 0
  service_account_id = google_service_account.admin_runtime[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# --- ADMIN_API_TOKEN secret container (value added by the founder — it's an admin JWT signed with the
# API's JWT_SIGNING_SECRET, which Terraform can't mint; same hand-populated pattern as vendor keys). ---
resource "google_secret_manager_secret" "admin_api_token" {
  count     = var.admin_enabled ? 1 : 0
  secret_id = "ADMIN_API_TOKEN"
  project   = local.project_id
  labels    = merge(var.labels, { tier = "admin" })

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "admin_runtime_token_access" {
  count     = var.admin_enabled ? 1 : 0
  secret_id = google_secret_manager_secret.admin_api_token[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.admin_runtime[0].email}"
}

# --- LB exposure: admin NEG + backend (with IAP); host rule + cert attach live in lb.tf ---
resource "google_compute_region_network_endpoint_group" "admin" {
  count                 = var.admin_enabled ? 1 : 0
  name                  = "lynia-admin-neg"
  region                = var.region
  project               = local.project_id
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.admin_cloud_run_service
  }

  depends_on = [google_project_service.apis]
}

resource "google_compute_backend_service" "admin" {
  count                 = var.admin_enabled ? 1 : 0
  name                  = "lynia-admin-backend"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  # Same Cloud Armor perimeter as the API edge.
  security_policy = google_compute_security_policy.api.id

  # IAP is the human-auth boundary for the console. The OAuth client is founder-created (Phase 5);
  # its id/secret are supplied as sensitive vars. This is the piece the API backend does NOT have.
  iap {
    enabled              = true
    oauth2_client_id     = var.admin_iap_oauth_client_id
    oauth2_client_secret = var.admin_iap_oauth_client_secret
  }

  backend {
    group = google_compute_region_network_endpoint_group.admin[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Operators allowed through IAP. Founder populates var.admin_iap_members with Workspace identities
# (e.g. "user:alice@corp.com", "group:ops@corp.com"). MFA is enforced at the Workspace level.
resource "google_iap_web_backend_service_iam_member" "admin_operators" {
  for_each            = var.admin_enabled ? toset(var.admin_iap_members) : toset([])
  project             = local.project_id
  web_backend_service = google_compute_backend_service.admin[0].name
  role                = "roles/iap.httpsResourceAccessor"
  member              = each.value
}

# Separate managed cert (attached alongside prod's on the HTTPS proxy in lb.tf) — adding the admin
# domain to the EXISTING prod cert would force-replace it and churn prod TLS.
resource "google_compute_managed_ssl_certificate" "admin" {
  count   = var.admin_enabled ? 1 : 0
  name    = "lynia-admin-cert"
  project = local.project_id

  managed {
    domains = [var.admin_domain]
  }
}

# --- Arming outputs ---
output "ADMIN_CLOUD_RUN_SERVICE" {
  value = var.admin_enabled ? var.admin_cloud_run_service : null
}

output "ADMIN_CLOUD_RUN_SERVICE_ACCOUNT" {
  description = "Set as the ADMIN_CLOUD_RUN_SERVICE_ACCOUNT repo Variable (deploy-admin.yml --service-account)."
  value       = var.admin_enabled ? google_service_account.admin_runtime[0].email : null
}

output "ADMIN_CONSOLE_IAP_AUDIENCE" {
  description = "Set as the ADMIN_CONSOLE_IAP_AUDIENCE repo Variable — the middleware verifies the IAP JWT against this."
  value       = var.admin_enabled ? "/projects/${data.google_project.current.number}/global/backendServices/${google_compute_backend_service.admin[0].generated_id}" : null
}

output "admin_endpoint" {
  description = "Point a DNS A record for admin_domain at the SAME load_balancer_ip as prod."
  value       = var.admin_enabled ? "https://${var.admin_domain}" : null
}
