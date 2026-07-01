# SLO alert policies for the API latency histograms (docs/OBSERVABILITY.md). The app emits OTLP
# histograms; the collector sidecar exports them to Cloud Monitoring via Managed Service for
# Prometheus, so they're queryable in PromQL. We alert with PromQL conditions (not metric-type
# thresholds) so the alert expression is a 1:1 copy of the SLO doc and can't drift — and, crucially,
# a PromQL condition validates on syntax alone, so `terraform apply` succeeds BEFORE any series
# exists (no chicken-and-egg with "the metric type isn't created until data flows").
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
  for_each = local.slo_p95_ms

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
