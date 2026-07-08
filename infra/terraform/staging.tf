# Staging stack (LR11 prerequisite; docs/LAUNCH-DEPLOYMENT-STRATEGY.md §2d) — a second, small
# Cloud Run tier in the SAME project/VPC: its own Cloud SQL + Redis + secrets + runtime SA +
# media bucket, exposed through the EXISTING external ALB under var.staging_api_domain. Load
# tests and pre-prod smoke run HERE, never against the live pilot service.
#
# GATED OFF BY DEFAULT: every resource is behind var.staging_enabled (false), so this file is a
# zero-diff no-op until the founder sets staging_enabled = true in terraform.tfvars and applies.
# The staging Cloud Run SERVICE itself is (like prod) created by CI — deploy-staging.yml runs
# `gcloud run deploy lynia-api-staging` — Terraform only provisions what the service needs.
#
# Deliberately SEPARATE from prod (not shared): DB, Redis, secrets, bucket, and runtime SA —
# so a staging compromise or a k6 run can never touch prod data or read prod credentials. The
# staging SA gets accessor on *_STAGING secrets only. Deliberately SHARED with prod: the VPC +
# connector (egress path only), the ALB/Armor edge, and the Artifact Registry image (staging
# deploys the same image prod will promote — that is the point of staging).
#
# Sized for a pilot-budget: shared-core SQL (db-f1-micro), no PITR/backups (staging data is
# disposable — deletion_protection off, force_destroy on), BASIC 1 GB Redis.

# --- Cloud SQL (staging) ---
resource "google_sql_database_instance" "staging" {
  count               = var.staging_enabled ? 1 : 0
  name                = "lynia-pg-staging"
  database_version    = var.db_version
  region              = var.region
  project             = local.project_id
  deletion_protection = false # staging is disposable by design

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    edition           = "ENTERPRISE"
    tier              = var.staging_db_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    user_labels       = merge(var.labels, { tier = "staging" })

    ip_configuration {
      # Same migration posture as prod: public IP only for the CI Auth Proxy path, flipped off
      # together with prod when the DB_PRIVATE_ONLY hardening lands (LR7).
      ipv4_enabled                                  = var.db_public_ip_enabled
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled = false # nothing on staging is worth restoring
    }
  }
}

resource "google_sql_database" "staging_app" {
  count    = var.staging_enabled ? 1 : 0
  name     = var.db_name
  instance = google_sql_database_instance.staging[0].name
  project  = local.project_id
}

resource "random_password" "staging_db" {
  count            = var.staging_enabled ? 1 : 0
  length           = 32
  special          = true
  override_special = "-_" # URL-safe, same constraint as prod (sql.tf)
}

resource "google_sql_user" "staging_app" {
  count    = var.staging_enabled ? 1 : 0
  name     = var.db_user
  instance = google_sql_database_instance.staging[0].name
  password = random_password.staging_db[0].result
  project  = local.project_id
}

# --- Memorystore Redis (staging) ---
resource "google_redis_instance" "staging" {
  count                   = var.staging_enabled ? 1 : 0
  name                    = "lynia-redis-staging"
  tier                    = "BASIC"
  memory_size_gb          = 1
  region                  = var.region
  redis_version           = var.redis_version
  authorized_network      = google_compute_network.vpc.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = var.redis_tls_enabled ? "SERVER_AUTHENTICATION" : "DISABLED"
  project                 = local.project_id
  labels                  = merge(var.labels, { tier = "staging" })

  depends_on = [google_service_networking_connection.private_vpc]
}

# --- Media bucket (staging) — keeps k6/QA uploads out of the prod bucket ---
resource "google_storage_bucket" "staging_media" {
  count                       = var.staging_enabled ? 1 : 0
  name                        = "${var.bucket_name}-staging"
  location                    = var.region
  project                     = local.project_id
  uniform_bucket_level_access = true
  force_destroy               = true # disposable
  labels                      = merge(var.labels, { tier = "staging" })

  public_access_prevention = "enforced"

  lifecycle_rule {
    # Auto-purge everything after 30 days — staging artifacts never need to persist.
    condition { age = 30 }
    action { type = "Delete" }
  }
}

# --- Staging runtime SA — so staging can NEVER read prod secrets or prod data ---
resource "google_service_account" "staging_runtime" {
  count        = var.staging_enabled ? 1 : 0
  account_id   = "lynia-run-staging"
  display_name = "Lynia Cloud Run runtime (staging)"
  project      = local.project_id
}

resource "google_project_iam_member" "staging_runtime_sql_client" {
  count   = var.staging_enabled ? 1 : 0
  project = local.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.staging_runtime[0].email}"
}

