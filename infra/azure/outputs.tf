# Outputs. None of them is a secret: the only secret material Terraform knows (PG password,
# Redis key) is written to Key Vault and never output.

locals {
  # "" for production, "_STAGING" for staging: the GitHub Variables naming convention.
  var_suffix = local.is_prod ? "" : "_STAGING"

  github_variables = {
    "AZ_RESOURCE_GROUP${local.var_suffix}"             = azurerm_resource_group.main.name
    "AZ_ACR_NAME${local.var_suffix}"                   = azurerm_container_registry.main.name
    "AZ_ACR_LOGIN_SERVER${local.var_suffix}"           = azurerm_container_registry.main.login_server
    "AZ_CONTAINERAPP_ENV${local.var_suffix}"           = azurerm_container_app_environment.main.name
    "AZ_CONTAINERAPP_API${local.var_suffix}"           = azurerm_container_app.api.name
    "AZ_CONTAINERAPP_ADMIN${local.var_suffix}"         = azurerm_container_app.web["admin"].name
    "AZ_CONTAINERAPP_MERCHANT${local.var_suffix}"      = azurerm_container_app.web["merchant"].name
    "AZ_MIGRATE_JOB${local.var_suffix}"                = azurerm_container_app_job.migrate.name
    "AZ_RETENTION_JOB${local.var_suffix}"              = azurerm_container_app_job.cron["retention"].name
    "AZ_WALLET_INTEGRITY_JOB${local.var_suffix}"       = azurerm_container_app_job.cron["wallet_integrity"].name
    "AZ_API_HOSTNAME${local.var_suffix}"               = local.api_hostname
    "AZ_API_FQDN${local.var_suffix}"                   = azurerm_container_app.api.ingress[0].fqdn
    "AZ_LOG_ANALYTICS_WORKSPACE_ID${local.var_suffix}" = azurerm_log_analytics_workspace.main.workspace_id
    "AZ_API_IDENTITY_ID${local.var_suffix}"            = azurerm_user_assigned_identity.api.id
  }

  custom_domains = {
    for k, v in {
      api      = { host = local.api_hostname, app = azurerm_container_app.api }
      admin    = { host = local.admin_hostname, app = azurerm_container_app.web["admin"] }
      merchant = { host = local.merchant_hostname, app = azurerm_container_app.web["merchant"] }
    } : k => v if v.host != ""
  }
}

output "github_variables" {
  description = "Repo Variables for the Azure workflows from THIS environment's state (production: no suffix; staging: _STAGING)."
  value       = local.github_variables
}

output "api_env_contract" {
  description = "The API's initial env: plain values, and ENV_VAR => Container Apps secret name => Key Vault secret. Workflows that rewrite the template must keep it."
  value = {
    plain   = { for k, v in local.api_plain_env : k => v if k != "ASPNETCORE_HTTP_PORTS" }
    secrets = { for k, v in local.api_secret_refs : k => "${v.secret} <- keyvault:${v.kv}" }
  }
}

output "scheduler" {
  description = "Values the API's Entra scheduler verifier needs (C3/S2), and the one-time role link."
  value = {
    SCHEDULER_AUTH         = "azure"
    SCHEDULER_AUDIENCE     = local.scheduler_audience
    SCHEDULER_PRINCIPAL_ID = azurerm_user_assigned_identity.jobs.principal_id
    SCHEDULER_TENANT_ID    = data.azurerm_client_config.current.tenant_id
    SCHEDULER_APP_ROLE     = "Scheduler.Invoke"
    app_client_id          = azuread_application.scheduler.client_id
    role_link              = var.scheduler_role_assignment_via_terraform ? "managed by Terraform" : "re-run infra/azure/bootstrap.sh once (it assigns Scheduler.Invoke to ${local.names.id_jobs})"
  }
}

output "dns_records" {
  description = "Cloudflare records per host (DNS-only, TTL 300). Add the TXT and the CNAME together, then bind the managed certificate (E11)."
  value = {
    for k, d in local.custom_domains : d.host => {
      txt   = { name = "asuid.${d.host}", value = azurerm_container_app_environment.main.custom_domain_verification_id }
      cname = { name = d.host, value = d.app.ingress[0].fqdn, proxied = false }
      bind  = "az containerapp hostname bind -g ${azurerm_resource_group.main.name} -n ${d.app.name} --hostname ${d.host} --environment ${azurerm_container_app_environment.main.name} --validation-method CNAME"
      check = "az containerapp hostname list -g ${azurerm_resource_group.main.name} -n ${d.app.name} -o table"
    }
  }
}

output "arming_guide" {
  description = "What to set where to arm the Azure workflows for this environment."
  value       = <<-EOT

    Lynia ${var.environment} is provisioned in ${azurerm_resource_group.main.name}.

    1. Repo → Settings → Secrets and variables → Actions → Variables
       (bootstrap.sh already set AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
        AZURE_CLIENT_ID_{INFRA,STAGING,PRODUCTION}, AZ_TFSTATE_*, AZ_KEY_VAULT_NAME):
%{for k, v in local.github_variables~}
         ${k} = ${v}
%{endfor~}
       Arming switch, LAST, once a deploy has been dry-run:
         ${local.is_prod ? "AZ_DEPLOY_ENABLED" : "AZ_STAGING_ENABLED"} = true
         AZ_ADMIN_ENABLED / AZ_MERCHANT_ENABLED = true   (when those deploys are wanted)

    2. Secrets: NONE. Every workflow logs in over OIDC (azure/login, client-id per environment).

    3. Scheduler role link: ${var.scheduler_role_assignment_via_terraform ? "done by Terraform." : "re-run infra/azure/bootstrap.sh in Cloud Shell (one assignment)."}

    4. DNS (Cloudflare, DNS-only): terraform output dns_records — TXT asuid.<host> + CNAME,
       then run each `bind` command and wait for the certificate to be Succeeded before
       messaging testers (E11).

    Key Vault ${data.azurerm_key_vault.main.name}: this environment reads
    ${join(", ", sort(values(local.api_secret_env)))}
    and ${local.kv_admin_token} (admin). DATABASE-URL/REDIS-URL are written by Terraform; the
    rest by bootstrap.sh. Vendor secrets: add to the vault, then list them in var.vendor_secrets.
  EOT
}
