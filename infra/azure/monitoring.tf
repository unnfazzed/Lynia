# Logs, alerts and budget (H15, D13, E7, E9, R9).
#
# The external uptime monitor (keyword check on "status":"ok", E6) lives OUTSIDE Azure on
# purpose, so it still alerts if this subscription is the thing that went away. It is not here.

resource "azurerm_log_analytics_workspace" "main" {
  name                = local.names.law
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = local.log_daily_quota_gb # hard ingestion cap (D13)
  tags                = local.tags
}

resource "azurerm_monitor_action_group" "ops" {
  name                = "ag-lynia-${local.env_short}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "lynia${local.env_tiny}"
  tags                = local.tags

  dynamic "email_receiver" {
    for_each = toset(var.alert_emails)
    content {
      name                    = "email-${index(var.alert_emails, email_receiver.value)}"
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }

  dynamic "webhook_receiver" {
    for_each = nonsensitive(var.alert_webhook_url != "") ? ["webhook"] : []
    content {
      name                    = "webhook"
      service_uri             = var.alert_webhook_url
      use_common_alert_schema = true
    }
  }
}

locals {
  scheduled_job_names = [for k, v in local.cron_jobs : v.name]
  all_job_names       = concat([local.names.migrate], local.scheduled_job_names)

  # ContainerAppSystemLogs_CL column names differ slightly between environment generations;
  # column_ifexists keeps the query valid either way. skip_query_validation lets the rule be
  # created before the table has its first row.
  job_log_base = <<-KQL
    ContainerAppSystemLogs_CL
    | extend job = tostring(column_ifexists("JobName_s", "")), reason = tostring(column_ifexists("Reason_s", ""))
  KQL
}

# E7 (1/2): any job execution that failed or exhausted its retries.
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "job_failed" {
  name                  = "alert-lynia-${local.env_short}-job-failed"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  scopes                = [azurerm_log_analytics_workspace.main.id]
  description           = "A Lynia Container Apps job execution Failed or hit BackoffLimitExceeded (E7)."
  severity              = 2
  evaluation_frequency  = "PT15M"
  window_duration       = "PT15M"
  skip_query_validation = true
  tags                  = local.tags

  criteria {
    query                   = <<-KQL
      ${local.job_log_base}
      | where job in (${join(", ", [for n in local.all_job_names : "\"${n}\""])})
      | where reason in ("Failed", "BackoffLimitExceeded")
      | summarize failures = count() by job
    KQL
    time_aggregation_method = "Total"
    metric_measure_column   = "failures"
    operator                = "GreaterThan"
    threshold               = 0

    dimension {
      name     = "job"
      operator = "Include"
      values   = ["*"]
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }
}

# E7 (2/2): missed run — no successful execution of a scheduled job in 26 h. One rule per job,
# because a job with no rows at all produces no dimension to alert on. The window must be one
# of Azure's fixed values, so it is P2D and the 26 h bound lives in the query.
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "job_missed" {
  for_each              = local.cron_jobs
  name                  = "alert-lynia-${local.env_short}-${replace(each.key, "_", "-")}-missed"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  scopes                = [azurerm_log_analytics_workspace.main.id]
  description           = "${each.value.name} has not completed successfully in 26 hours (E7)."
  severity              = 2
  evaluation_frequency  = "PT1H"
  window_duration       = "P2D"
  skip_query_validation = true
  tags                  = local.tags

  criteria {
    query                   = <<-KQL
      ${local.job_log_base}
      | where TimeGenerated > ago(26h)
      | where job == "${each.value.name}"
      | summarize successes = countif(reason in (${join(", ", [for r in var.job_success_reasons : "\"${r}\""])}))
    KQL
    time_aggregation_method = "Maximum"
    metric_measure_column   = "successes"
    operator                = "LessThan"
    threshold               = 1
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }
}

# E9: B1ms allows ~50 connections; 5 replicas × 5 + jobs ≈ 27. Above 40 means a pool leak or a
# replica cap raised without the SKU.
resource "azurerm_monitor_metric_alert" "pg_connections" {
  name                = "alert-lynia-${local.env_short}-pg-connections"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_postgresql_flexible_server.main.id]
  description         = "Postgres active_connections > 40 (B1ms ceiling ~50, E9)."
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = local.tags

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "active_connections"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 40
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }
}

# R9 / Phase 0: a budget on every environment's resource group.
resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "budget-lynia-${local.env_short}"
  resource_group_id = azurerm_resource_group.main.id
  amount            = local.monthly_budget_usd
  time_grain        = "Monthly"

  time_period {
    start_date = var.budget_start_date
  }

  notification {
    enabled        = true
    threshold      = 80
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = var.alert_emails
    contact_groups = [azurerm_monitor_action_group.ops.id]
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = var.alert_emails
    contact_groups = [azurerm_monitor_action_group.ops.id]
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
