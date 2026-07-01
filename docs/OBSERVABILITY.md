# Observability — latency SLOs & metrics

Lynia's API emits **metrics only** in this batch (no custom spans). Instruments are OpenTelemetry
histograms/counters exported over **OTLP/HTTP push** to whatever collector
`OTEL_EXPORTER_OTLP_ENDPOINT` points at. There is **no Prometheus scrape endpoint** — the API pushes;
the collector (Cloud Run → Cloud Monitoring, or any OTLP sink) pulls it forward.

The metrics ride the **same `NodeSDK`** as tracing (`apps/api/src/observability/otel.ts`) and are only
wired when an endpoint is configured, so a dev/test boot with no endpoint stays light and every record
is a cheap no-op against the API NoopMeter.

## Collector configuration

- `OTEL_EXPORTER_OTLP_ENDPOINT` drives **both** signals off one base URL:
  - traces → `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`
  - metrics → `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`
- Export cadence: metrics are batched and pushed every **15 s** (`PeriodicExportingMetricReader`).
- Traces use the `NodeSDK` default `BatchSpanProcessor` (batched, never a synchronous/inline export).
- On Cloud Run scale-down (`SIGTERM`) the SDK `shutdown()` flushes the last metric + span batch.
- With `OTEL_EXPORTER_OTLP_ENDPOINT` unset the metrics tree never loads (NoopMeter) — safe for local/CI.

## Metric → SLO table

All histograms are in **milliseconds** (`unit: "ms"`). p95 targets are **server-side** latencies.

| Metric                          | Type      | Unit | Labels                          | p95 target |
| ------------------------------- | --------- | ---- | ------------------------------- | ---------- |
| `offer_received_latency_ms`     | histogram | ms   | (none)                          | < 2000 ms  |
| `position_emit_latency_ms`      | histogram | ms   | (none)                          | < 500 ms   |
| `match_select_duration_ms`      | histogram | ms   | `outcome`                       | < 300 ms   |
| `broadcast_nearby_duration_ms`  | histogram | ms   | `source`                        | < 400 ms   |
| `otp_verify_duration_ms`        | histogram | ms   | `result`                        | < 800 ms   |
| `http_request_duration_ms`      | histogram | ms   | `route`, `method`, `status_class` | < 1000 ms |
| `match_select_total`            | counter   | 1    | `outcome`                       | —          |
| `offers_made_total`             | counter   | 1    | `outcome`                       | —          |

> **Scope of the two "push" metrics** (both are single-process spans, not glass-to-glass):
> `offer_received_latency_ms` times the rider's `makeOffer` **server handling** (request → offer row
> committed + `offers:changed` emitted) — i.e. "offer *made* server-side", **not** when the customer's
> screen renders it. `position_emit_latency_ms` times only the in-process `server.emit()` of a rider
> fix (typically sub-millisecond); its `< 500 ms` target is a loose regression tripwire, not a delivery
> SLO. Customer-perceived latency for both needs the client RUM signal noted at the bottom.

### Fixed label vocabularies (bounded cardinality — never ids/phones/lat-lng/raw-urls)

- `match_select` `outcome` ∈ `assigned | taken | unavailable | not_open | forbidden | error`
- `broadcast_nearby` `source` ∈ `redis | pg` (GEOSEARCH prefilter vs the PG `ST_DWithin` fallback)
- `otp_verify` `result` ∈ `ok | invalid | expired | locked | error`
- `offers_made` `outcome` ∈ `created | conflict | forbidden | error`
- `http` `status_class` ∈ `2xx | 3xx | 4xx | 5xx`; `route` is the **route template** (e.g. `/orders/:id`),
  **never** the raw URL — that keeps the histogram's cardinality bounded.

### Explicit histogram buckets

Buckets are bound per instrument via Views in `otel.ts`, chosen so `histogram_quantile` has resolution
around each metric's p95 SLO:

| Metric                         | Buckets (ms)                              |
| ------------------------------ | ----------------------------------------- |
| `position_emit_latency_ms`     | 50, 100, 200, 300, 500, 750, 1000         |
| `offer_received_latency_ms`    | 250, 500, 1000, 1500, 2000, 3000, 5000    |
| `match_select_duration_ms`     | 50, 100, 200, 300, 500, 1000              |
| `broadcast_nearby_duration_ms` | 50, 100, 200, 300, 400, 600, 1000         |
| `otp_verify_duration_ms`       | 100, 250, 500, 800, 1200, 2000            |
| `http_request_duration_ms`     | 50, 100, 250, 500, 1000, 2000, 5000       |

## PromQL — p95 per histogram

```promql
# Offer-make end-to-end
histogram_quantile(0.95, sum(rate(offer_received_latency_ms_bucket[5m])) by (le))

# Position emit (rider fix → customer push; measured around the emit only, before the DB write)
histogram_quantile(0.95, sum(rate(position_emit_latency_ms_bucket[5m])) by (le))

# Offer selection (guarded CAS transaction)
histogram_quantile(0.95, sum(rate(match_select_duration_ms_bucket[5m])) by (le))

# Nearby-rider broadcast resolution
histogram_quantile(0.95, sum(rate(broadcast_nearby_duration_ms_bucket[5m])) by (le))

# OTP verify
histogram_quantile(0.95, sum(rate(otp_verify_duration_ms_bucket[5m])) by (le))

# HTTP request latency
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le))
```

