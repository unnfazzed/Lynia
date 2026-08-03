# Observability — latency SLOs & metrics

Lynia's API emits **metrics + auto HTTP traces** (no custom app spans yet — the `OTLPTraceExporter`
and `HttpInstrumentation` are wired in `apps/api/src/observability/otel.ts`, so inbound/outbound HTTP
is auto-traced; there are no hand-instrumented business spans). Instruments are OpenTelemetry
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
| `client_position_glass_latency_ms` | histogram | ms | `role`, `version`             | (glass-to-glass) |
| `client_offer_glass_latency_ms` | histogram | ms   | `role`, `version`               | (glass-to-glass) |
| `client_board_glass_latency_ms` | histogram | ms   | `role`, `version`               | (glass-to-glass) |
| `client_apifetch_latency_ms`    | histogram | ms   | `role`, `version`               | (client RTT)     |
| `match_select_total`            | counter   | 1    | `outcome`                       | —          |
| `offers_made_total`             | counter   | 1    | `outcome`                       | —          |
| `client_samples_dropped_total`  | counter   | 1    | `role`                          | —          |
| `whatsapp_otp_delivery_failed_total` | counter | 1 | `reason`                     | —          |
| `bird_otp_delivery_failed_total` | counter | 1 | `status`, `code`                  | —          |
| `identity_new_device_verify_total` | counter | 1 | `dormant`, `device`             | —          |
| `micro_cache_requests_total`    | counter   | 1    | `cache`, `outcome`               | —          |
| `queue_jobs`                    | gauge     | 1    | `queue`, `state`                 | —          |
| `queue_oldest_overdue_ms`       | gauge     | ms   | `queue`                          | —          |
| `topup_confirm_lag_ms`          | histogram | ms   | `rail`                           | —          |

> **Client RUM (present, not future).** The four `client_*_latency_ms` histograms and the
> `client_samples_dropped_total` counter are the **glass-to-glass** signal — the mobile app measures
> perceived latency (skew-clamped WS glass-to-glass for position/offer/board, skew-free `apiFetch`
> round-trips) and posts a bounded, auth'd batch to `POST /client-metrics`
> (`apps/api/src/observability/client-metrics.controller.ts`), which records them into the same OTEL
> pipeline as the server SLOs (`recordClientSample` in `metrics.service.ts`). These turn the
> server-only SLOs below into true end-to-end numbers.

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
- Client RUM `version` is the app's `major.minor` (else `other`), and is itself bounded: at most 16
  distinct version buckets are ever admitted (`bucketAppVersion`/`boundVersion` in `metrics.service.ts`).
- `whatsapp_otp_delivery_failed_total` `reason` is the **exception** to "bounded cardinality" above:
  it's Meta's raw `errors[0].title` string from the webhook payload (`whatsapp-webhook.ts`), with no
  code-enforced cap analogous to `bucketAppVersion` — bounded in practice only by Meta's own error
  catalog, not by Lynia.
- `micro_cache_requests_total` `cache` ∈ `nearby_count | pickup_photo_url`; `outcome` ∈
  `hit | l2_hit | miss | coalesced | error` (both closed vocabularies, see `docs/PERFORMANCE.md`).
- `queue_jobs` / `queue_oldest_overdue_ms` `queue` ∈ `offer-expiry | rating-autoclose` (the two BullMQ
  queues); `state` ∈ `waiting | active | delayed | failed | paused` (`completed` is omitted — jobs are
  removed on completion, so the series would always read ~0). Both are **observable gauges** sampled at
  each 15 s export by `sampleQueueDepth` (`common/queue-metrics.ts`), registered per queue via
  `MetricsService.registerQueueDepthObserver`. **"Overdue" is measured against each job's scheduled
  fire time** (`enqueue + delay`), not its enqueue time — the expiry jobs are delayed ~90 s by design,
  so a healthy queue reads ~0 and any sustained positive value means the workers stopped processing.
  A Redis error or a >5 s sample skips that cycle's observation (an absent point is honest; a
  fabricated 0 would read "healthy" during the exact outage the alert exists for).
