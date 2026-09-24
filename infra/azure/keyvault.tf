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
  name         = local.kv_terraform_written.DATABASE_URL
  key_vault_id = data.azurerm_key_vault.main.id
  content_type = "postgresql connection string (written by infra/azure)"
  # sslmode=require: Flexible Server enforces TLS. The pool size is NOT in the URL; the app reads
  # DATABASE_CONNECTION_LIMIT (prisma.service.ts), set to 5 on the container (E9).
  value = format(
    "postgresql://%s:%s@%s:5432/%s?sslmode=require",
    azurerm_postgresql_flexible_server.main.administrator_login,
    urlencode(random_password.postgres_admin.result),
    azurerm_postgresql_flexible_server.main.fqdn,
    azurerm_postgresql_flexible_server_database.lynia.name,
  )
  tags = local.tags
}

resource "azurerm_key_vault_secret" "redis_url" {
  name         = local.kv_terraform_written.REDIS_URL
  key_vault_id = data.azurerm_key_vault.main.id
  content_type = "rediss:// URL, TLS port 10000 (written by infra/azure)"
  value = format(
    "rediss://:%s@%s:%d",
    urlencode(azurerm_managed_redis.main.default_database[0].primary_access_key),
    azurerm_managed_redis.main.hostname,
    azurerm_managed_redis.main.default_database[0].port,
  )
  tags = local.tags
}

# ---- Per-secret read access ----

locals {
  # identity key => list of vault secret names it may read.
  kv_readers = {
    api = values(local.api_secret_env)
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

# ---- Private endpoint from this environment's VNet (E3) ----
# Public network access on the vault stays ENABLED (RBAC-only data plane): bootstrap runs from
# Cloud Shell and Terraform runs from GitHub-hosted runners, neither of which is in the VNet.
# In-VNet traffic (Key Vault references resolved by the environment) uses this endpoint.

resource "azurerm_private_endpoint" "vault" {
  name                = "pe-kv-lynia-${local.env_short}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  subnet_id           = azurerm_subnet.pe.id
  tags                = local.tags

  private_service_connection {
    name                           = "kv"
    private_connection_resource_id = data.azurerm_key_vault.main.id
    subresource_names              = ["vault"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "vault"
    private_dns_zone_ids = [azurerm_private_dns_zone.zone["vault"].id]
  }
}
