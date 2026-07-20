# PR Health & Delivery Report — 2026-07-20 20:16 UTC

**Summary:** 1 open PR checked, 0 closed-unmerged reviewed (0 within the last 7 days), 6 deploy
pipelines checked (7 including autoheal monitoring); 1 issue found (the recurring production
deploy-approval gate — same **KB-PROD-DEPLOY-GATE** as every prior report, now 7th consecutive
occurrence, currently blocking 2 queued commits), 1 CI-trigger failure found and fixed on the one
open PR, 1 PR merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated (carry-over).

---

## A. Open PRs

`list_pull_requests(state=open)` → **1 open PR**.

### PR #366 — `chore(main): release 0.10.0`

- **What was failing:** `mergeable_state: "blocked"`, 0 check runs / `pull_request_read
  get_status` → `state: "pending", total_count: 0`. The one CI run that did fire
  (`actions/runs/29772981386`) completed with conclusion `action_required` and 0 jobs — it never
  actually started.
- **Root cause:** Same recurring pattern documented in the 2026-07-19 02:20 report (PR #249, #265,
  #297 lineage): Release Please opens this PR using the default `GITHUB_TOKEN`, and a
  `GITHUB_TOKEN`-authored push can't trigger further `pull_request`-scoped workflow runs, so CI
  never fired for the branch. The PR was also held on the CODEOWNERS-required review (`* @unnfazzed`
  in `.github/CODEOWNERS`).
- **Fix:** Verified the diff was mechanical-only (`.release-please-manifest.json`,
  `apps/mobile/CHANGELOG.md`, `app.config.ts` version line, `apps/mobile/package.json` — no code
  changes). Closed + reopened the PR as the authenticated actor (`unnfazzed`) to retrigger CI — all
  6 checks went green (`CodeQL`, `analyze (javascript-typescript)`, `typecheck · build · test`,
  `prisma migrate · constraint proof (PostGIS)`, `dependency audit · secret scan`, `auto-merge`
  [skipped, expected — release-please PRs aren't auto-merge-labeled]). Submitted the CODEOWNERS
  approval.
- **Status:** **Merged** (squash, `646b42d7`), tagging **v0.10.0**.

Zero drafts, zero merge conflicts, zero stuck auto-merge, zero unresolved-but-addressed review
threads this run.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged updated:>=2026-07-13)` → **0 results**. Nothing
to resurrect this run.

`git log --grep="^Revert " -i` across the full visible history on `main`: no true revert commits.
No reverted merge to diagnose.

No unresolved items carried over from Section B of the last report
(`docs/PR-HEALTH-REPORT-2026-07-20-0816.md`) — its only carry-over was the Section C production-gate
escalation, handled below.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green through `0dd1084` (latest commit with staging-relevant changes at run time). | **Green** |
| **Release (Cloud Run)** (production) | **Stuck `waiting`** on `0dd1084` since 19:40:33 UTC (~36 min and counting as this report was written); the newest commit `646b42d7` (this run's PR #366 merge) queued behind it as `pending`. Same recurring gate — see escalation below. | **Stuck — recurring gate, see escalation** |
| **Deploy Admin Console (Cloud Run)** | Green through `162e1f1d` — no admin/shared-package changes since (path-filtered on `apps/admin/**`, `packages/shared/**`), so no new run expected for `0dd1084`/`646b42d7` (both mobile/release-only). Correct, not a gap. | **Green** |
| **Release Please** | Green for every commit including this run's `646b42d7` (post-merge scan found no new release-worthy commits, so no new PR opened — expected). | **Green** |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset), consistent with every prior report. | Dormant by design |
| **Deploy Autoheal** | Recent runs all `success` — no `failure` conclusions, correct since the stuck production run is `waiting`, not `failure`. | No action needed |

### Escalation — production deploy-approval gate (recurring, 7th consecutive report)

Same **KB-PROD-DEPLOY-GATE** flagged in every report since 07-17 (`release.yml` and
`deploy-admin.yml` both declare `environment: production`, which requires a human reviewer
approval per run):

- The gate cleared for `4da55c0` in ~46 minutes last cycle (per the 08:16 report), but as expected
  it has recurred for the very next code-bearing commit: `0dd1084` has been `waiting` for ~36
  minutes as this report is written, and the commit merged during this routine run (`646b42d7`,
  release 0.10.0) is now queued behind it too — production is 2 commits behind and growing while
  the gate sits unapproved.
- As in every prior report: no `mcp__github__*` tool can approve a pending Environment deployment
  review or edit Environment protection rules (re-confirmed this run via `ToolSearch` for
  deployment/environment/approval tooling — only PR review and issue-comment tools exist, nothing
  that touches Environment protection rules or deployment reviews). Per the hard guardrails, this
  routine does not bypass the gate.

**Needs human — recommended next step (persisting, 7th time):**
1. Approve the pending run on [`0dd1084`'s Release run](https://github.com/unnfazzed/Lynia/actions/runs/29772953159)
   via **Actions → Release (Cloud Run) → Review deployments**, then do the same for `646b42d7`'s
   run once it starts.
2. As recommended in every prior report: go to **Settings → Environments → `production`** and
   either remove the required-reviewer rule (both `release.yml` and `deploy-admin.yml` target it,
   so one config change clears the recurring pattern for both) or wire a notification
   (Slack/email/PagerDuty webhook on `deployment_status` state `waiting`) so approvals happen
   within minutes automatically. This is now a 7-report-old recurring flag — the structural fix
   would eliminate it permanently instead of relying on someone noticing each cycle.

---

## Merged-but-not-shipped

- **`0dd1084`** (PR #365, mobile Sentry wiring) — merged 19:40:30 UTC, ~36 min ago as of this
  report. Not yet in production; queued behind the gate.
- **`646b42d7`** (PR #366, release 0.10.0) — merged this run. Not yet in production; queued behind
  `0dd1084` in the Release pipeline.

Both well under the 48h escalation threshold — flagged only as the direct evidence of the
still-recurring gate above, not because either PR did anything wrong.

---

## Needs human

**KB-PROD-DEPLOY-GATE (7th consecutive report).** The production `Release (Cloud Run)` environment's
required-reviewer gate is stuck `waiting` on `0dd1084` (~36 min and counting), with the newest
commit `646b42d7` queued behind it. See the escalation section above for the two remediation
options (approve the pending runs as they appear, or remove/reconfigure the `production`
Environment's required-reviewer rule so it stops recurring). This routine cannot approve
Environment deployment reviews or edit Environment protection rules through the available
`mcp__github__*` tools.
