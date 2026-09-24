# Container Apps environment + the three app shells (D1, H1, H9, H11, E3, E4, E9).
#
# OWNERSHIP SPLIT (D11): Terraform creates each app ONCE with a placeholder image and the full
# initial template (env, Key Vault secret refs, scale). After that, CI owns revisions: image,
# template and traffic are under ignore_changes, so an apply never rolls back a deploy. The
# workflows must therefore carry the env contract (output `api_env_contract`) when they change
# a revision; `az containerapp update --image` keeps the existing template, which is the norm.

resource "azurerm_container_app_environment" "main" {
  name                       = local.names.cae
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  logs_destination           = "log-analytics"
  tags                       = local.tags

  # VNet-integrated, external ingress (public apps; private data plane behind them).
  infrastructure_subnet_id       = azurerm_subnet.aca.id
  internal_load_balancer_enabled = false

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  lifecycle {
    # Azure fills this in on create for workload-profile environments.
    ignore_changes = [infrastructure_resource_group_name]
  }
}

locals {
  api_url = "https://${local.api_hostname}"

  # Plain (non-secret) env the API starts with. Everything secret is a Key Vault reference.
  api_plain_env = {
    NODE_ENV                  = "production"
    APP_ENV                   = var.environment
    PORT                      = "3000"
    TRUST_PROXY               = "1" # Cloudflare DNS-only → one hop, the ACA ingress (D7)
    CLOUD_PROVIDER            = "azure"
    AZURE_STORAGE_ACCOUNT     = azurerm_storage_account.media.name
    AZURE_STORAGE_CONTAINER   = azurerm_storage_container.media.name
    AZURE_CLIENT_ID           = azurerm_user_assigned_identity.api.client_id
    AZURE_TENANT_ID           = data.azurerm_client_config.current.tenant_id
    DATABASE_CONNECTION_LIMIT = "5" # E9: 5 replicas × 5 = 25 < B1ms ~50
    SCHEDULER_AUTH            = "azure"
    SCHEDULER_AUDIENCE        = local.scheduler_audience
    SCHEDULER_PRINCIPAL_ID    = azurerm_user_assigned_identity.jobs.principal_id
    SCHEDULER_TENANT_ID       = data.azurerm_client_config.current.tenant_id
    PUSH_PROVIDER             = "noop" # E5: until the new Firebase credential exists
    # Placeholder image only (dotnet sample honours it); the real API ignores it.
    ASPNETCORE_HTTP_PORTS = "3000"
  }

  web_plain_env = {
    NODE_ENV              = "production"
    HOSTNAME              = "0.0.0.0" # R11: Next standalone must not bind the replica name
    PORT                  = "8080"
    ASPNETCORE_HTTP_PORTS = "8080" # placeholder image only
  }

  registry_server = azurerm_container_registry.main.login_server
}

# ================================ API ================================

