# Scheduler audience (C3, D8, E1, S2).
#
# The cron jobs call the API with an Entra managed-identity token for this app's identifier URI.
# The API's EntraVerifier checks iss/tid, aud == SCHEDULER_AUDIENCE, oid ==
# SCHEDULER_PRINCIPAL_ID, and (S2, defence in depth) that `roles` contains Scheduler.Invoke.
# Any service principal in the tenant can get a token for this audience; only the jobs identity
# is ASSIGNED the role, so only its token carries it.
#
# Permissions: creating an application + service principal needs Graph
# Application.ReadWrite.OwnedBy on the infra identity (granted by bootstrap.sh); the caller
# becomes an owner of what it creates. Assigning an app role to another principal needs
# AppRoleAssignment.ReadWrite.All, which is tenant-admin-equivalent. The infra identity does
# NOT get it (S5): bootstrap.sh, re-run after the first apply, makes that one assignment with
# the owner's rights. Set scheduler_role_assignment_via_terraform = true only if you decide to
# grant the broader Graph permission after all.

locals {
  # Fixed, non-secret id for the app role (stable across applies; no random_uuid in state).
  scheduler_app_role_id = "5d0b2f3c-8a41-4c6e-9b7a-2f1e6c9d4a10"
  # api://<tenant>/<name> is allowed by the default tenant identifier-URI policy without a
  # verified domain.
  scheduler_audience = "api://${data.azurerm_client_config.current.tenant_id}/lynia-scheduler-${var.environment}"
}

data "azuread_client_config" "current" {}

resource "azuread_application" "scheduler" {
  display_name     = "lynia-scheduler-${var.environment}"
  sign_in_audience = "AzureADMyOrg"
  identifier_uris  = [local.scheduler_audience]
  owners           = [data.azuread_client_config.current.object_id]
  notes            = "Audience for Lynia cron job tokens (infra/azure/entra.tf). Scheduler.Invoke is assigned ONLY to ${local.names.id_jobs}."

  app_role {
    id                   = local.scheduler_app_role_id
    value                = "Scheduler.Invoke"
    display_name         = "Scheduler.Invoke"
    description          = "Invoke Lynia scheduled admin sweeps (retention purge, wallet integrity)."
    allowed_member_types = ["Application"]
    enabled              = true
  }
}

resource "azuread_service_principal" "scheduler" {
  client_id = azuread_application.scheduler.client_id
  owners    = [data.azuread_client_config.current.object_id]
  # Tokens are issued only to principals that hold an app role assignment.
  app_role_assignment_required = true
}

resource "azuread_app_role_assignment" "jobs_scheduler_invoke" {
  count               = var.scheduler_role_assignment_via_terraform ? 1 : 0
  app_role_id         = local.scheduler_app_role_id
  principal_object_id = azurerm_user_assigned_identity.jobs.principal_id
  resource_object_id  = azuread_service_principal.scheduler.object_id
}