resource "google_storage_bucket_iam_member" "staging_runtime_bucket" {
  count  = var.staging_enabled ? 1 : 0
  bucket = google_storage_bucket.staging_media[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.staging_runtime[0].email}"
}

# Keyless V4 signed URLs, same self-signBlob pattern as prod (iam.tf).
resource "google_service_account_iam_member" "staging_runtime_sign_self" {
  count              = var.staging_enabled ? 1 : 0
  service_account_id = google_service_account.staging_runtime[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.staging_runtime[0].email}"
}

# The CI deployer must be able to set the staging SA on the staging service.
resource "google_service_account_iam_member" "deployer_actas_staging_runtime" {
  count              = var.staging_enabled ? 1 : 0
  service_account_id = google_service_account.staging_runtime[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# --- Staging secrets (own DB/Redis URLs + own JWT/PII keys — never prod's) ---
locals {
  staging_secret_values = var.staging_enabled ? {
    DATABASE_URL_STAGING = format(
      "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s&schema=public",
      var.db_user,
      random_password.staging_db[0].result,
      var.db_name,
      google_sql_database_instance.staging[0].connection_name,
    )
    REDIS_URL_STAGING = format(
      "%s://:%s@%s:%d",
      var.redis_tls_enabled ? "rediss" : "redis",
      google_redis_instance.staging[0].auth_string,
      google_redis_instance.staging[0].host,
      google_redis_instance.staging[0].port,
    )
    JWT_SIGNING_SECRET_STAGING = random_password.staging_jwt[0].result
    PII_ENCRYPTION_KEY_STAGING = random_password.staging_pii[0].result
  } : {}
}

resource "random_password" "staging_jwt" {
  count   = var.staging_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "random_password" "staging_pii" {
  count   = var.staging_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "staging_runtime" {
  for_each  = local.staging_secret_values
  secret_id = each.key
  project   = local.project_id
  labels    = merge(var.labels, { tier = "staging" })

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "staging_runtime" {
  for_each    = local.staging_secret_values
  secret      = google_secret_manager_secret.staging_runtime[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "staging_runtime_access" {
  for_each  = google_secret_manager_secret.staging_runtime
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.staging_runtime[0].email}"
}

# --- LB exposure: staging NEG + backend + managed cert; the host rule lives in lb.tf ---
resource "google_compute_region_network_endpoint_group" "staging" {
  count                 = var.staging_enabled ? 1 : 0
  name                  = "lynia-api-staging-neg"
  region                = var.region
  project               = local.project_id
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.staging_cloud_run_service
  }

  depends_on = [google_project_service.apis]
}

resource "google_compute_backend_service" "staging" {
  count                 = var.staging_enabled ? 1 : 0
  name                  = "lynia-api-staging-backend"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  # Same Armor perimeter as prod — the k6 abuse scenario (LR3/LR11) should hit the same edge
  # rules launch traffic will.
  security_policy = google_compute_security_policy.api.id

  backend {
    group = google_compute_region_network_endpoint_group.staging[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Separate managed cert (attached alongside prod's on the HTTPS proxy in lb.tf) — adding the
# staging domain to the EXISTING cert would force-replace it and churn prod TLS.
resource "google_compute_managed_ssl_certificate" "staging" {
  count   = var.staging_enabled ? 1 : 0
  name    = "lynia-api-staging-cert"
  project = local.project_id

  managed {
    domains = [var.staging_api_domain]
  }
}

# --- Arming outputs (mirror the prod arming pattern in outputs.tf) ---
output "STAGING_CLOUD_RUN_SERVICE" {
  value = var.staging_enabled ? var.staging_cloud_run_service : null
}

output "STAGING_CLOUD_SQL_INSTANCE" {
  value = var.staging_enabled ? google_sql_database_instance.staging[0].connection_name : null
}

output "STAGING_CLOUD_RUN_SERVICE_ACCOUNT" {
  value = var.staging_enabled ? google_service_account.staging_runtime[0].email : null
}

output "MIGRATE_DATABASE_URL_STAGING" {
  description = "Set as the MIGRATE_DATABASE_URL_STAGING repo secret (CI migrations via the Auth Proxy)."
  value = var.staging_enabled ? format(
    "postgresql://%s:%s@127.0.0.1:5432/%s?schema=public",
    var.db_user,
    random_password.staging_db[0].result,
    var.db_name,
  ) : null
  sensitive = true
}

output "staging_endpoint" {
  description = "Point a DNS A record for staging_api_domain at the SAME load_balancer_ip as prod."
  value       = var.staging_enabled ? "https://${var.staging_api_domain}" : null
}
