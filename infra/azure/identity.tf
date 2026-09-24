# Managed identities and least-privilege role assignments (D5, D12, E14, S5).
#
# Runtime identities (created here, per environment):
#   id-lynia-api-<env>   API + migrate job. KV Secrets User on ITS secrets only, Blob Data
#                        Contributor on the lynia-media CONTAINER, Blob Delegator on the
#                        ACCOUNT (user-delegation SAS), AcrPull.
#   id-lynia-jobs-<env>  The two cron jobs. No Azure RBAC at all: its only power is the
#                        Scheduler.Invoke app role (entra.tf) that the API checks.
#   id-lynia-web-<env>   Admin + merchant. AcrPull, and KV Secrets User on ADMIN-API-TOKEN only.
#
# CI identities (created by bootstrap.sh in rg-lynia-tfstate; read here):
#   id-lynia-infra               Terraform. Subscription roles granted by bootstrap.sh.
#   id-lynia-deploy-<env>        Revisions. Roles below, scoped to THIS environment's resource
#                                group / registry / identities. Never Owner or User Access
#                                Administrator (S5).

resource "azurerm_user_assigned_identity" "api" {
  name                = local.names.id_api
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "jobs" {
  name                = local.names.id_jobs
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_user_assigned_identity" "web" {
  name                = local.names.id_web
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

data "azurerm_user_assigned_identity" "deploy" {
  name                = local.deploy_identity_name
  resource_group_name = var.tfstate_resource_group
}

# ---- Runtime: registry pull ----

resource "azurerm_role_assignment" "acr_pull" {
  for_each = {
    api = azurerm_user_assigned_identity.api.principal_id
    web = azurerm_user_assigned_identity.web.principal_id
  }
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = each.value
  principal_type       = "ServicePrincipal"
}

# ---- Runtime: blob (D5) ----

resource "azurerm_role_assignment" "api_blob_data" {
  scope                = azurerm_storage_container.media.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
  principal_type       = "ServicePrincipal"
}

resource "azurerm_role_assignment" "api_blob_delegator" {
  scope                = azurerm_storage_account.media.id
  role_definition_name = "Storage Blob Delegator"
  principal_id         = azurerm_user_assigned_identity.api.principal_id
  principal_type       = "ServicePrincipal"
}

# ---- CI deploy identity for this environment (E14 / S5) ----

locals {
  deploy_roles = {
    # Create revisions, shift traffic, start the migrate job, read revision state.
    containerapps = { scope = azurerm_resource_group.main.id, role = "Container Apps Contributor" }
    # Push images (buildx → ACR).
    acrpush = { scope = azurerm_container_registry.main.id, role = "AcrPush" }
    # Canary 5xx gate reads the Requests metric by revision (H18).
    metrics = { scope = azurerm_resource_group.main.id, role = "Monitoring Reader" }
    # azure-diagnose Recap reads job execution logs.
    logs = { scope = azurerm_log_analytics_workspace.main.id, role = "Log Analytics Reader" }
    # Updating an app that carries a user-assigned identity re-asserts that identity, which
    # needs .../userAssignedIdentities/assign/action on it.
    mi_api  = { scope = azurerm_user_assigned_identity.api.id, role = "Managed Identity Operator" }
    mi_jobs = { scope = azurerm_user_assigned_identity.jobs.id, role = "Managed Identity Operator" }
    mi_web  = { scope = azurerm_user_assigned_identity.web.id, role = "Managed Identity Operator" }
  }
}

resource "azurerm_role_assignment" "deploy" {
  for_each             = local.deploy_roles
  scope                = each.value.scope
  role_definition_name = each.value.role
  principal_id         = data.azurerm_user_assigned_identity.deploy.principal_id
  principal_type       = "ServicePrincipal"
}