- `topup_confirm_lag_ms` `rail` ∈ `ecocash | innbucks | omari | manual` (the `TopupRail` enum),
  bounded at the meter — an unexpected DB value collapses to `other`. Recorded exactly once per
  top-up, by the `creditFromTopup` call that wins the confirm CAS, measuring
  `TopUp.initiatedAt → resolvedAt`. The admin manual-credit path never records (it creates the intent
  already-confirmed; there is no rail wait to measure).
- `identity_new_device_verify_total` `dormant` ∈ `true | false` — `true` means the account had no
  session newer than 90 days when the unrecognised device verified. Deliberately a *label*, not two
  metrics: the ratio is the signal, and it's only readable if both arms share a series. `device` ∈
  `new | absent` — `new` is an id we have never seen on this account, `absent` is **no** `x-device-id`
  at all. The `absent` arm exists because the check is fail-safe: an omitted header used to skip
  recycle detection outright, so one dropped header silenced the alarm. Absence of an id is not
  evidence of a known device, so it counts. Sustained `absent` traffic means a client is not sending
  the header — chase the client, don't raise the alert threshold.

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
| `client_position_glass_latency_ms` | 100, 250, 500, 1000, 2000, 3000, 5000, 10000 |
| `client_offer_glass_latency_ms`    | 100, 250, 500, 1000, 2000, 3000, 5000, 10000 |
| `client_board_glass_latency_ms`    | 100, 250, 500, 1000, 2000, 3000, 5000, 10000 |
| `client_apifetch_latency_ms`       | 50, 100, 250, 500, 1000, 2000, 5000, 10000   |
| `topup_confirm_lag_ms`             | 5s, 15s, 30s, 60s, 2m, 5m, 10m, 30m, 1h (in ms) |

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

### Business-vital alerts (roadmap 1.5)

Latency SLOs tell you the API is slow; these tell you the **marketplace is unhealthy** — the signals a
courier operator actually cares about. All live in `infra/terraform/monitoring.tf` under the same
`slo_alerts_enabled` gate and share `alert_notification_channels`. Each has a runbook line here:

| Alert | Condition (PromQL) | Runbook |
|---|---|---|
| **Wallet ledger integrity drift** | `sum(increase(wallet_integrity_drift_total[24h])) > 0` | The nightly sweep (`POST /admin/wallet/integrity-check`) found a completeness violation. Pull the WARN log line (`wallet_integrity DRIFT …`) for the sample refs, identify the rider/top-up, and reconcile **before the next payout**. Never dismiss — this is real money visibility. |
| **Integrity job not running** | `sum(increase(wallet_integrity_runs_total[25h])) < 1` | The denominator guard: a 0-drift reading is only trustworthy if the job ran. Check Cloud Scheduler `lynia-wallet-integrity` and the endpoint's auth (AdminOrSchedulerGuard / runtime SA). |
| **API 5xx rate > 2%** | `…{status_class="5xx"}… > 0.02` | Usually a bad deploy. First mitigation: re-point traffic to the previous Cloud Run revision (`rollback.yml`), then diagnose from the Sentry release + correlation IDs. |
| **Offer-make error rate > 5%** | `offers_made_total{outcome="error"}` ratio | Riders can't bid. Distinct from `conflict`/`forbidden` (normal race/permission outcomes). Check the offers module + DB. |
| **WhatsApp OTP delivery failures** | `sum(rate(whatsapp_otp_delivery_failed_total[5m])) > 0.2` | Users can't receive login codes. Check Meta Cloud API status + `WHATSAPP_*` config. |
| **Bird OTP delivery failures** | `sum(rate(bird_otp_delivery_failed_total[5m])) > 0.2` | Users can't receive login codes on the SMS channel. The send returned 202, so this is the ONLY signal. Split by `status`: `rejected` is usually account-level (wallet balance, no eligible sender → `code=E12003`), `undelivered`/`expired` point at the carrier (Econet) rather than at us. `bird sms get <sms_id>` shows the per-message timeline. |

