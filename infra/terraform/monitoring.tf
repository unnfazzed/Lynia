# SLO alert policies for the API latency histograms (docs/OBSERVABILITY.md). The app emits OTLP
# histograms; the collector sidecar exports them to Cloud Monitoring via Managed Service for
# Prometheus, so they're queryable in PromQL. We alert with PromQL conditions (not metric-type
# thresholds) so the alert expression is a 1:1 copy of the SLO doc and can't drift.
#
# GATED on var.slo_alerts_enabled (default false): Cloud Monitoring VALIDATES the metric names in
# a PromQL condition at policy-creation time ("The following PromQL metric(s) are invalid" 400 —
# observed on the 2026-07-08 apply), so these policies CANNOT be created until the OTEL collector
# (LR9, docs/OBSERVABILITY.md §Production activation) is live and the series exist in GMP. Flip
# slo_alerts_enabled = true as the last step of LR9 activation and re-apply.
#
# Each policy fires when the metric's p95 stays above its SLO for 10 minutes. Dashboards are NOT
# managed here — they're presentation, hand-tuned in the console, and shipped as an importable JSON
# (infra/otel-collector/dashboard.json) so console tweaks don't fight Terraform.

locals {
  # metric name → p95 SLO (ms), from docs/OBSERVABILITY.md. One alert policy per entry.
  slo_p95_ms = {
    offer_received   = { metric = "offer_received_latency_ms", threshold = 2000, title = "Offer received" }
    position_emit    = { metric = "position_emit_latency_ms", threshold = 500, title = "Position emit" }
    match_select     = { metric = "match_select_duration_ms", threshold = 300, title = "Match select" }
    broadcast_nearby = { metric = "broadcast_nearby_duration_ms", threshold = 400, title = "Broadcast nearby" }
    otp_verify       = { metric = "otp_verify_duration_ms", threshold = 800, title = "OTP verify" }
    http_request     = { metric = "http_request_duration_ms", threshold = 1000, title = "HTTP request" }
  }
}

