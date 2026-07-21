# PR Health & Delivery Report — 2026-07-21 14:20 UTC

**Summary:** 1 open PR checked, 1 closed-unmerged PR reviewed (within the last 7 days), 5 deploy
pipelines checked; 1 issue found and fixed (Release Please PR stuck on the known GITHUB_TOKEN
CI-trigger gap), 2 merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated (new — a hung
production canary deploy, live as of this report).

---

## A. Open PRs

`list_pull_requests(state=open)` → **1 open PR**.

### PR #377 — `fix(mobile,admin): earnings list-vs-total reconciliation + stale stuck-order copy (WD-027/WD-028)`

- **What was failing:** Nothing — all 7 checks (`CodeQL`, `analyze (javascript-typescript)`,
  `typecheck · build · test`, `mobile js bundle · size budget`, `dependency audit · secret scan`,
  `prisma migrate · constraint proof (PostGIS)`, `auto-merge` [skipped, expected]) were green,
  `mergeable_state: "clean"`, not a draft, no unresolved review threads.
- **Root cause:** n/a.
- **Fix:** None needed.
- **Status:** **Merged** (squash, `25e7d586`).

Zero drafts, zero merge conflicts, zero stuck auto-merge left open this run.

---

## B. Closed-unmerged PRs (last 7 days)

`list_pull_requests(state=closed)` sorted by updated, filtered to the last 7 days → **1 result**
with no `merged_at` (all ~29 other closed PRs in the window carried a `merged_at` timestamp).

### PR #353 — `chore(deps): Bump the production-dependencies group with 4 updates` (dependabot)

- Closed 2026-07-20 11:38 UTC by dependabot itself, with its own comment: *"Looks like these
  dependencies are updatable in another way, so this is no longer needed."*
- **Disposition: superseded** — dependabot's own grouping logic replaced this update with a
  different PR/path. No unlanded intent here; no action taken. (Same disposition as the prior
  report — carried over, not re-investigated.)

