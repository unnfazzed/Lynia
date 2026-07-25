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

# --- Vendor secret containers, adopted via `terraform import` (runbook §9) ---
# DIDIT_API_KEY / DIDIT_WEBHOOK_SECRET / WHATSAPP_ACCESS_TOKEN were created with ad-hoc `gcloud
# secrets create` during vendor arming; Terraform owns the CONTAINERS + IAM (drift-detected,
# re-creatable) while the VALUES stay hand-added versions that never touch state or git.
#
# DO NOT `terraform apply` these before they are imported: a create collides with the live
# secrets, and any plan that wants to REPLACE a container would delete live credential versions.
# Run scripts/adopt-vendor-secrets.sh once (founder credentials — CI's deployer SA is read-only
# on the state bucket by design); it imports idempotently, then proves the plan is clean.
#
# BIRD_ACCESS_KEY is pre-listed ahead of its arming (Bird is the priority OTP channel — decision
# 2026-07-19): if the container doesn't exist live yet, the adopt script tolerates the pending
# CREATE (and a founder apply materializes it), or hand-create it while arming and re-run the
# script to import. Either way, add the key VALUE as a version BEFORE flipping BIRD_ENABLED=true —
# the deploy resolves BIRD_ACCESS_KEY:latest, and a container with zero versions fails the deploy.
# When local-SMS OTP gets armed (release.yml wires LOCAL_SMS_API_KEY the same way), add that name
# here and re-run the script.
#
# Deliberately NO `labels` (unlike the runtime secrets above): the hand-created containers carry
# none, so a labels argument would leave a standing in-place diff that nags the nightly drift
# audit until someone applies right next to live credentials. Add labels in a real apply session
# if ever wanted.
resource "google_secret_manager_secret" "vendor" {
  for_each = toset([
    "DIDIT_API_KEY",
    "DIDIT_WEBHOOK_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "BIRD_ACCESS_KEY",
    "BIRD_WEBHOOK_SECRET",
  ])
  secret_id = each.key
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# Runtime-SA read access, per-secret (mirrors runtime_access above). If a binding was never
# granted by hand for one of these, the import skips it and the next apply CREATES it —
# additive and safe, unlike the container-replace case called out above.
resource "google_secret_manager_secret_iam_member" "vendor_runtime" {
  for_each  = google_secret_manager_secret.vendor
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}