resource "google_monitoring_alert_policy" "slo_p95" {
  for_each = var.slo_alerts_enabled ? local.slo_p95_ms : {}

  display_name = "Lynia SLO — ${each.value.title} p95 > ${each.value.threshold}ms"
  combiner     = "OR"

  conditions {
    display_name = "${each.value.metric} p95 over ${each.value.threshold}ms for 10m"

    condition_prometheus_query_language {
      # Returns a series only while p95 exceeds the SLO → the alert fires. Mirrors the PromQL in
      # docs/OBSERVABILITY.md verbatim (metric name, not fully-qualified type — insulates us from
      # GMP metric-type-string sanitization).
      query               = "histogram_quantile(0.95, sum(rate(${each.value.metric}_bucket[5m])) by (le)) > ${each.value.threshold}"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "p95 of `${each.value.metric}` exceeded its ${each.value.threshold}ms SLO for 10 minutes. Runbook + PromQL: docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  # The metrics ingest under monitoring.googleapis.com (GMP); ensure the API is on first.
  depends_on = [google_project_service.apis]
}

# Error-rate alert on the match-select outcome counter (docs/OBSERVABILITY.md): page when >5% of
# selections error over 5 minutes. Counter series in GMP; PromQL again keeps it doc-faithful.
resource "google_monitoring_alert_policy" "match_select_error_rate" {
  count = var.slo_alerts_enabled ? 1 : 0 # same LR9 gate as slo_p95 above

  display_name = "Lynia SLO — Match-select error rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "match_select error ratio over 5% for 10m"

    condition_prometheus_query_language {
      query               = "sum(rate(match_select_total{outcome=\"error\"}[5m])) / clamp_min(sum(rate(match_select_total[5m])), 1) > 0.05"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "More than 5% of offer selections returned `error` over 10 minutes (unexpected failures, not the normal `taken`/`unavailable` race outcomes). See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# ─────────────────────────────────────────────────────────────────────────────
# Business-vital alerts (roadmap 1.5). The SLO policies above watch latency; these watch the
# marketplace's money/health signals — the Uber lesson "alert on the business's vital signs, not just
# CPU". Same LR9 gate (slo_alerts_enabled) and same notification_channels as the SLO block: the metric
# series must exist in GMP before the policy can be created, and — critically — a notification channel
# must be configured (var.alert_notification_channels defaults to [], which creates policies that fire
# in the console but PAGE NO ONE). Wiring a real channel is the founder half of LR9.
#
# NOTE — deferred for lack of a series: BullMQ queue age/depth and top-up-confirm lag have NO metric
# emitted today, so no alert can be written against them without first instrumenting the workers/rail.
# Tracked in docs/OBSERVABILITY.md; do not add a policy here until the series exists (it would 400 on apply).

# Ledger integrity drift — the single highest-value money monitor (roadmap 1.3 emits the series). ANY
# nonzero drift over a day means the nightly sweep found a completeness violation (balance≠ledger, a
# confirmed top-up with no credit, a missing receipt, an orphan credit). Page immediately.
resource "google_monitoring_alert_policy" "wallet_integrity_drift" {
  count = var.slo_alerts_enabled ? 1 : 0

  display_name = "Lynia money — wallet ledger integrity drift"
  combiner     = "OR"

  conditions {
    display_name = "wallet_integrity_drift_total increased over 24h"

    condition_prometheus_query_language {
      query               = "sum(increase(wallet_integrity_drift_total[24h])) > 0"
      duration            = "0s"
      evaluation_interval = "300s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "The nightly wallet integrity sweep found a ledger-completeness violation (a rider balance ≠ sum(ledger), a confirmed top-up with no credit, a ride_commission missing its receipt, or a credit tied to a non-confirmed top-up). This is money visibility — investigate before the next payout. Job: POST /admin/wallet/integrity-check (WalletIntegrityService). See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# Integrity-job liveness — the denominator guard. Without this, "0 drift" is ambiguous: healthy, or the
# job stopped running? Fire if no run completed in >25h (the nightly job should tick once/24h).
resource "google_monitoring_alert_policy" "wallet_integrity_stalled" {
  count = var.slo_alerts_enabled ? 1 : 0

  display_name = "Lynia money — wallet integrity job not running"
  combiner     = "OR"

  conditions {
    display_name = "no wallet_integrity_runs_total in 25h"

    condition_prometheus_query_language {
      query               = "sum(increase(wallet_integrity_runs_total[25h])) < 1"
      duration            = "0s"
      evaluation_interval = "300s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "The nightly wallet integrity sweep has not completed a run in over 25 hours — a 0-drift reading is therefore not trustworthy. Check the Cloud Scheduler job `lynia-wallet-integrity` and the /admin/wallet/integrity-check endpoint. See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# API 5xx rate — the post-deploy blast-radius signal. >2% of requests 5xx over 10m pages. Uses the
# http_request histogram's implicit _count series, split by the status_class label recordHttp sets.
resource "google_monitoring_alert_policy" "api_5xx_rate" {
  count = var.slo_alerts_enabled ? 1 : 0

  display_name = "Lynia — API 5xx rate > 2%"
  combiner     = "OR"

  conditions {
    display_name = "5xx ratio over 2% for 10m"

    condition_prometheus_query_language {
      query               = "sum(rate(http_request_duration_ms_count{status_class=\"5xx\"}[5m])) / clamp_min(sum(rate(http_request_duration_ms_count[5m])), 1) > 0.02"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "More than 2% of API requests returned 5xx over 10 minutes — usually a bad deploy or a downstream failure. First mitigation: re-point traffic to the previous Cloud Run revision (rollback.yml). See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# Offer-creation failure rate — a marketplace vital sign. >5% of offer-make attempts erroring over 10m
# (the `error` outcome, not the normal `conflict`/`forbidden` race/permission outcomes) pages.
resource "google_monitoring_alert_policy" "offers_error_rate" {
  count = var.slo_alerts_enabled ? 1 : 0

  display_name = "Lynia — Offer-make error rate > 5%"
  combiner     = "OR"

  conditions {
    display_name = "offers_made error ratio over 5% for 10m"

    condition_prometheus_query_language {
      query               = "sum(rate(offers_made_total{outcome=\"error\"}[5m])) / clamp_min(sum(rate(offers_made_total[5m])), 1) > 0.05"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "More than 5% of offer-make attempts returned `error` over 10 minutes — riders can't bid. Distinct from `conflict`/`forbidden`, which are normal race/permission outcomes. See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# WhatsApp OTP delivery failures — the async half of a send failure the login path can't see. A spike
# means riders/customers can't receive their login code. >0.2 failures/sec sustained over 10m pages.
resource "google_monitoring_alert_policy" "whatsapp_otp_delivery" {
  count = var.slo_alerts_enabled ? 1 : 0

  display_name = "Lynia — WhatsApp OTP delivery failures"
  combiner     = "OR"

  conditions {
    display_name = "whatsapp_otp_delivery_failed rate elevated for 10m"

    condition_prometheus_query_language {
      query               = "sum(rate(whatsapp_otp_delivery_failed_total[5m])) > 0.2"
      duration            = "600s"
      evaluation_interval = "60s"
    }
  }

  notification_channels = var.alert_notification_channels

  documentation {
    content   = "WhatsApp OTP deliveries are failing at the delivery-status webhook (Meta reported `failed` after accepting the send). Sustained failures mean users can't log in. Check Meta Cloud API status and the WHATSAPP_* config. See docs/OBSERVABILITY.md."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}
