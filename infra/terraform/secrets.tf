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

  # Memorystore AUTH: password-only (no username), per Redis AUTH semantics. Scheme is rediss:// only
  # when in-transit TLS is enabled (var.redis_tls_enabled), matching the instance's encryption mode.
  redis_scheme = var.redis_tls_enabled ? "rediss" : "redis"
  redis_url = format(
    "%s://:%s@%s:%d",
    local.redis_scheme,
    google_redis_instance.main.auth_string,
    google_redis_instance.main.host,
    google_redis_instance.main.port,
  )

  base_secret_values = {
    DATABASE_URL       = local.database_url
    REDIS_URL          = local.redis_url
    JWT_SIGNING_SECRET = random_password.jwt.result
    # At-rest encryption key for national IDs (LR8). The API refuses to boot in production without a
    # strong value, so it is generated + stored here alongside the JWT secret. Rotating it requires
    # re-encrypting existing rows (decrypt-with-old → encrypt-with-new) — do not rotate casually.
    PII_ENCRYPTION_KEY = random_password.pii.result
  }

  # When TLS is on, inject the managed server CA so the client can validate the connection even if the
  # CA isn't in the base image's trust store (common/redis.ts reads REDIS_CA_CERT). server_ca_certs is
  # only populated once transit encryption is enabled, so this key is conditional.
  redis_ca_secret = var.redis_tls_enabled ? {
    REDIS_CA_CERT = google_redis_instance.main.server_ca_certs[0].cert
  } : {}

  secret_values = merge(local.base_secret_values, local.redis_ca_secret)
}

resource "random_password" "jwt" {
  length  = 48
  special = false # base62 — avoids any quoting/escaping surprises downstream
}

resource "random_password" "pii" {
  length  = 48
  special = false # base62 — HKDF-derived into the AES + HMAC keys by PiiCryptoService
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
