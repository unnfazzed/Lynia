# Cloud Scheduler cron jobs — the terraformed version of docs/LAUNCH-EXECUTION-RUNBOOK.md §2.
#
# Both jobs POST to admin endpoints with a Google-signed OIDC token minted as the RUNTIME SA.
# AdminOrSchedulerGuard (apps/api/src/auth/admin-or-scheduler.guard.ts) accepts that token only
# when: SCHEDULER_SERVICE_ACCOUNT (injected by release.yml as the runtime SA) matches the token's
# email exactly, AND the token's audience equals the route's own full public URL — so audience
# here MUST be the exact https://<api_domain><path> the request arrives on. Changing api_domain
# therefore re-points both jobs automatically.
#
# Region: Cloud Scheduler does not exist in africa-south1 (runbook §2, learned 2026-07-08) —
# jobs run from var.scheduler_region (europe-west1). Harare wall-clock via time_zone.

locals {
  retention_purge_uri      = "https://${var.api_domain}/admin/retention/purge"
  settlement_autopause_uri = "https://${var.api_domain}/admin/cash/settlements/auto-pause"
}

# Daily retention sweep (LR8): GPS scrub + expired-session purge.
resource "google_cloud_scheduler_job" "retention_purge" {
  count = var.scheduler_jobs_enabled ? 1 : 0

  name      = "lynia-retention-purge"
  project   = local.project_id
  region    = var.scheduler_region
  schedule  = "0 3 * * *"
  time_zone = "Africa/Harare"

  # The purge walks retention windows over the whole table set — give it more than the 180s
  # default before Scheduler marks the attempt failed, and retry within the same night.
  attempt_deadline = "320s"
  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = local.retention_purge_uri
    oidc_token {
      service_account_email = google_service_account.runtime.email
      audience              = local.retention_purge_uri
    }
  }

  depends_on = [google_project_service.apis]
}

# Daily settlement auto-pause (LR5) — armed only once monetization is on (settlement_autopause_enabled).
resource "google_cloud_scheduler_job" "settlement_autopause" {
  count = var.scheduler_jobs_enabled && var.settlement_autopause_enabled ? 1 : 0

  name      = "lynia-settlement-autopause"
  project   = local.project_id
  region    = var.scheduler_region
  schedule  = "0 2 * * *"
  time_zone = "Africa/Harare"

  attempt_deadline = "320s"
  retry_config {
    retry_count = 3
  }

  http_target {
    http_method = "POST"
    uri         = local.settlement_autopause_uri
    oidc_token {
      service_account_email = google_service_account.runtime.email
      audience              = local.settlement_autopause_uri
    }
  }

  depends_on = [google_project_service.apis]
}
