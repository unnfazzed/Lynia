# Everything the founder pastes into the repo's Actions config to arm release.yml,
# plus a single human-readable arming guide. Sensitive outputs are marked so they
# don't print in plan/apply logs — read them with `terraform output -raw <name>`.

# --- Repo Variables (Settings → Secrets and variables → Actions → Variables) ---
output "GCP_PROJECT_ID" {
  value = local.project_id
}

output "GCP_REGION" {
  value = var.region
}

output "GCP_ARTIFACT_REPO" {
  value = google_artifact_registry_repository.api.repository_id
}

output "CLOUD_RUN_SERVICE" {
  value = var.cloud_run_service
}

output "CLOUD_SQL_INSTANCE" {
  description = "Cloud SQL connection name (project:region:instance) for --add-cloudsql-instances + the Auth Proxy."
  value       = google_sql_database_instance.main.connection_name
}

output "VPC_CONNECTOR" {
  description = "Serverless VPC Access connector — wire into release.yml's `gcloud run deploy --vpc-connector` so Cloud Run can reach Redis."
  value       = google_vpc_access_connector.connector.name
}

output "CLOUD_RUN_SERVICE_ACCOUNT" {
  description = "Runtime SA — wire into release.yml's `gcloud run deploy --service-account` so the service runs as lynia-run (not the default compute SA)."
  value       = google_service_account.runtime.email
}

# --- Keyless CI auth (Workload Identity Federation) → repo Variables ---
output "GCP_WORKLOAD_IDENTITY_PROVIDER" {
  description = "Full provider resource name for google-github-actions/auth (workload_identity_provider)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "GCP_SERVICE_ACCOUNT" {
  description = "Deployer SA the workflow impersonates via WIF (service_account)."
  value       = google_service_account.deployer.email
}

# --- Repo Secrets (Settings → Secrets and variables → Actions → Secrets) ---
output "deployer_sa_key" {
  description = "JSON for a legacy GCP_SA_KEY secret. Empty unless emit_deployer_sa_key = true (default false — CI uses WIF). Read with: terraform output -raw deployer_sa_key | base64 -d"
  value       = var.emit_deployer_sa_key ? google_service_account_key.deployer[0].private_key : ""
  sensitive   = true
}

output "MIGRATE_DATABASE_URL" {
  description = "Postgres URL through the Auth Proxy on 127.0.0.1:5432 for `prisma migrate deploy`. Read with: terraform output -raw MIGRATE_DATABASE_URL"
  value = format(
    "postgresql://%s:%s@127.0.0.1:5432/%s?schema=public",
    var.db_user,
    random_password.db.result,
    var.db_name,
  )
  sensitive = true
}

# --- Convenience: a copy-pasteable arming checklist ---
output "arming_guide" {
  description = "What to set where to arm release.yml. Secret values via `terraform output -raw <name>`."
  value       = <<-EOT

    Lynia is provisioned. Arm the release workflow:

    Repo → Settings → Secrets and variables → Actions → Variables:
      GCP_DEPLOY_ENABLED        = true        (the arming switch)
      GCP_PROJECT_ID            = ${local.project_id}
      GCP_REGION                = ${var.region}
      GCP_ARTIFACT_REPO         = ${google_artifact_registry_repository.api.repository_id}
      CLOUD_RUN_SERVICE         = ${var.cloud_run_service}
      CLOUD_SQL_INSTANCE        = ${google_sql_database_instance.main.connection_name}
      VPC_CONNECTOR             = ${google_vpc_access_connector.connector.name}
      CLOUD_RUN_SERVICE_ACCOUNT = ${google_service_account.runtime.email}
      GCP_WORKLOAD_IDENTITY_PROVIDER = ${google_iam_workload_identity_pool_provider.github.name}
      GCP_SERVICE_ACCOUNT       = ${google_service_account.deployer.email}

    Repo → Settings → Secrets and variables → Actions → Secrets:
      MIGRATE_DATABASE_URL = terraform output -raw MIGRATE_DATABASE_URL

    CI auth is keyless (Workload Identity Federation) — no GCP_SA_KEY needed.

    Runtime secrets DATABASE_URL / REDIS_URL / JWT_SIGNING_SECRET are already in
    Secret Manager (injected by --set-secrets). Then push to main → first /ship.
  EOT
}

# --- External HTTPS Load Balancer (lb.tf) ---
output "load_balancer_ip" {
  description = "Static anycast IP of the global external HTTPS load balancer. Create a DNS A record for var.api_domain pointing here; the Google-managed cert provisions once DNS resolves to this IP."
  value       = google_compute_global_address.api.address
}

output "api_endpoint" {
  description = "Stable public HTTPS endpoint for the API (used by mobile device builds). Live once DNS for api_domain points at load_balancer_ip and the managed cert is ACTIVE."
  value       = "https://${var.api_domain}"
}

output "api_managed_certificate" {
  description = "Name and domain(s) of the Google-managed TLS certificate bound to the load balancer. Check status with: gcloud compute ssl-certificates describe <name> --global"
  value = {
    name    = google_compute_managed_ssl_certificate.api.name
    domains = google_compute_managed_ssl_certificate.api.managed[0].domains
  }
}
