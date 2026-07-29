# Deployment pipeline: merge → staging → production, self-healing

How a merged PR reaches production, and what happens automatically when any step fails.
This is the operational companion to `LAUNCH-DEPLOYMENT-STRATEGY.md` (§2 canary design, §3c
"promotion from a green staging deploy") — that doc holds the *why*, this one holds the *live
wiring*.

## The happy path

```
PR merged to main
      │
      ▼
deploy-staging.yml          build :sha (owns the :buildcache write) → migrate staging DB
  (auto, no reviewers)      → deploy lynia-api-staging at 100% → smoke /healthz
      │  green
      ▼
release.yml                 staging-gate: polls the staging run for THIS sha until green
  (environment: production) → PROMOTES THE SAME :sha IMAGE (no rebuild; adds :latest)
                            → migrate prod DB → no-traffic canary revision
                            → graduated 10% / 50% / 100% with three health gates per step
```

Key properties:

- **Ordering** — production never starts until staging has deployed *and smoke-tested* the same
  commit. The `staging-gate` job in `release.yml` polls the Actions API for the
  `deploy-staging.yml` run with the matching `head_sha`.
- **Same-image promotion** — prod does not rebuild. It re-tags the digest staging just validated
  (`gcloud artifacts docker tags add :sha :latest`), so *what you tested is what ships*. A build
  only happens in prod when the tag is absent (staging unarmed, or manual dispatch of an old sha).
- **Unarmed modes degrade cleanly** — `GCP_STAGING_ENABLED != 'true'` makes the gate a pass-through
  (old direct-to-prod behavior); `GCP_DEPLOY_ENABLED != 'true'` keeps the whole release a no-op.

## Failure handling — the three automatic layers

### 1. Traffic rollback (seconds, prod only)

Unchanged from before: if any canary gate fails mid-rollout (LB health, revision readiness, 5xx
rate), `release.yml` immediately re-points 100% of traffic to the pre-deploy revision. A failed
build/migrate never moved traffic in the first place.

### 2. Automatic retry (`deploy-autoheal.yml`)

Every **first** failure of `Deploy Staging (Cloud Run)` or `Release (Cloud Run)`:

1. waits `AUTOHEAL_BACKOFF_SECONDS` (default 90s) so transient conditions clear — Artifact
   Registry blips, Cloud SQL Auth Proxy hiccups, DNS/managed-cert propagation on a freshly armed
   tier, Cloud Monitoring ingestion lag tripping a canary gate;
2. re-runs **only the failed jobs** of that run;
3. watches the retry to completion inside the same autoheal run.

While this happens, a release waiting in `staging-gate` **keeps waiting**: it treats a staging
failure on attempt 1 as "retry pending" and only gives up when staging is red on attempt ≥ 2 or
the gate times out (`STAGING_GATE_TIMEOUT_MINUTES`, default 60).

A release run whose *only* failed job is the staging gate itself is not retried — the root cause
is the staging run, and that run's own autoheal handles it (no duplicate escalations).

### 3. Escalation with logs (`deploy-failure` issue)

If the retry is also red, autoheal opens (or refreshes — one open issue per workflow) a GitHub
issue labeled **`deploy-failure`** containing:

- the run link, failed job names, and the last 40 KB of failed-job logs;
- an **`@claude` request** to diagnose and land the fix on `main` — a code/workflow bug becomes a
  fix PR; a config/IAM/arming gap becomes a comment naming the exact runbook step for the founder
  (never guessed secret values);
- automatic cleanup: the next green run of that workflow closes the issue.

> If the Claude GitHub app doesn't react to the bot-authored mention in your installation, the
> issue is still the complete handoff: open it and comment `@claude` yourself, or start a Claude
> Code session pointed at it.

The fix path is intentionally *forward*: the fix PR merges to main → new sha → staging deploys and
smokes it → gate promotes it to prod. The old red sha is never force-pushed to prod.

### 4. Startup-failure backstop (`workflow-startup-watchdog.yml`, hourly)

