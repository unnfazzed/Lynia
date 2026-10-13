# Observability: metrics, SLOs and what runs in production

Two halves:

1. **What the API can emit**: OpenTelemetry metrics and HTTP traces, pushed over OTLP. This is in the
   code and is described in full below.
2. **What production actually collects on Azure**: logs in Log Analytics, a handful of Azure Monitor
   alerts, Sentry when armed, and the release canary's health gates. **No OpenTelemetry collector is
   deployed on Azure**, so the metrics in half 1 are not collected in production today.

---

## What runs on Azure today

| Signal | Where | Source of truth |
|---|---|---|
| API stdout/stderr logs | Log Analytics `log-lynia-prod`, table `ContainerAppConsoleLogs_CL` (30-day retention, daily ingestion cap) | `infra/azure/monitoring.tf`, `containerapps.tf` |
| Container Apps platform events (revisions, job executions) | same workspace, `ContainerAppSystemLogs_CL` | same |
| Alerts | Azure Monitor → action group `ag-lynia-prod` (email list, optional webhook) | `infra/azure/monitoring.tf` |
| Errors | Sentry, environment `production-azure`, when the `SENTRY_ENABLED` Variable is `true` | `release-azure.yml` (deploy step) |
| Deploy health | `/healthz` must report `status: ok` (DB, Redis and both queues), plus the candidate revision's 5xx rate from Azure's built-in `Requests` metric | `release-azure.yml` (canary step) |
| Uptime | An external keyword check on `"status":"ok"`, deliberately outside Azure. Not defined in this repo (unverified) | `monitoring.tf` header |

**Alerts wired in `monitoring.tf`:**

| Alert | Fires when |
|---|---|
| `alert-lynia-prod-job-failed` | Any execution of `caj-lynia-migrate`, `caj-lynia-retention` or `caj-lynia-wallet-integrity` ends `Failed` or `BackoffLimitExceeded` (checked every 15 min) |
| `alert-lynia-prod-<job>-missed` | A scheduled job (retention, wallet integrity) has no successful run in 26 h |
| `alert-lynia-prod-pg-connections` | Postgres `active_connections` > 40 for 15 min (B1ms allows about 50) |
| `budget-lynia-prod` | Spend passes 80% (actual) or 100% (forecast) of the monthly budget |

The wallet-integrity job calls `POST /admin/wallet/integrity-check`; a drift finding is logged by the API
as a `wallet_integrity DRIFT …` WARN line. Without a metrics backend, nothing pages on drift itself: only
a failed or missed job does. Search the logs for that line. Each run also records its counts as a
`wallet.integrity_check` domain event, which the console's Commission page shows ("ledger check"), with a
Run now button.

**To turn the metrics on**, deploy an OTLP collector the API can reach and set
`OTEL_EXPORTER_OTLP_ENDPOINT` on the API revision. Neither exists on Azure today: `infra/azure` defines no
collector, and `release-azure.yml` does not set the variable. `infra/otel-collector/` and
`infra/terraform/monitoring.tf` are leftovers from GCP (Cloud Run sidecar, Google Managed Prometheus) and
do not deploy anywhere.

---

## What the API emits

`apps/api/src/observability/otel.ts` builds one `NodeSDK` that carries both signals:

- **Traces**: inbound and outbound HTTP, auto-instrumented (`HttpInstrumentation`). No hand-written
  business spans. Batched (`BatchSpanProcessor`), never exported inline.
- **Metrics**: the histograms, counters and gauges below (`apps/api/src/observability/metrics.service.ts`),
  pushed every **15 s** (`PeriodicExportingMetricReader`). There is no Prometheus scrape endpoint.

`OTEL_EXPORTER_OTLP_ENDPOINT` drives both: traces go to `<endpoint>/v1/traces`, metrics to
`<endpoint>/v1/metrics`. With it unset (the case in production today, and in dev and CI), the SDK never
loads and every record call is a no-op against the API's NoopMeter.

### Metric → SLO table

Histograms are in milliseconds. p95 targets are **server-side** latencies.

| Metric | Type | Labels | p95 target |
|---|---|---|---|
| `offer_received_latency_ms` | histogram | none | < 2000 ms |
| `position_emit_latency_ms` | histogram | none | < 500 ms |
| `match_select_duration_ms` | histogram | `outcome` | < 300 ms |
| `broadcast_nearby_duration_ms` | histogram | `source` | < 400 ms |
| `otp_verify_duration_ms` | histogram | `result`, `carrier` | < 800 ms |
| `http_request_duration_ms` | histogram | `route`, `method`, `status_class` | < 1000 ms |
| `client_position_glass_latency_ms`, `client_offer_glass_latency_ms`, `client_board_glass_latency_ms` | histogram | `role`, `version` | glass-to-glass |
| `client_apifetch_latency_ms` | histogram | `role`, `version` | client round trip |
| `client_boot_paint_ms`, `client_boot_home_ms`, `client_boot_home_paint_ms` | histogram | `role`, `version` | cold start |
| `client_tap_ack_ms`, `client_nav_open_ms` | histogram | `role`, `version` | tap responsiveness |
| `topup_confirm_lag_ms` | histogram | `rail` | — |
| `queue_jobs` | gauge | `queue`, `state` | — |
| `queue_oldest_overdue_ms` | gauge | `queue` | — |
| `kyc_oldest_pending_age_seconds` | gauge (seconds) | none | — |

