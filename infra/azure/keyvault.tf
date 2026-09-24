# Key Vault (D6, H6, S1).
#
# WHY THE VAULT IS BOOTSTRAP-OWNED, NOT TERRAFORM-OWNED
# The four app secrets (JWT-SIGNING-SECRET, PII-ENCRYPTION-KEY, TOKEN-HASH-SECRET,
# ADMIN-API-TOKEN) must exist BEFORE the container apps are created: a Key Vault reference to
# a missing secret fails the revision. And S1 forbids Terraform from generating them, because
# anything Terraform generates lands in state (the GCP state bucket held the JWT/PII secrets in
# plaintext, H17). So the vault has to exist, with the secrets in it, before the first apply.
# bootstrap.sh therefore creates ONE vault (RBAC mode, purge protection) in rg-lynia-tfstate and
# seeds the secrets only if absent. That also keeps the root secrets outside every environment's
# destroy blast radius. Terraform reads the vault, asserts its hardening below, and manages only:
#   - the two secrets whose values it necessarily knows (DATABASE-URL, REDIS-URL: the accepted
#     S1 exceptions, which embed the PG admin password and the Redis access key);
#   - per-SECRET role assignments (one vault serves both environments, so staging identities are
#     scoped to *-STAGING secrets and can never read production ones);
#   - a private endpoint from this environment's VNet (E3).

data "azurerm_key_vault" "main" {
  name                = local.key_vault_name
  resource_group_name = var.tfstate_resource_group

  lifecycle {
    postcondition {
      condition     = self.rbac_authorization_enabled
      error_message = "Key Vault ${local.key_vault_name} is not in RBAC mode. Re-run infra/azure/bootstrap.sh (it enables --enable-rbac-authorization)."
    }
    postcondition {
      condition     = self.purge_protection_enabled
      error_message = "Key Vault ${local.key_vault_name} has purge protection off. Run: az keyvault update -n ${local.key_vault_name} --enable-purge-protection true"
    }
  }
}

locals {
  # Versionless secret URIs: a rotated secret is picked up by the next revision (D6).
  kv_uri = data.azurerm_key_vault.main.vault_uri
  # Role-assignment scope for one secret (RBAC supports per-secret scope).
  kv_secret_scope = "${data.azurerm_key_vault.main.id}/secrets"
}

# ---- Secrets Terraform writes (accepted S1 exceptions) ----

resource "azurerm_key_vault_secret" "database_url" {
  count        = local.data_on ? 1 : 0
  name         = local.kv_terraform_written.DATABASE_URL
  key_vault_id = data.azurerm_key_vault.main.id
  content_type = "postgresql connection string (written by infra/azure)"
  # sslmode=require: Flexible Server enforces TLS. The pool size is NOT in the URL; the app reads
  # DATABASE_CONNECTION_LIMIT (prisma.service.ts), set to 5 on the container (E9).
  value = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    azurerm_postgresql_flexible_server.main[0].administrator_login,
    urlencode(random_password.postgres_admin[0].result),
    azurerm_postgresql_flexible_server.main[0].fqdn,
    azurerm_postgresql_flexible_server_database.lynia[0].name,
  )
  tags = local.tags
}

resource "azurerm_key_vault_secret" "redis_url" {
  count        = local.data_on ? 1 : 0
  name         = local.kv_terraform_written.REDIS_URL
  key_vault_id = data.azurerm_key_vault.main.id
  content_type = "rediss:// URL, TLS port 10000 (written by infra/azure)"
  value = format(
    "rediss://:%s@%s:%d",
    urlencode(azurerm_managed_redis.main[0].default_database[0].primary_access_key),
    azurerm_managed_redis.main[0].hostname,
    azurerm_managed_redis.main[0].default_database[0].port,
  )
  tags = local.tags
}

# ---- Per-secret read access ----

locals {
  # identity key => list of vault secret names it may read.
  kv_readers = {
    # Hibernated staging has no Terraform-written secrets, so no role can be scoped to them.
    api = [for n in values(local.api_secret_env) : n if local.data_on || !contains(values(local.kv_terraform_written), n)]
    web = concat([local.kv_admin_token], var.admin_auth_client_id != "" ? [local.admin_auth_secret_kv] : [])
  }
  kv_reader_pairs = merge([
    for who, secrets in local.kv_readers : {
      for s in secrets : "${who}:${s}" => { who = who, secret = s }
    }
  ]...)
  kv_reader_principal = {
    api = azurerm_user_assigned_identity.api.principal_id
    web = azurerm_user_assigned_identity.web.principal_id
  }
}

resource "azurerm_role_assignment" "kv_secret_reader" {
  for_each             = local.kv_reader_pairs
  scope                = "${local.kv_secret_scope}/${each.value.secret}"
  role_definition_name = "Key Vault Secrets User"
  principal_id         = local.kv_reader_principal[each.value.who]
  principal_type       = "ServicePrincipal"

  # The Terraform-written secrets must exist before a role can be scoped to them; the
  # bootstrap-seeded ones already do.
  depends_on = [azurerm_key_vault_secret.database_url, azurerm_key_vault_secret.redis_url]
}

# No private endpoint for the vault (savings review 2026-09-24): public network access stays
# enabled with an RBAC-only data plane (bootstrap runs from Cloud Shell, Terraform from GitHub
# runners), and Key Vault references resolve over that same TLS endpoint with the managed
# identity. The PE only re-routed in-VNet reads at ~$7.30/month per environment.

moved {
  from = azurerm_key_vault_secret.database_url
  to   = azurerm_key_vault_secret.database_url[0]
}
moved {
  from = azurerm_key_vault_secret.redis_url
  to   = azurerm_key_vault_secret.redis_url[0]
}
