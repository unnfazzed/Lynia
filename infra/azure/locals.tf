# Naming, per-environment defaults and the Key Vault ⇄ env-var map.

data "azurerm_client_config" "current" {}

locals {
  is_prod = var.environment == "production"

  # Short tag used in resource names: rg-lynia-prod-san / rg-lynia-staging-san (§2 table).
  env_short = local.is_prod ? "prod" : "staging"
  # Compact tag for names that disallow hyphens or cap length (ACR, storage accounts).
  env_tiny = local.is_prod ? "prod" : "stg"

  # Deterministic, non-secret suffix for globally-unique names. Same subscription + env ⇒ same
  # names on every apply, with no random_* resource in state.
  name_suffix = substr(sha1("${data.azurerm_client_config.current.subscription_id}-${var.environment}"), 0, 6)

  # MUST match bootstrap.sh: printf '%s' "$SUBSCRIPTION_ID" | sha1sum | cut -c1-6
  bootstrap_suffix = substr(sha1(data.azurerm_client_config.current.subscription_id), 0, 6)
  key_vault_name   = var.key_vault_name != "" ? var.key_vault_name : "kv-lynia-${local.bootstrap_suffix}"

  resource_group_name = "rg-lynia-${local.env_short}-san"

  api_hostname      = var.api_hostname != "" ? var.api_hostname : (local.is_prod ? "lyniago.lyniafinance.com" : "staging.lyniafinance.com")
  admin_hostname    = var.admin_hostname != "" ? var.admin_hostname : (local.is_prod ? "lyniagoadmin.lyniafinance.com" : "")
  merchant_hostname = var.merchant_hostname != "" ? var.merchant_hostname : (local.is_prod ? "lyniagomerchant.lyniafinance.com" : "")

  api_min_replicas   = var.api_min_replicas != null ? var.api_min_replicas : (local.is_prod ? 1 : 0)
  log_daily_quota_gb = var.log_daily_quota_gb != null ? var.log_daily_quota_gb : (local.is_prod ? 0.2 : 0.1)
  data_on            = var.data_tier_enabled
  monthly_budget_usd = var.monthly_budget_usd != null ? var.monthly_budget_usd : (local.is_prod ? 150 : 60)

  # Container app and job names are the SAME in both environments; the resource group is what
  # differs. Workflows therefore vary only AZ_RESOURCE_GROUP[_STAGING].
  names = {
    cae              = "cae-lynia-${local.env_short}"
    api              = "ca-lynia-api"
    admin            = "ca-lynia-admin"
    merchant         = "ca-lynia-merchant"
    migrate          = "caj-lynia-migrate"
    retention        = "caj-lynia-retention"
    wallet_integrity = "caj-lynia-wallet-integrity"
    acr              = "acrlynia${local.env_tiny}${local.name_suffix}"
    storage          = "stlynia${local.env_tiny}${local.name_suffix}"
    postgres         = "psql-lynia-${local.env_short}-${local.name_suffix}"
    redis            = "redis-lynia-${local.env_short}-${local.name_suffix}"
    law              = "log-lynia-${local.env_short}"
    vnet             = "vnet-lynia-${local.env_short}"
    id_api           = "id-lynia-api-${local.env_short}"
    id_jobs          = "id-lynia-jobs-${local.env_short}"
    id_web           = "id-lynia-web-${local.env_short}"
  }

  # CI identities, created by bootstrap.sh in rg-lynia-tfstate (E14).
  ci_identity_names = {
    infra      = "id-lynia-infra"
    staging    = "id-lynia-deploy-staging"
    production = "id-lynia-deploy-production"
  }
  deploy_identity_name = local.ci_identity_names[var.environment]

  # ---- Key Vault names (H6) ----
  # One vault serves both environments; staging copies carry the -STAGING suffix (§10).
  # Key Vault names cannot contain "_", so DATABASE_URL in env ⇄ DATABASE-URL in the vault.
  kv_suffix = local.is_prod ? "" : "-STAGING"

  # Written by Terraform (the two accepted S1 exceptions: they embed the PG admin password
  # and the Redis access key, which Terraform necessarily knows).
  kv_terraform_written = {
    DATABASE_URL = "DATABASE-URL${local.kv_suffix}"
    REDIS_URL    = "REDIS-URL${local.kv_suffix}"
  }

  # Written by bootstrap.sh with `az keyvault secret set`, only if absent. Terraform NEVER
  # generates or reads their values (S1): it references the names only.
  kv_bootstrap_api = {
    JWT_SIGNING_SECRET = "JWT-SIGNING-SECRET${local.kv_suffix}"
    PII_ENCRYPTION_KEY = "PII-ENCRYPTION-KEY${local.kv_suffix}"
    TOKEN_HASH_SECRET  = "TOKEN-HASH-SECRET${local.kv_suffix}"
  }
  kv_admin_token = "ADMIN-API-TOKEN${local.kv_suffix}"

  kv_vendor = { for env_name, base in var.vendor_secrets : env_name => "${base}${local.kv_suffix}" }

  # ENV_VAR => vault secret name, everything the API revision references.
  api_secret_env = merge(local.kv_terraform_written, local.kv_bootstrap_api, local.kv_vendor)

  # Container Apps secret names must be lowercase alphanumerics and '-'.
  api_secret_refs = {
    for env_name, kv_name in local.api_secret_env :
    env_name => { secret = lower(replace(env_name, "_", "-")), kv = kv_name }
  }

  tags = {
    app         = "lynia"
    environment = var.environment
    managed_by  = "terraform:infra/azure"
  }
}
