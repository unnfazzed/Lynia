# Runtime secrets in Secret Manager, injected into Cloud Run at deploy via
# --set-secrets (D7: secrets-as-env, no managed-identity lock-in). Terraform
# generates and populates DATABASE_URL, REDIS_URL, and JWT_SIGNING_SECRET so the
# founder never hand-builds a connection string. Vendor keys (WhatsApp/SMS/Didit)
# are added later, by hand, as new versions — they are not generated here.

locals {
  # Runtime DB connection: Cloud Run reaches Cloud SQL over the Auth Proxy unix
  # socket mounted by --add-cloudsql-instances at /cloudsql/<connection_name>.
  database_url = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s&schema=public",
    var.db_user,
    random_password.db.result,
    var.db_name,
    google_sql_database_instance.main.connection_name,
  )

  # Memorystore AUTH: password-only (no username), per Redis AUTH semantics.
  redis_url = format(
    "redis://:%s@%s:%d",
    google_redis_instance.main.auth_string,
    google_redis_instance.main.host,
    google_redis_instance.main.port,
  )

  secret_values = {
    DATABASE_URL       = local.database_url
    REDIS_URL          = local.redis_url
    JWT_SIGNING_SECRET = random_password.jwt.result
  }
}

resource "random_password" "jwt" {
  length  = 48
  special = false # base62 — avoids any quoting/escaping surprises downstream
}

resource "google_secret_manager_secret" "runtime" {
  for_each  = local.secret_values
  secret_id = each.key
  project   = local.project_id
  labels    = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "runtime" {
  for_each    = local.secret_values
  secret      = google_secret_manager_secret.runtime[each.key].id
  secret_data = each.value
}

# Only the runtime SA may read these — per-secret, not project-wide.
resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each  = google_secret_manager_secret.runtime
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