| **Dormant-account device rebind spike** | `sum(increase(identity_new_device_verify_total{dormant="true",device="new"}[24h])) > 5` | Phone is the account key, so an account dormant >90d re-verifying from an unseen device is the exact shape a **carrier number recycle** takes — the person who passed the OTP may not be the person who owns the account (P2-8). One a week is normal (reinstall, new handset). A cluster is not: pull the `identity: account … POSSIBLE SIM RECYCLE` WARN lines, check whether the accounts carry a wallet balance or KYC record, and freeze payouts on any that do before deciding to rebind. Scoped to `device="new"` on purpose: the `absent` arm is a *client* defect (someone stopped sending `x-device-id`) and would otherwise drown this signal — watch it separately, and fix the client rather than the threshold. Threshold is a pilot-volume guess — re-baseline once a month of data exists. |
| **Queue stalled (jobs overdue)** | `max by (queue) (queue_oldest_overdue_ms) > 120000` for 10m | Expiry/auto-close jobs are sitting past their **scheduled** fire time — the workers stopped processing (Redis wedged, worker dead) and only the DB reconciler sweeps (2 min offers / 15 min deliveries) are advancing orders. Customers see countdowns freeze at 0:00 until a sweep lands. Check Memorystore and the API logs for `queue error` / `worker error` lines. |
| **Queue backlog** | `max by (queue) (queue_jobs{state="waiting"}) > 100` for 10m | Jobs are consumed slower than they arrive (slow handler, retry storm, partial worker outage) — distinct from the stall alert, where nothing moves at all. Split by `queue` to find the lane; check that worker's `failed` jobs. Threshold is a pilot-volume guess — re-baseline with real load. |
| **Top-up confirm lag p95 > 10 min** | `histogram_quantile(0.95, sum(rate(topup_confirm_lag_ms_bucket[30m])) by (le)) > 600000` | Riders have paid but their balance still shows pending — trust in the float erodes fast. Split by `rail`; check the rail provider's status and the confirmation webhook/poller path before support tickets arrive. |

> **Gate note:** the three queue/top-up policies above live behind **`queue_alerts_enabled`**
> (`monitoring.tf`), a separate Terraform gate from `slo_alerts_enabled`, because their series ship
> with the 2026-08-02 API release: a stack that already flipped `slo_alerts_enabled` must keep
> applying cleanly until the new series exist in GMP (metric-name validation 400s otherwise). Flip it
> using the same verify-then-apply choreography as step 6 below.

## Caveat — these are SERVER-side latencies

The server histograms here measure time **inside the API process** (or, for `position_emit_latency_ms`,
the in-process emit). They do **not** capture network RTT to the device or client-side render time.
**Glass-to-glass** latency — what the rider/customer actually perceives — is captured by the
**client RUM** histograms (`client_*_latency_ms`) the mobile app now posts to `POST /client-metrics`
(see the metric table above). Treat the server SLOs as the floor and the client RUM as the full picture.

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
   `monitoring`/`cloudtrace` APIs and grants the two runtime-SA roles. **Leave `slo_alerts_enabled` at
   its default `false` for now** — Cloud Monitoring validates the metric *names* inside a PromQL alert
   condition at policy-creation time (a `400 "The following PromQL metric(s) are invalid"`, observed on
   the 2026-07-08 apply), so the SLO alert policies (`monitoring.tf`) **cannot be created until the
   collector has shipped series to GMP** — that is step 6 below, after verification. To actually get
   paged then, also create a notification channel (email/SMS) and pass its id via
   `alert_notification_channels` (default `[]` = fires in-console, pages no one).
2. **Collector config secret** — created by the same `terraform apply` (`infra/terraform/otel.tf`
   populates `otel-collector-config` from `infra/otel-collector/config.yaml` and grants the runtime SA
   `secretAccessor`). Pipeline changes ship via plan/apply, never hand-run `gcloud secrets versions add`.
3. **Deploy the sidecar — flag-driven via the release workflow (folded in 2026-07-13)**: ensure the
   `dockerhub-remote` Artifact Registry mirror exists (runbook §3 has the one-liner), set the
   `OTEL_SIDECAR_ENABLED=true` repo Variable, and re-run **Release (Cloud Run)**. When the flag is true,
   release.yml deploys **both** containers explicitly (`--container api … --container otel-collector …`)
   and sets `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` on the API — the revision spec is fully
   code-driven, so a hand-edited or broken sidecar is REPLACED on the next release, never silently
   inherited. (`service.yaml.template` is retained only as a manual fallback.) To roll back to
   single-container, **remove the sidecar explicitly and clear the variable** — clearing the variable
   alone is NOT enough, because the single-container `gcloud run deploy` path preserves existing sidecars
   (and the orphaned-sidecar guard will then block deploys until it is removed):
   `gcloud run services update lynia-api --region <REGION> --remove-containers otel-collector`.