Counters: `match_select_total`, `offers_made_total`, `client_samples_dropped_total`,
`otp_requested_total`, `bird_otp_delivered_total`, `bird_otp_delivery_failed_total`,
`whatsapp_otp_delivery_failed_total`, `identity_new_device_verify_total`, `micro_cache_requests_total`,
`wallet_integrity_runs_total`, `wallet_integrity_drift_total`, `throttle_store_errors_total`,
`kyc_webhook_rejected_total`, `kyc_decision_unmatched_total`, `kyc_reconcile_applied_total`,
`kyc_session_minted_total`, `push_undelivered_total`, `rider_online_without_push_token_total`. The
`CounterName` / `HistogramName` types in `metrics.service.ts` are the complete list.

**Client RUM.** The `client_*` histograms are measured on the phone and posted in bounded, authenticated
batches to `POST /client-metrics` (`client-metrics.controller.ts`), then recorded into the same pipeline
(`recordClientSample`). They are the glass-to-glass picture; the server SLOs are the floor.

**What the two "push" metrics measure.** `offer_received_latency_ms` times the rider's `makeOffer`
**server handling** (request → offer committed + `offers:changed` emitted), not when the customer sees it.
`position_emit_latency_ms` times only the in-process `server.emit()` of a rider fix; its 500 ms target is
a regression tripwire, not a delivery SLO.

### Label vocabularies (closed; never ids, phones, coordinates or raw URLs)

- `match_select` `outcome` ∈ `assigned | taken | unavailable | not_open | forbidden | error`.
- `broadcast_nearby` `source` ∈ `redis | pg` (Redis GEOSEARCH vs the Postgres `ST_DWithin` fallback).
- `otp_verify` `result` ∈ `ok | grace_ok | invalid | expired | locked | error`. `grace_ok` is a session
  minted on the post-verify retry grace (client timed out after the server committed).
- `offers_made` `outcome` ∈ `created | conflict | forbidden | error`.
- `http` `status_class` ∈ `2xx | 3xx | 4xx | 5xx`; `route` is the route template (`/orders/:id`).
- Client `role` ∈ `rider | customer`. `version` is the app's `major.minor`, at most 16 distinct values,
  then `other` (`bucketAppVersion` / `boundVersion`).
- `carrier` ∈ `econet | netone | telecel | other` (`apps/api/src/auth/otp-carrier.ts`). On
  `otp_requested_total` and `otp_verify_duration_ms` it is a best guess from the number prefix (ported
  prefixes collapse to `other`). On the two `bird_otp_*` counters it comes from Bird's `mcc_mnc` on the
  delivery webhook, which is ground truth.
- `micro_cache_requests_total` `cache` ∈ `nearby_count | pickup_photo_url | merchant_photo_url |
  proof_photo_url | swap_photo_url`; `outcome` ∈ `hit | l2_hit | miss | coalesced | error`.
- `queue` ∈ `offer-expiry | rating-autoclose`; `state` ∈ `waiting | active | delayed | failed | paused`
  (`common/queue-metrics.ts`). "Overdue" is measured against each job's **scheduled** fire time, so a
  healthy queue reads about 0. A Redis error or a sample slower than 5 s skips that observation rather
  than reporting a false 0.
- `topup_confirm_lag_ms` `rail` ∈ `ecocash | innbucks | omari | manual`, unknown values become `other`.
  Recorded once per top-up by the confirm that wins.
- `identity_new_device_verify_total` `dormant` ∈ `true | false` (no session in 90 days); `device` ∈
  `new | absent` (`absent` = no `x-device-id` header, which is a client defect to chase).
- Exception: `whatsapp_otp_delivery_failed_total` `reason` is Meta's raw error title. It is bounded only by
  Meta's error catalogue.

### Histogram buckets

Set per instrument in `otel.ts`, placed around each SLO so p95 has resolution where the threshold sits.