Layers 1–3 all hang off `workflow_run`, which has one structural blind spot: **a workflow that
fails to compile never reaches them.** If a workflow file contains an invalid Actions *expression*,
the run does not fail a job — it fails to start. GitHub records a run that completed in the same
second with **zero jobs**, titled by file path because the `name:` was never parsed. Autoheal's
`workflow_run.workflows` filter matches on exactly that unparsed `name:`, so no event is ever
routed to it: no retry, no issue, no signal. CI stays green (it is a different workflow), so `main`
looks healthy while the deploy tier does nothing. This is not hypothetical — it silently no-op'd
prod and staging on every push to main for two days (`KB-CI-EXPR-EMPTY`).

Two guards now cover it:

- **Prevention — `actionlint · workflow syntax` in `ci.yml`.** Compiles every expression the same
  way Actions does, so a non-compiling workflow is blocked on the PR that introduces it.
- **Detection — `workflow-startup-watchdog.yml`, hourly.** For whatever gets past CI (a direct push
  to main, a bypassed check, or a cause actionlint cannot model such as a deleted reusable-workflow
  ref). It compiles `main` directly *and* scans recent runs, then escalates onto the same
  `deploy-failure` label. Two details that matter if you ever edit it:
  - it classifies red runs by **job count**, not by `conclusion` — the real incident was reported by
    the API as a plain `failure`, not `startup_failure`, so filtering on the latter finds nothing;
  - it compiles `main` directly rather than only reacting to runs, because a broken workflow during
    a quiet period produces no runs at all and therefore emits no run-based signal.

  It opens and closes its own issue under a fixed title, so autoheal's title-substring matching
  can't adopt it or auto-close it on an unrelated green deploy.

  The same watchdog also runs a third check for the other silent deploy stall — a run **held at
  the `production` environment approval gate**. A run waiting on a required reviewer is not red, so
  it emits no failure event and autoheal never sees it; and because `release.yml` and `rollback.yml`
  serialize on the `release-cloud-run` concurrency group, one run parked at the gate blocks every
  release queued behind it. That is exactly what happened on 2026-07-29: release run #298 sat
  waiting for approval for 54 hours while ten merges to `main` shipped nothing, with no signal
  beyond the single review-request email. The watchdog can't approve the gate (only a reviewer
  can), so it just makes the stall loud — it opens a separate `deploy-failure` issue (its own fixed
  title, independent of the startup-failure issue so neither can silence the other) once a waiting
  run passes `APPROVAL_STALL_THRESHOLD_HOURS` (default 4), refreshes it hourly, and closes it once
  nothing is waiting. To defuse the class entirely, drop the required reviewer under Settings →
  Environments → production; the staging gate, no-traffic canary, health-gated promotion, and
  auto-rollback all run regardless.

## Manual overrides

| Situation | Action |
|---|---|
| Staging red for a known-unrelated reason, need to release anyway | `workflow_dispatch` of **Release (Cloud Run)** — manual dispatch bypasses the staging gate |
| Staging healed by hand (e.g. re-ran it yourself after DNS propagated) but the release run already gave up | Re-run the release's failed jobs (the gate re-polls and now sees green), or dispatch the release |
| Prod serving a bad revision | `rollback.yml` — one-command traffic re-point (canary failures already do this automatically) |
| Deep prod diagnosis without changing anything | `gcp-diagnose.yml` (read-only) |

## Tunables (repo Variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `STAGING_GATE_TIMEOUT_MINUTES` | `60` | How long a release waits for staging to go green |
| `AUTOHEAL_BACKOFF_SECONDS` | `90` | Pause before the automatic re-run of failed jobs |
| `CANARY_STEPS` / `CANARY_OBSERVE_SECONDS` / `CANARY_MIN_SAMPLE` / `CANARY_MAX_5XX_PCT` | `10 50` / `120` / `20` / `5` | Prod canary shape (pre-existing, `release.yml`) |
| `APPROVAL_STALL_THRESHOLD_HOURS` | `4` | How long a deploy run may wait at the `production` approval gate before the watchdog files a `deploy-failure` issue |

## What still needs a human

- **Merging the fix PR** that autoheal/@claude produces (branch protection applies as usual).
- **Arming/config actions** — creating secrets, IAM grants, Terraform applies, DNS records. The
  escalation issue names the runbook step (`LAUNCH-EXECUTION-RUNBOOK.md`); automation never
  invents credential values.
- **Approving prod deploys** if/when a required reviewer is configured on the `production`
  GitHub Environment (the gate then sits *before* that approval, so reviewers only ever see
  staging-validated commits).