Split any of these by a label with `by (le, <label>)` — e.g. `by (le, route)` for per-route HTTP p95,
or `by (le, source)` to compare the Redis vs PG nearby path.

## Alerting

**Alert on p95/p99, never the mean** — a healthy mean routinely hides a tail that misses the SLO.

```promql
# Example: page when HTTP p95 breaches the 1 s SLO for 10 minutes
histogram_quantile(0.95, sum(rate(http_request_duration_ms_bucket[5m])) by (le)) > 1000

# Example: warn when offer-select p99 doubles its SLO
histogram_quantile(0.99, sum(rate(match_select_duration_ms_bucket[5m])) by (le)) > 600
```

Suggested thresholds: **page** at p95 > SLO sustained for 10 min; **warn** at p99 > 2× SLO. Pair the
latency alerts with error-rate alerts off the counters, e.g.
`sum(rate(match_select_total{outcome="error"}[5m])) / sum(rate(match_select_total[5m]))`.

## Caveat — these are SERVER-side latencies

Every histogram here measures time **inside the API process** (or, for `position_emit_latency_ms`, the
in-process emit). They do **not** capture network RTT to the device or client-side render time.
**Glass-to-glass** latency — what the rider/customer actually perceives — needs a separate **client RUM**
signal instrumented in the apps. Treat the server SLOs as a floor, not the full picture.

## Production activation (GCP)

The app-side metrics are **dormant until `OTEL_EXPORTER_OTLP_ENDPOINT` is set** (with no endpoint the
OTEL SDK is a no-op — dev/test/CI stay light). Activation adds an **OpenTelemetry Collector sidecar**
to the Cloud Run service: the API posts OTLP to `http://localhost:4318`, and the collector (which owns
the Google auth via ADC) exports **traces → Cloud Trace** and **metrics → Cloud Monitoring** (Managed
Service for Prometheus, so the PromQL above resolves directly). The app stays vendor-neutral; the
collector is the only Google-aware piece.

Artifacts in this repo:

- `infra/otel-collector/config.yaml` — the collector pipeline (OTLP receiver → `googlecloud` traces +
  `googlemanagedprometheus` metrics; project auto-detected, nothing to hardcode).
- `infra/otel-collector/service.yaml.template` — a Cloud Run **multi-container** service manifest
  (API ingress container + collector sidecar) with `<PLACEHOLDERS>` mirroring the `gcloud run deploy`
  flags in `.github/workflows/release.yml`.
- `infra/terraform/monitoring.tf` — the SLO **alert policies** (PromQL conditions, one per metric).
- `infra/otel-collector/dashboard.json` — an importable p95 dashboard (not Terraform-managed).
- `infra/terraform/iam.tf` — the runtime SA gains `roles/monitoring.metricWriter` + `roles/cloudtrace.agent`.

### Steps (founder, one-time)

1. **Terraform** (from `infra/terraform/`): `terraform plan` then `terraform apply`. This enables the
   `monitoring`/`cloudtrace` APIs, grants the two runtime-SA roles, and creates the alert policies.
   PromQL alert conditions validate on syntax alone, so this applies cleanly **before** any metric
   exists. To actually get paged, create a notification channel (email/SMS) and pass its id via
   `alert_notification_channels` (default `[]` = fires in-console, pages no one).
2. **Collector config secret**: store the pipeline so the sidecar can mount it —
   `gcloud secrets create otel-collector-config --data-file=infra/otel-collector/config.yaml`
   (and grant the runtime SA `secretAccessor` on it, as the other secrets already are in `secrets.tf`).
3. **Deploy the sidecar**: fill the `<PLACEHOLDERS>` in `service.yaml.template` (copy the current flag
   values from `release.yml` + the deployed image tag), then
   `gcloud run services replace infra/otel-collector/service.yaml --region <REGION> --project <PROJECT_ID>`.
   This sets `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` on the API container and starts the
   collector. Roll back instantly by re-running the release workflow (redeploys the single-container form).
4. **Import the dashboard**:
   `gcloud monitoring dashboards create --config-from-file=infra/otel-collector/dashboard.json --project <PROJECT_ID>`,
   then hand-tune in the console.
5. **Verify** in Metrics Explorer's **PromQL** tab that series like `offer_received_latency_ms_bucket`
   are arriving (GMP can sanitize names; confirm the real series before trusting the alerts).

> **Operational drift:** the sidecar lives in the `services replace` manifest, **not** in the release
> workflow (which still deploys a single container). After any subsequent normal `/ship` deploy the
> sidecar is dropped and step 3 must be re-applied — or, once the manifest is battle-tested, fold the
> sidecar into `release.yml`. `OTEL_EXPORTER_OTLP_ENDPOINT` deliberately lives with the sidecar so
> "endpoint set" and "collector present" can never diverge.
