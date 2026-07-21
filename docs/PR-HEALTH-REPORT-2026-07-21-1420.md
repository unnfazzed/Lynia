# PR Health & Delivery Report — 2026-07-21 14:20 UTC

**Summary:** 1 open PR checked, 1 closed-unmerged PR reviewed (within the last 7 days), 5 deploy
pipelines checked; 1 issue found and fixed (Release Please PR stuck on the known GITHUB_TOKEN
CI-trigger gap), 2 merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated (a second production
release is currently pending what looks like the previously-reported manual-approval gate).

**Correction note:** an earlier draft of this report (visible in this PR's history) flagged the
`Release (Cloud Run)` run for commit `25e7d586` as hung in its canary step for ~50 minutes. That
was a false alarm caused by this session's own tooling repeatedly returning stale/cached workflow
state across many polls spaced 5–8 minutes apart — a direct re-check of the job's step-level
timestamps showed it had actually completed successfully in ~4.5 minutes (14:17:08–14:21:44 UTC),
well within the normal range for this workflow. The section below reflects the corrected,
freshly-verified state as of this report.

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
| **Deploy Admin Console (Cloud Run)** | Green through `25e7d586` (PR #377 touched `apps/admin/**`). Completed in under a minute with no approval wait. | **Green** |
| **Release Please** | Green on every commit; opened PR #378 (release 0.10.2), which then auto-merged itself once CI went green (repo has this wired up). | **Green** |
| **Release (Cloud Run)** (production) — commit `25e7d586` | Verified via fresh, non-cached job data: `wait for green staging deploy` succeeded (14:10:45–14:14:25), `build · migrate · deploy` succeeded end-to-end including the canary shift/observe/promote step (14:15:39–14:21:50, ~6 min total, canary step itself ~4.5 min), `Roll back traffic on failed canary` correctly `skipped` (nothing failed). **Confirmed live in production.** | **Green** |
| **Release (Cloud Run)** (production) — commit `3782106` (release 0.10.2) | **Currently pending — see escalation below.** This run's `build · migrate · deploy` job has been in `waiting` status with **zero steps started** for 13+ minutes as of this report (created 14:21:56 UTC), after its own `wait for green staging deploy` job succeeded normally in 5 seconds. A job sitting in `waiting` with no steps at all (as opposed to a job that started and is progressing through steps) is the signature GitHub Actions uses for a job gated on required-reviewer approval on an environment. | **Pending approval? — needs human, see below** |
| **Mobile Release (Play)** / **Mobile OTA Update** | Both gated `if: vars.EAS_RELEASE_ENABLED == 'true'`; that repo variable remains unset (dormant by design per `docs/LAUNCH-EXECUTION-RUNBOOK.md` §8 — EAS not yet provisioned). Confirmed by reading both workflow files this run. Zero runs, as expected. | Dormant by design |

### Escalation — commit `3782106` (release 0.10.2) may be waiting on the previously-reported production approval gate

- **What's happening:** Workflow run
  [`29838250586`](https://github.com/unnfazzed/Lynia/actions/runs/29838250586) (`Release (Cloud
  Run)`, commit `3782106` = the release-please merge for v0.10.2) has its `build · migrate ·
  deploy` job sitting in `waiting` status with **no steps recorded at all** since 14:21:56 UTC —
  13+ minutes and counting as of this report, confirmed unchanged across two independent,
  non-cached `list_workflow_jobs` calls 5+ minutes apart. This is distinct from the transient
  ~1-minute `waiting`→`in_progress` blip observed on the *previous* run for commit `25e7d586`
  (which did populate steps immediately once it started) — this job has not been picked up by a
  runner at all.
- **Context:** the last 7 reports (07-17 through this morning's 02:14 report) repeatedly flagged
  `release.yml` and `deploy-admin.yml` stuck `waiting` on a production-environment
  required-reviewer gate. Earlier in *this same run*, the `Release (Cloud Run)` deploy for commit
  `25e7d586` and the `Deploy Admin Console (Cloud Run)` deploy both completed without any visible
  approval wait — which is why an earlier draft of this report incorrectly called the gate
  resolved. This run's second release (`3782106`) now shows the exact `waiting`-with-no-steps
  signature the gate produces, so the more likely explanation is that the gate is still in place
  but is being approved (by a human, out of band) inconsistently or with variable latency — not
  that it was removed. I could not distinguish "gate exists and no one has approved it yet" from
  "gate was removed and this is an unrelated runner-provisioning delay" using only the
  `mcp__github__*` tools available to this routine; no tool here can read environment protection
  rules or pending deployment reviews directly.
- **What I did:** Verified via repeated, deliberately-spaced `list_workflow_jobs` polling (not
  relying on a single possibly-cached read, after being burned by exactly that earlier in this
  same run). Did not attempt to approve, dismiss, or otherwise interact with the pending
  deployment review — this routine has no tool that can do so, consistent with every prior report.
- **Status:** **Still pending as of this report.**
- **Recommended next step (needs human):** Check **Actions → Release (Cloud Run) → run #276 →
  Review deployments** (or the equivalent banner on
  <https://github.com/unnfazzed/Lynia/actions/runs/29838250586>) and approve if a review is
  indeed pending. If no pending-review banner appears there, the job is stalled for a different
  reason (runner capacity, etc.) and is worth a `mcp__github__actions_run_trigger` re-run once
  investigated. Either way, please confirm to the team whether the `production` environment's
  required-reviewer rule is still configured — this report can't determine that itself, and it
  would resolve the ambiguity in this and future reports.

---

## Merged-but-not-shipped

- **`25e7d586`** (PR #377, WD-027/WD-028) — merged 2026-07-21 14:10 UTC. **Confirmed live in
  production** as of 14:21:50 UTC (verified, not assumed — see Section C).
- **`3782106`** (PR #378, release 0.10.2) — merged 2026-07-21 14:15 UTC, ~50 min ago as of this
  report. Staged; **not yet confirmed live in production** — its deploy job has been pending for
  13+ minutes, see the escalation above.

---

## Needs human

**Commit `3782106` (release 0.10.2) production deploy pending, possible recurrence of
KB-PROD-DEPLOY-GATE.** See the escalation in Section C: run `29838250586`'s deploy job has shown
zero step progress for 13+ minutes, consistent with the production required-reviewer gate flagged
in the last 7 reports. Please check the run directly and approve if a review is pending, and
confirm whether that environment rule is still configured — this report could not determine that
with the tools available to it.

**No longer flagged as a separate issue:** the `25e7d586` production canary this report originally
(and incorrectly) called "hung" completed normally in ~4.5 minutes once independently re-verified
— see the correction note at the top of this report.
