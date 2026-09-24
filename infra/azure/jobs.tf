# Container Apps jobs (H2, H12, D8, E1, E7).
#
#   caj-lynia-migrate           manual. Same image as the API (CI sets it), runs
#                               `prisma migrate deploy` inside the VNet. Uses the API identity
#                               (it needs DATABASE-URL and AcrPull; nothing else does).
#   caj-lynia-retention         0 1 * * * UTC  = 03:00 Harare (UTC+2, no DST)
#   caj-lynia-wallet-integrity  0 2 * * * UTC  = 04:00 Harare
#
# The two cron jobs replace Cloud Scheduler. Each gets an Entra token for the scheduler audience
# from the Container Apps identity endpoint (IDENTITY_ENDPOINT / IDENTITY_HEADER, injected when
# a managed identity is attached) and POSTs the same endpoints scheduler.tf targeted. The stale
# settlement auto-pause job (no route exists) is not ported (H12). Any non-2xx exits 1, which
# marks the execution Failed and fires the alert in monitoring.tf.

resource "azurerm_container_app_job" "migrate" {
  name                         = local.names.migrate
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 0 # a half-applied migration must not be retried blindly
  tags                         = local.tags

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.api.id]
  }

  registry {
    server   = local.registry_server
    identity = azurerm_user_assigned_identity.api.id
  }

  secret {
    name                = "database-url"
    identity            = azurerm_user_assigned_identity.api.id
    key_vault_secret_id = "${local.kv_uri}secrets/${local.kv_terraform_written.DATABASE_URL}"
  }

  template {
    container {
      name   = "migrate"
      image  = var.placeholder_image
      cpu    = 0.5
      memory = "1Gi"
      # CI replaces image + command with the API image and `prisma migrate deploy`.
      command = ["/bin/sh", "-c", "echo 'placeholder: CI sets the migrate image'"]

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
    }
  }

  lifecycle {
    ignore_changes = [template]
  }

  depends_on = [azurerm_role_assignment.kv_secret_reader, azurerm_role_assignment.acr_pull]
}

locals {
  cron_jobs = {
    retention = {
      name  = local.names.retention
      cron  = "0 1 * * *"
      paths = var.retention_paths
    }
    wallet_integrity = {
      name  = local.names.wallet_integrity
      cron  = "0 2 * * *"
      paths = var.wallet_integrity_paths
    }
  }

  # POSIX sh (curl image is Alpine/busybox). No secret is ever printed: the token only lives in
  # a shell variable. `%%{` is HCL's escape for a literal `%{`.
  cron_script = <<-EOT
    set -eu
    tok="$(curl -fsS -G "$IDENTITY_ENDPOINT" \
      -H "X-IDENTITY-HEADER: $IDENTITY_HEADER" \
      --data-urlencode "api-version=2019-08-01" \
      --data-urlencode "resource=$SCHEDULER_AUDIENCE" \
      --data-urlencode "client_id=$AZURE_CLIENT_ID" \
      | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')"
    if [ -z "$tok" ]; then echo "token: none (identity endpoint refused)"; exit 1; fi
    for p in $JOB_PATHS; do
      code="$(curl -sS -o /dev/null -w '%%{http_code}' --max-time 840 -X POST \
        -H "Authorization: Bearer $tok" -H "Content-Length: 0" "$API_URL$p")"
      echo "POST $p -> HTTP $code"
      case "$code" in 2??) ;; *) exit 1 ;; esac
    done
  EOT
}

resource "azurerm_container_app_job" "cron" {
  for_each                     = local.cron_jobs
  name                         = each.value.name
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 900
  replica_retry_limit          = 1
  tags                         = local.tags

  schedule_trigger_config {
    cron_expression          = each.value.cron
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.jobs.id]
  }

  template {
    container {
      name    = "cron"
      image   = var.cron_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["/bin/sh", "-c", local.cron_script]

      env {
        name  = "API_URL"
        value = "https://${azurerm_container_app.api.ingress[0].fqdn}"
      }
      env {
        name  = "JOB_PATHS"
        value = join(" ", each.value.paths)
      }
      env {
        name  = "SCHEDULER_AUDIENCE"
        value = local.scheduler_audience
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.jobs.client_id
      }
    }
  }
}
