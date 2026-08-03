# LC loop D report — 2026-08-03e — D-T4 infra soundness I (READ-ONLY)

Territory: `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D, **D-T4** — "Infra soundness I
(READ-ONLY → report + ledger): failure domains + scaling — the Redis-down/degraded behavior seam, DB
connection math, health checks, alert coverage." Per the program doc and `docs/ROUTINES.md`'s
sensitive/infra doctrine, this territory is explicitly read-only for the LC lanes: findings are ledgered
OPEN (owner: founder) with a report section, and neither `infra/terraform/**` nor application code was
edited this run — including findings that touch app-code files (the Redis-usage findings below), since
several of them are product/reliability-policy decisions (fail-open vs fail-closed trade-offs) rather
than unambiguous bugs a lane should fix unilaterally.

**How this ran:** three parallel read-only research passes (Explore agents) — Redis failure-domain trace,
DB connection-pool arithmetic, and health-check/alert-coverage inventory — each grounded in the actual
code/Terraform, cross-checked against `docs/KNOWN_BUGS.md` and the program doc's Day-0 sweep to avoid
re-reporting anything already fixed (`LC-C01` Redis hang, `LC-INF1..4`, `DS-04`, `DS15-08`). Nine new
findings ledgered `LC-D19`–`LC-D27`; zero were already covered by an existing ledger row (though several
refine or extend one — noted inline).

## 1. Redis-down / degraded-behavior seam

The prior CRITICAL finding here (`LC-C01`, unbounded Redis command queuing hanging the live API) is
confirmed **fixed** — the opt-in `REDIS_FAIL_FAST` profile (2s `commandTimeout`, `enableOfflineQueue:
false`) is applied to every request-path Redis client (OTP/rate-limit, MicroCache L2, tracking
geo/position). Order-acceptance/matching has no Redis dependency for correctness at all — it's pure
Postgres CAS + a unique constraint, so Redis flaking mid-accept cannot cause a double-accept. Every
"claim"-shaped Redis helper in `tracking.service.ts` is deliberately designed to fail toward duplication
rather than loss, by explicit code comment.

Two residual risks, both ledgered:

- **`LC-D19`** — the shared OTP-store/rate-limiter Redis client backs the global `@Throttle` guard AND OTP
  send/verify with no internal try/catch, so a Redis outage 500s (bounded to ~2s, not a hang) every
  `@Throttle`-decorated route — including `sos-raise` — instead of failing the rate-limiter open, which is
  the design choice every other Redis consumer in this codebase makes. Broad blast radius on a
  safety-relevant path; not confirmed as an accepted trade-off anywhere in the docs.
- **`LC-D20`** — the Socket.IO Redis adapter's `fetchSockets()` call sites have no explicit local timeout
  and their behavior under a genuine Redis (not just peer-instance) outage wasn't empirically verified;
  `scanPresence`'s 30s sweep also has no re-entrancy guard. Exposure is muted (none of these are on a
  synchronous request path) but unverified.

## 2. DB connection math

Production's Prisma pool defaults to **10 connections/instance** (no env/URL override set anywhere in the
repo) times Cloud Run's **`--max-instances 10`** (the exact `LC-INF3` fix, confirmed still only setting
`--max-instances`, not the `--concurrency` its own ledger description named) yields **up to 100 concurrent
Postgres backends**. Cloud SQL's `db-custom-1-3840` tier's own `max_connections` is not overridden anywhere
in `sql.tf` and is commonly ~100 for this memory tier by Google's default formula — **unconfirmed against
the live instance** from Terraform alone. If so, the two independently-chosen numbers (10×10 pool ceiling,
~100 DB ceiling) coincide with **zero headroom** for Postgres's reserved superuser connections, migration
runs, or any admin session. No connection pooler (PgBouncer or similar) sits in front of Postgres — only
the Cloud SQL Auth Proxy TLS tunnel, which doesn't multiplex connections. Ledgered as `LC-D21`.

Separately, a pool-acquire timeout or query timeout today surfaces as a generic, opaque `500` (the
catch-all exception filter coerces any non-`HttpException` the same way) rather than a distinguishable
`503`/`Retry-After` — self-recovering, but an observability/UX gap for clients that already have retry
logic for other transient failures. Ledgered as `LC-D22`.

## 3. Health checks

`/healthz` (`apps/api/src/health/health.controller.ts`, `health.service.ts`) is a genuine deep check — real
DB (`SELECT 1`) and Redis pings, each raced against a 2s local timeout (`DS15-08`/`DS-04`, both already
fixed) so the probe fails fast under contention rather than queuing. DB-down → `503`; Redis-down →
`200 degraded` (deliberate: a Redis blip shouldn't pull every instance from rotation). This is wired into
exactly one external signal: the `LC-INF4` black-box Cloud Monitoring uptime check (already fixed) plus a
canary-promotion poll in `release.yml`. No Terraform-managed Cloud Run liveness/startup probe exists —
Cloud Run isn't Terraform-managed at all (deployed imperatively via `gcloud` in `release.yml`), and no
`--liveness-probe`/`startup-probe` flags are set on either deploy path, so an individual unhealthy instance
has no platform-level auto-restart; recovery depends entirely on the 60s-interval external uptime check.
Ledgered as `LC-D23`. `apps/admin` has no health endpoint of its own (relies on the API's); `apps/merchant`
has a static inert stub, explicitly documented as not yet wired to any check.

## 4. Alert coverage

Every alert policy lives in `infra/terraform/monitoring.tf`. Three gaps found with no existing coverage
anywhere: **no Cloud SQL system-metric alert** (CPU/disk/connections — `LC-D24`), **no Redis/Memorystore
alert** (latency/evictions/availability — `LC-D25`), and **two of three Cloud Scheduler jobs
(`retention_purge`, `settlement_autopause`) have no failure/non-execution alert** at all (`LC-D27`). More
urgent: every meaningfully-specific alert (`api_5xx_rate`, `offers_error_rate`, six `slo_p95` latency
policies, wallet-integrity, OTP-delivery, queue backlog/stall) is gated off by default
(`slo_alerts_enabled`/`queue_alerts_enabled` both default `false`) pending confirmed-live metric series —
and **every alert, including the one that IS always on (the `LC-INF4` uptime check), sends to
`var.alert_notification_channels`, which itself defaults to an empty list.** That means today, a full
service outage triggers the uptime alert and it pages nobody. Ledgered as `LC-D26`.

## Ledger summary

| ID | One-line | Sev |
|---|---|---|
| LC-D19 | Rate-limiter/OTP Redis client fails closed across all `@Throttle` routes incl. SOS-raise | MEDIUM-HIGH |
| LC-D20 | Socket.IO adapter `fetchSockets()` timeout behavior + `scanPresence` reentrancy unverified | LOW-MEDIUM |
| LC-D21 | DB connection math: 10×10=100 vs likely-~100 Cloud SQL ceiling, zero headroom (refines LC-INF3) | MEDIUM-HIGH |
| LC-D22 | Pool exhaustion/timeout surfaces as opaque 500, no 503/Retry-After | LOW-MEDIUM |
| LC-D23 | No Terraform-managed Cloud Run liveness/startup probe | LOW-MEDIUM |
| LC-D24 | No Cloud SQL system-metric alerts | LOW-MEDIUM |
| LC-D25 | No Redis/Memorystore alert | LOW-MEDIUM |
| LC-D26 | SLO/queue alerts default-off + empty notification-channel list (uptime alert pages nobody) | MEDIUM-HIGH |
| LC-D27 | `retention_purge`/`settlement_autopause` scheduler jobs have no failure alert | LOW-MEDIUM |

All nine are OPEN, owner: founder, per this territory's read-only doctrine. No code or
`infra/terraform/**` changes in this PR — docs only (this report, `docs/KNOWN_BUGS.md`, the ticked D-T4
box in the program plan).