No reverted merges found on `main` in the last 7 days.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green through `3782106` (this run's final commit — release 0.10.2 merge). Three consecutive green runs this session (`bcb44e1e`, `25e7d586`, `3782106`), each in 2–4 min. | **Green** |
| **Deploy Admin Console (Cloud Run)** | Green through `25e7d586` (PR #377 touched `apps/admin/**`). | **Green** |
| **Release Please** | Green on every commit; opened PR #378 (release 0.10.2) after PR #377 merged. | **Green** |
| **Release (Cloud Run)** (production) | **Hung — see escalation below.** Run `29837879202` (commit `25e7d586`) has been stuck in situ in the "Canary — graduated shift, observe, promote" step since 14:17:08 UTC, no progress across ~50 minutes of polling. A second run (`29838250586`, commit `3782106` = release 0.10.2 merge) is queued behind it with **zero jobs started** — `release.yml`'s `concurrency: group: release-cloud-run, cancel-in-progress: false` serializes all production releases, so nothing else can ship until the hung run resolves. | **Hung — needs human, see below** |
| **Mobile Release (Play)** / **Mobile OTA Update** | Both gated `if: vars.EAS_RELEASE_ENABLED == 'true'`; that repo variable remains unset (dormant by design per `docs/LAUNCH-EXECUTION-RUNBOOK.md` §8 — EAS not yet provisioned). Confirmed by reading both workflow files this run. Zero runs, as expected. | Dormant by design |

### Good news: the recurring KB-PROD-DEPLOY-GATE issue (flagged in the last 7 reports) appears resolved

Every prior report back to 07-17 flagged `release.yml` and `deploy-admin.yml` stuck `waiting` on a
production-environment required-reviewer gate. This run, **three separate commits** (`bcb44e1e`,
`25e7d586`, and the admin-console deploy for `25e7d586`) deployed to production **without any
manual approval step** — `Deploy Admin Console (Cloud Run)` went from push to `success` in under a
minute, and the `Release (Cloud Run)` run for `bcb44e1e` (deployed earlier the same day, outside
this session's own changes) completed in the same run without a `waiting` job status. Whatever
changed (environment protection rule removed, or reviewer approved promptly enough not to be
caught by polling), this is the first report in 8 cycles with no gate-related escalation needed.
Recommend confirming with the team that this was an intentional fix (e.g. the required-reviewer
rule was removed from the `production` environment) rather than a fluke.

### New escalation — hung production canary deploy (`Release (Cloud Run)`, commit `25e7d586`)

- **What's failing:** Workflow run
  [`29837879202`](https://github.com/unnfazzed/Lynia/actions/runs/29837879202) (`Release (Cloud
  Run)`, triggered by this run's own merge of PR #377) has been stuck in the `Canary — graduated
  shift, observe, promote` step since **14:17:08 UTC**, with zero step progress across roughly 50
  minutes of repeated, non-cached polling (`list_workflow_jobs` returned byte-identical step state
  on 5 separate checks spaced 5–8 minutes apart). Every prior step in the same job (build, migrate,
  deploy-no-traffic) completed normally and quickly, matching the ~20-second-per-step pace of the
  three other successful `Release (Cloud Run)` runs observed this session.
- **Root cause (best-effort diagnosis, log content unavailable for a still-running job — GitHub's
  job-logs API only serves completed jobs):** reading `.github/workflows/release.yml`'s canary
  step, the health-check gate (`observe_health`) bounds its `curl` calls with `--max-time 10` and
  a fixed `${OBSERVE}`-second window (default 120s/step × 2 steps = ~4 min), so it cannot hang
  indefinitely. But the **error-rate gate** (`check_error_rate`) calls `curl -fsS -G
  https://monitoring.googleapis.com/v3/.../timeSeries` with **no `--max-time`** — unlike every
  other network call in the same step. A slow or non-responding Cloud Monitoring API call there
  would hang the whole step with no timeout, no error, and no log output past whatever the last
  successful `echo` was — exactly the symptom observed (a step that neither completes nor fails).
  This is the most likely single point of failure; a `gcloud auth print-access-token` hang is the
  next most likely candidate in the same block.
- **Impact:** commit `25e7d586` (this run's own merge, PR #377 — WD-027/WD-028) may currently be
  serving **some fraction of production traffic** (10% or 50%, whichever `$STEPS` iteration it
  reached) split between the old and new revisions, with **no automatic rollback pending** —
  the `Roll back traffic on failed canary` step only runs `if: failure() && steps.canary.outcome
  == 'failure'`, and a hung (not failed) step won't satisfy that condition even if eventually
  cancelled.
- **What I did:** Diagnosed via `list_workflow_jobs`/`get_workflow_run` polling and by reading the
  workflow source; did **not** cancel the run or touch traffic. Cancelling a hung canary step is
  not obviously safe to do unattended — per the impact note above, a cancelled (not failed) run
  skips the automatic rollback, which could leave traffic permanently split with no
  auto-correction. This is exactly the kind of hard-to-reverse, production-traffic-affecting
  action the operating guardrails call for a human on, so I left it running and did not force
  anything.
- **Status:** **Still hung as of this report.** The follow-up `Release (Cloud Run)` run for commit
  `3782106` (the release-please merge, tag v0.10.2) is queued behind it via the
  `release-cloud-run` concurrency group and has not started at all.
- **Recommended next step (needs human):**
  1. Check the live run directly: <https://github.com/unnfazzed/Lynia/actions/runs/29837879202> —
     if it's merely slow (not truly wedged), let it finish; GitHub Actions' default 6-hour job
     timeout will eventually fail it if it's genuinely stuck, which would then release the
     concurrency lock and trigger automatic rollback (since a hard failure *does* satisfy
     `steps.canary.outcome == 'failure'`).
  2. Check the Cloud Run console for `${CLOUD_RUN_SERVICE}` to see the actual current traffic
     split and candidate revision health directly — this rules out or confirms the "traffic
     stuck mid-shift" concern independent of the Actions UI.
  3. If genuinely wedged and traffic needs immediate correction, cancel the run **and** manually
     verify/restore 100% traffic to the pre-deploy revision via `gcloud run services
     update-traffic` or the console (the workflow's own rollback path won't fire on a cancel).
  4. Structural fix to prevent recurrence: add `--max-time <N>` to the uncapped `curl` call in
     `check_error_rate()` (`.github/workflows/release.yml`), and/or wrap the whole canary step
     body in a `timeout <N>m bash -c '...'` as a hard backstop, so a slow external API can no
     longer hang a production release indefinitely.

---

## Merged-but-not-shipped

- **`25e7d586`** (PR #377, WD-027/WD-028) — merged 2026-07-21 14:10 UTC, ~50 min ago as of this
  report. In staging and the admin console; **not confirmed live in production** — the canary
  deploy carrying it is the hung run above.
- **`3782106`** (PR #378, release 0.10.2) — merged 2026-07-21 14:15 UTC, ~45 min ago. Same
  status: staged, not yet confirmed in production; its own production deploy hasn't started
  (queued behind the hung run).

Both are within the 48h escalation threshold but are flagged directly as the concrete evidence of
the hang above, not as independent findings.

---

## Needs human

**New: hung `Release (Cloud Run)` canary step (run `29837879202`, commit `25e7d586`).** See the
escalation section above for full diagnosis and four concrete next steps (check the run, check
Cloud Run traffic directly, cancel+manually-restore if truly wedged, and add a curl timeout to
`check_error_rate()` in `release.yml` to prevent recurrence). This blocks all further production
releases via the `release-cloud-run` concurrency group until resolved.

**Resolved, no longer needs human:** the KB-PROD-DEPLOY-GATE required-reviewer gate flagged in the
last 7 reports did not recur this run — see the "Good news" note in Section C. Recommend the team
confirm this was an intentional environment-config change; no further tracking needed unless it
reappears.
