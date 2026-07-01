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
