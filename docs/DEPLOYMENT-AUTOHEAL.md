# Deployment pipeline: merge → production, self-healing

How a merged PR reaches production on Azure, and what happens on its own when a step fails. The canary
design and its reasons live in [LAUNCH-DEPLOYMENT-STRATEGY.md](LAUNCH-DEPLOYMENT-STRATEGY.md); owner
commands in [AZURE-OWNER-RUNBOOK.md](AZURE-OWNER-RUNBOOK.md).

## The happy path

```
PR merged to main
      │
      ▼
release-azure.yml   "Release (Azure)", environment: production, concurrency group release-azure
  staging-gate      AZ_STAGING_ENABLED is off (staging retired) → passes straight through
  deploy            build or promote the :sha image into ACR
                    → migrate (caj-lynia-migrate, inside the VNet)
                    → pin traffic to the serving revision, create the new revision at 0%
                    → smoke /healthz on the candidate's revision-label URL
                    → shift 10% → 50% → 100%, three gates per step
```

The three canary gates per step: `/healthz` reports `status: ok` (public host and label URL), the
candidate revision is healthy, and its 5xx rate from Azure's `Requests` metric stays under
`CANARY_MAX_5XX_PCT`. Any failed gate moves 100% of traffic back to the previous revision. A failed
build or migration never moved traffic at all.

The admin console has its own workflow, **Deploy Admin Console (Azure)** (`deploy-admin-azure.yml`),
on pushes that touch `apps/admin/**`. Autoheal does not watch it.

The staging gate still exists in `release-azure.yml`. If staging is ever brought back and
`AZ_STAGING_ENABLED` turned on, production waits for **Deploy Staging (Azure)** to go green on the same
commit, and keeps waiting through a first staging failure while autoheal retries it.

## Failure handling

### 1. Traffic rollback (seconds, inside the release)

Described above. Done by `release-azure.yml` itself, before autoheal ever runs.

### 2. One automatic retry (`deploy-autoheal.yml`)

Triggered by `workflow_run` on the **first** failed attempt of **Release (Azure)** or **Deploy Staging
(Azure)** (matched by workflow `name:`). It:

1. skips the run if the only failed job is `wait for green staging deploy` (the staging run's own
   autoheal owns that);
2. waits `AUTOHEAL_BACKOFF_SECONDS` (default 90) for transient faults to clear;
3. re-runs **only the failed jobs** of that run;
4. watches the retry to completion (up to 90 minutes) inside the same autoheal run.

### 3. Escalation (`deploy-failure` issue)

If the retry is still red (or did not finish in 90 minutes), autoheal opens a GitHub issue labelled
**`deploy-failure`**, or comments on the open one for that workflow. It contains the run link, the
failed job names, the last 40 KB of failed-job logs, and an `@claude` request to diagnose: a code or
workflow bug becomes a fix PR; a config or permission gap becomes a comment naming the owner's step
(for an Azure run, dispatch **Azure Diagnose (read-only)** and paste its Recap). It never guesses
secret values.

The next green run of that workflow closes the issue (`close-resolved` job). The fix path is forward:
the fix merges, a new release ships it. A red commit is never forced to production.

> If the Claude GitHub app does not react to the bot-authored mention, the issue is still the complete
> handoff: comment `@claude` yourself or open a session on it.

### 4. Backstop (`workflow-startup-watchdog.yml`, hourly)

Covers two stalls that never emit a failure event, so autoheal cannot see them:

- **A workflow that fails to compile.** An invalid Actions expression makes the run fail with zero jobs,
  before its `name:` is parsed, so `workflow_run` never matches it (this happened once:
  `KB-CI-EXPR-EMPTY`). Prevention is the `actionlint` job in `ci.yml`. Detection is the watchdog: it
  compiles `main`'s workflows and scans recent zero-job failures.
- **A run waiting at an environment approval gate** for longer than `APPROVAL_STALL_THRESHOLD_HOURS`
  (default 4). A waiting run is not red, and it blocks every release queued behind it in the same
  concurrency group. The watchdog cannot approve; it makes the stall loud.

Both open their own `deploy-failure` issues under fixed titles, so autoheal never adopts or closes them.

## Manual overrides

| Situation | Action |
|---|---|
| Ship now, or re-apply changed Variables | Dispatch **Release (Azure)** (manual dispatch also skips the staging gate) |
| Production serving a bad revision | **Rollback (Azure)**, `environment: production` (the input defaults to `staging`, which is retired) |
| Diagnose without changing anything | **Azure Diagnose (read-only)** |

## Tunables (repo Variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `AUTOHEAL_BACKOFF_SECONDS` | `90` | Pause before the automatic re-run |
| `CANARY_STEPS` / `CANARY_OBSERVE_SECONDS` / `CANARY_MIN_SAMPLE` / `CANARY_MAX_5XX_PCT` | `10 50` / `120` / `20` / `5` | Canary shape (`release-azure.yml`) |
| `CANARY_DISABLED` | unset | `true` routes 100% to the new revision at once |
| `STAGING_GATE_TIMEOUT_MINUTES` | `60` | Only matters if staging is re-enabled |
| `APPROVAL_STALL_THRESHOLD_HOURS` | `4` | Watchdog's approval-stall threshold |

## Leftovers

`deploy-autoheal.yml` still lists the GCP workflow names **Deploy Staging (Cloud Run)** and **Release
(Cloud Run)**. Those workflows are dead (the GCP project is suspended) and are removed in plan Phase 8.

## What still needs a human

- Merging the fix PR autoheal or `@claude` produces.
- Config actions: Key Vault secrets, role assignments, Terraform applies, DNS.
- Approving a deploy, if a required reviewer is ever added to the `production` environment.