resource "azurerm_container_app" "api" {
  name                         = local.names.api
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple" # canary via revision weights (H18)
  workload_profile_name        = "Consumption"
  max_inactive_revisions       = 10
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  registry {
    server   = local.registry_server
    identity = azurerm_user_assigned_identity.api.id
  }

  dynamic "secret" {
    for_each = local.api_secret_refs
    content {
      name                = secret.value.secret
      identity            = azurerm_user_assigned_identity.api.id
      key_vault_secret_id = "${local.kv_uri}secrets/${secret.value.kv}"
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 3000
    transport                  = "auto" # HTTP/1.1 + WebSocket upgrade for Socket.IO
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = local.api_min_replicas
    max_replicas = var.api_max_replicas

    # Each open Socket.IO connection is a long-lived request; the default of 10 would scale out
    # at 11 connected riders (D15, E4).
    http_scale_rule {
      name                = "http-concurrency"
      concurrent_requests = "150"
    }

    container {
      name   = "api"
      image  = var.placeholder_image
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = local.api_plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.api_secret_refs
        content {
          name        = env.key
          secret_name = env.value.secret
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template, ingress[0].traffic_weight]
  }

  depends_on = [
    azurerm_role_assignment.kv_secret_reader,
    azurerm_role_assignment.acr_pull,
  ]
}

# Session affinity (E4) — azurerm has no attribute for it, hence azapi. Gated OFF: Azure
# documents affinity as supported only in SINGLE revision mode, and this app is Multiple for the
# canary. See variables.tf `api_session_affinity` and the README's open decision.
resource "azapi_update_resource" "api_sticky" {
  count       = var.api_session_affinity ? 1 : 0
  type        = "Microsoft.App/containerApps@2024-03-01"
  resource_id = azurerm_container_app.api.id

  body = {
    properties = {
      configuration = {
        ingress = {
          stickySessions = { affinity = "sticky" }
        }
      }
    }
  }
}

# ============================ Admin + merchant ============================

locals {
  admin_auth_secret_kv   = "ADMIN-ENTRA-CLIENT-SECRET${local.kv_suffix}"
  admin_auth_secret_name = "microsoft-provider-authentication-secret"

  web_apps = {
    admin = {
      name = local.names.admin
      # ENV_VAR => secret ref, exposed to the app.
      env_secrets = { ADMIN_API_TOKEN = { secret = "admin-api-token", kv = local.kv_admin_token } }
      # Secrets the platform consumes (Easy Auth), never exposed as env.
      platform_secrets = var.admin_auth_client_id != "" ? { (local.admin_auth_secret_name) = local.admin_auth_secret_kv } : {}
      env = merge(local.web_plain_env, {
        API_BASE_URL               = local.api_url
        ADMIN_CONSOLE_REQUIRE_AUTH = "true"
        ADMIN_CONSOLE_PROXY_HEADER = "x-ms-client-principal-name" # D9; trusted only behind Easy Auth
      })
    }
    merchant = {
      name             = local.names.merchant
      env_secrets      = {}
      platform_secrets = {}
      env              = local.web_plain_env
    }
  }
}

resource "azurerm_container_app" "web" {
  for_each                     = local.web_apps
  name                         = each.value.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.web.id]
  }

  registry {
    server   = local.registry_server
    identity = azurerm_user_assigned_identity.web.id
  }

  dynamic "secret" {
    for_each = merge(
      { for k, v in each.value.env_secrets : v.secret => v.kv },
      each.value.platform_secrets,
    )
    content {
      name                = secret.key
      identity            = azurerm_user_assigned_identity.web.id
      key_vault_secret_id = "${local.kv_uri}secrets/${secret.value}"
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 8080
    transport                  = "auto"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 0 # scale to zero (§2)
    max_replicas = 2

    container {
      name   = each.key
      image  = var.placeholder_image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = each.value.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = each.value.env_secrets
        content {
          name        = env.key
          secret_name = env.value.secret
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template, ingress[0].traffic_weight]
  }

  depends_on = [
    azurerm_role_assignment.kv_secret_reader,
    azurerm_role_assignment.acr_pull,
  ]
}

# Easy Auth for the admin console (D9, H11, S3) — azapi: azurerm has no authConfigs resource.
# Created only once the owner has made the Entra app registration ("Assignment required = Yes")
# and stored its client secret in Key Vault as ADMIN-ENTRA-CLIENT-SECRET[-STAGING]; Terraform
# never sees that secret's value (S1). Unauthenticated requests are redirected to sign-in;
# /api/healthz stays public for probes (C4).
resource "azapi_resource" "admin_auth" {
  count     = var.admin_auth_client_id != "" ? 1 : 0
  type      = "Microsoft.App/containerApps/authConfigs@2024-03-01"
  name      = "current"
  parent_id = azurerm_container_app.web["admin"].id

  body = {
    properties = {
      platform = { enabled = true }
      globalValidation = {
        unauthenticatedClientAction = "RedirectToLoginPage"
        redirectToProvider          = "azureactivedirectory"
        excludedPaths               = ["/api/healthz"]
      }
      identityProviders = {
        azureActiveDirectory = {
          enabled = true
          registration = {
            clientId                = var.admin_auth_client_id
            clientSecretSettingName = local.admin_auth_secret_name
            openIdIssuer            = "https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/v2.0"
          }
          validation = {
            allowedAudiences = ["api://${var.admin_auth_client_id}", var.admin_auth_client_id]
          }
        }
      }
      login = {
        tokenStore = { enabled = false }
      }
    }
  }
}