| Metric | Buckets (ms) |
|---|---|
| `position_emit_latency_ms` | 50, 100, 200, 300, 500, 750, 1000 |
| `offer_received_latency_ms` | 250, 500, 1000, 1500, 2000, 3000, 5000 |
| `match_select_duration_ms` | 50, 100, 200, 300, 500, 1000 |
| `broadcast_nearby_duration_ms` | 50, 100, 200, 300, 400, 600, 1000 |
| `otp_verify_duration_ms` | 100, 250, 500, 800, 1200, 2000 |
| `http_request_duration_ms` | 50, 100, 250, 500, 1000, 2000, 5000 |
| `client_{position,offer,board}_glass_latency_ms` | 100, 250, 500, 1000, 2000, 3000, 5000, 10000 |
| `client_apifetch_latency_ms` | 50, 100, 250, 500, 1000, 2000, 5000, 10000 |
| `client_boot_*_ms` | 500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000 |
| `client_tap_ack_ms` | 8, 16, 32, 50, 100, 200, 400, 800, 2000 |
| `client_nav_open_ms` | 100, 200, 350, 500, 800, 1200, 2000, 3500, 6000 |
| `topup_confirm_lag_ms` | 5 s, 15 s, 30 s, 1 m, 2 m, 5 m, 10 m, 30 m, 1 h |

---

## Alert definitions for when a metrics backend exists

None of these are deployed. They are written in PromQL for any Prometheus-compatible backend. Alert on
p95/p99, never the mean.

```promql
# p95 of a histogram (swap the metric name; add a label to `by (le, …)` to split)
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le))

# page: HTTP p95 over the 1 s SLO for 10 min
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le)) > 1000

# error ratio off a counter
sum(rate(match_select_total{outcome="error"}[5m])) / sum(rate(match_select_total[5m]))
```

Suggested thresholds: **page** at p95 > SLO for 10 min; **warn** at p99 > 2× SLO.

| Alert | Condition | What to do |
|---|---|---|
| Wallet ledger drift | `sum(increase(wallet_integrity_drift_total[24h])) > 0` | Pull the `wallet_integrity DRIFT …` log line, find the rider or top-up, reconcile before the next payout. Never dismiss. |
| Integrity job not running | `sum(increase(wallet_integrity_runs_total[25h])) < 1` | Check `caj-lynia-wallet-integrity` (already alerted by `monitoring.tf`). |
| API 5xx > 2% | `http_request_duration_ms` count with `status_class="5xx"` / total > 0.02 | Usually a bad deploy: **Rollback (Azure)**, then diagnose from Sentry. |
| Offer-make errors > 5% | `offers_made_total{outcome="error"}` ratio | Riders can't bid. `conflict`/`forbidden` are normal; `error` is not. |
| OTP delivery failures | `sum(rate(bird_otp_delivery_failed_total[5m])) > 0.2` (or the WhatsApp counter) | Users can't get codes. Split by `status`: `rejected` is usually account-level (balance, sender); `undelivered`/`expired` point at the carrier. |
| Per-carrier deliverability | failed / (delivered + failed) by `carrier` over 15 m > 0.3 | One network degrading inside a healthy total. |
| Dormant-account device rebind | `sum(increase(identity_new_device_verify_total{dormant="true",device="new"}[24h])) > 5` | Possible SIM recycle. Read the `POSSIBLE SIM RECYCLE` WARN lines; freeze payouts on affected accounts with a balance or KYC record before rebinding. |
| Queue stalled | `max by (queue) (queue_oldest_overdue_ms) > 120000` for 10 m | Workers stopped. Only the DB reconcilers (2 min offers / 15 min deliveries) still move orders. Check Redis and the logs for `queue error` / `worker error`. |
| Queue backlog | `max by (queue) (queue_jobs{state="waiting"}) > 100` for 10 m | Jobs consumed slower than they arrive. Check that queue's `failed` jobs. |
| Top-up confirm lag | p95 of `topup_confirm_lag_ms` over 30 m > 600000 | Riders paid but still show pending. Split by `rail`; check the rail and its confirmation path. |

Thresholds are pilot-volume guesses; re-baseline with real traffic.

---

## Product analytics (PostHog, mobile)

PostHog measures what people do in the app (screens, funnels, retention). The integration is key-gated
(`apps/mobile/src/telemetry/analytics.tsx`): with no key it mounts nothing and makes no network calls.
`EXPO_PUBLIC_POSTHOG_API_KEY` and `EXPO_PUBLIC_POSTHOG_HOST` (EU cloud) are set in the EAS `preview` and
`production` environments (set up with `npx eas-cli integrations:posthog:connect` from `apps/mobile/`).

What it sends: screen views as route **patterns** (`/order/[id]`, never ids) and app-lifecycle events.
Touch autocapture is off. Not installed on purpose:

- **Session replay** needs `posthog-react-native-session-replay`. Replaying KYC or phone screens is a
  privacy decision, not a default.
- **Error tracking** needs `@posthog/cli`, a personal API key and the `posthog-react-native/expo` plugin,
  whose Gradle hook fails the release build when the CLI or key is missing. Add the plugin and the
  dependency together if it is ever provisioned.

The PostHog SDK is native: adding or removing it shifts the fingerprint runtime version, so it ships in a
store build, not an OTA update.