4. **Import the dashboard**:
   `gcloud monitoring dashboards create --config-from-file=infra/otel-collector/dashboard.json --project <PROJECT_ID>`,
   then hand-tune in the console.
5. **Verify** in Metrics Explorer's **PromQL** tab that series like `offer_received_latency_ms_bucket`
   are arriving (GMP can sanitize names; confirm the real series before trusting the alerts). Note the
   business-event histograms (offer/match/position) only emit under real or synthetic load, whereas
   `http_request_duration_ms` / `otp_verify_duration_ms` appear on any traffic.
6. **Enable the SLO alerts**: only once step 5 confirms the series exist, set `slo_alerts_enabled = true`
   and `terraform apply` again. The metric names now resolve, so the policies in `monitoring.tf` create
   cleanly. This is the step the `slo_alerts_enabled` gate (`variables.tf`, default `false`) exists for —
   flipping it before the series exist re-triggers the `400 PromQL metric(s) are invalid` from step 1.
   The queue/top-up policies have their **own** gate, `queue_alerts_enabled`, with the same
   choreography: verify `queue_jobs` / `queue_oldest_overdue_ms` (present on any boot with Redis) and
   `topup_confirm_lag_ms` (needs at least one confirmed top-up) in Metrics Explorer first, then flip
   and re-apply.

> **Operational drift (corrected 2026-07-10; resolved 2026-07-13):** the original design deployed the
> sidecar with a hand-applied `services replace` manifest that every subsequent `gcloud run deploy
> --image` silently *inherited* — so a broken collector wedged **all** deploys at container-start (this
> is exactly what happened 2026-07-08→07-10: ~15 straight failed prod deploys, opaque "container failed
> to start on :3000", while prod safely kept serving the last single-container revision). Now the
> sidecar is **part of release.yml** behind `OTEL_SIDECAR_ENABLED`: flag on → both containers are
> deployed explicitly from code every release; flag off → release.yml refuses to deploy while an
> unexpected sidecar is present (and dumps the failed revision's containers + logs on any failure).
> `OTEL_EXPORTER_OTLP_ENDPOINT` deliberately lives with the sidecar branch so "endpoint set" and
> "collector present" can never diverge.

## Product analytics (PostHog, mobile)

Everything above measures **how the system behaves**; PostHog measures **what people do in the app**
(screens, funnels, retention). The mobile app carries a key-gated PostHog integration
(`apps/mobile/src/telemetry/analytics.tsx`): with no key configured it mounts nothing — no SDK init,
no network — so dev, CI, the QA APK, and unprovisioned builds are untouched.

**Activation — ✅ done (verified 2026-08-03):** the connect flow described below has been run —
`EXPO_PUBLIC_POSTHOG_API_KEY` + `EXPO_PUBLIC_POSTHOG_HOST` (EU cloud) are present in the EAS
`preview` and `production` environments, so the next EAS build lights analytics up with no code
change. For reference, the original one-time step was: run `npx eas-cli
integrations:posthog:connect` from `apps/mobile/` (interactive; needs `eas login`); it links the
EAS project to a PostHog org/project and syncs the two vars (plus `.env.local` for local dev).
When prompted for features pick **Analytics only** for now:

- **Session replay** needs the extra native `posthog-react-native-session-replay` package (not
  installed) — decide deliberately; replay of KYC/phone screens is a privacy call, not a default.
- **Error tracking** needs `@posthog/cli`, a personal API key, and the `posthog-react-native/expo`
  config plugin. The plugin is deliberately NOT in `app.config.ts`: its gradle hook runs
  `posthog-cli` unconditionally on every release bundle and **fails the build** when the CLI/key
  are absent. Add the plugin + dep together if/when error tracking is provisioned.

What ships today when enabled: screen views as low-cardinality route **patterns** (`/order/[id]`,
never concrete ids) and app-lifecycle events (installed/updated/opened/backgrounded — DAU and
retention). Touch autocapture is off by design (noise + element text from KYC/phone screens).
Note the SDK packages are a **native-layer change**: the first analytics-enabled release shifts the
`fingerprint` runtime version, so it ships as a store build, not an OTA update.
