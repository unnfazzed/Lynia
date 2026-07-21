# PR Health & Delivery Report — 2026-07-21 02:14 UTC

**Summary:** 2 open PRs checked, 1 closed-unmerged PR reviewed (within the last 7 days), 7 deploy
pipelines checked; 2 issues found (1 CI-trigger failure on an open PR, 1 recurring production
deploy-approval gate — 7th consecutive occurrence, now blocking 2 pipelines at once), 1 fixed,
2 merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated (carry-over).

---

## A. Open PRs

`list_pull_requests(state=open)` → **2 open PRs**.

### PR #371 — `fix(admin,api): error-boundary gap on bare admin forms + notify-me feed fallback (UX21-01/02)`

- **What was failing:** Nothing — all 6 checks (`CodeQL`, `analyze (javascript-typescript)`,
  `typecheck · build · test`, `mobile js bundle · size budget`, `dependency audit · secret scan`,
  `auto-merge` [skipped, expected]) were green, `mergeable_state: "clean"`, not a draft, no
  unresolved review threads.
- **Root cause:** n/a.
- **Fix:** None needed.
- **Status:** **Merged** (squash, `cfde42f9`).

### PR #370 — `chore(main): release 0.10.1`

- **What was failing:** `mergeable_state: "blocked"`, 0 check runs (`pull_request_read
  get_status` → `state: "pending", total_count: 0`).
- **Root cause:** Same recurring pattern documented in every prior report back to the #249/#265/#297
  lineage: Release Please opens/pushes this PR using the default `GITHUB_TOKEN`, and a
  `GITHUB_TOKEN`-authored push can't trigger further `pull_request`-scoped workflow runs, so CI
  never fired. Also held on the CODEOWNERS-required review (`* @unnfazzed`).
- **Fix:** Verified the diff was mechanical-only (`.release-please-manifest.json`,
  `apps/mobile/CHANGELOG.md`, `app.config.ts` version, `apps/mobile/package.json`). Closed +
  reopened the PR as the authenticated actor to retrigger CI — while checks were still queuing,
  merging PR #371 caused Release Please to auto-rebase this PR onto the new `main`, pushing a
  fresh commit (`6d687526`) again authored by `github-actions[bot]`'s token, which again failed
  to trigger `pull_request` CI (`action_required`, 0 jobs). Closed + reopened a second time against
  the rebased HEAD — all 7 checks went green (`CodeQL`, `analyze (javascript-typescript)`,
  `typecheck · build · test`, `mobile js bundle · size budget`, `dependency audit · secret scan`,
  `prisma migrate · constraint proof (PostGIS)`, `auto-merge` [skipped, expected]). Submitted the
  CODEOWNERS approval as the authenticated actor.
- **Status:** **Merged** (squash, `5a15c506`), tagging **v0.10.1**.

Zero drafts, zero merge conflicts, zero stuck auto-merge left open this run.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-14)` → **1 result**.

### PR #353 — `chore(deps): Bump the production-dependencies group with 4 updates` (dependabot)

- Closed 2026-07-20 11:38 UTC by dependabot itself, with its own comment: *"Looks like these
  dependencies are updatable in another way, so this is no longer needed."*
- **Disposition: superseded** — dependabot's own grouping logic replaced this update with a
  different PR/path. No unlanded intent here; no action taken.

`git log --grep="^Revert " -i --since="7 days ago"` on `main`: **0 results**. No reverted merge to
diagnose.

No other unresolved items carried over from Section B of the last report
(`docs/PR-HEALTH-REPORT-2026-07-20-2016.md`) — its only carry-over was the Section C
production-gate escalation, handled below.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green through `364e535e` (latest commit at run start; path-relevant). | **Green** |
| **Release (Cloud Run)** (production) | **Stuck `waiting`** on `364e535e` since 2026-07-20 23:38:33 UTC (~2h36m and counting); `cfde42f9`'s run was auto-cancelled (superseded by the newer push), and the newest commit `5a15c506` (release 0.10.1, this run's PR #370 merge) is queued `pending` behind `364e535e`. Same recurring gate — see escalation below. | **Stuck — recurring gate, see escalation** |
| **Deploy Admin Console (Cloud Run)** | Green through `162e1f1d` for the prior window; PR #371 (merged this run) touched `apps/admin/**`, so a new run fired for `cfde42f9` — **also stuck `waiting`** since 02:10:59 UTC, same gate. | **Stuck — recurring gate, see escalation** |
| **Release Please** | Green for every commit including this run's merges (`cfde42f9`, `5a15c506`); correctly opened no new PR post-merge (nothing further release-worthy). | **Green** |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset), consistent with every prior report. | Dormant by design |
| **Deploy Autoheal** | Recent runs all `success`, including `364e535e`. | No action needed |

### Escalation — production deploy-approval gate (recurring, 7th consecutive report)

Same **KB-PROD-DEPLOY-GATE** flagged in every report since 07-17:

- `release.yml` has been `waiting` on `364e535e` for ~2h36m as this report is written, with the
  commit merged this run (`5a15c506`, release 0.10.1) now queued behind it — production is 2
  commits behind and growing.
- `deploy-admin.yml` is *also* stuck `waiting`, on `cfde42f9` (PR #371's admin-console fix), since
  02:10:59 UTC — this is the first report where both gated workflows are stuck at the same time,
  since PR #371's admin-touching changes landed in the same window PR #369/#370 were already
  queued on the release side.
- As in every prior report: no `mcp__github__*` tool can approve a pending Environment deployment
  review or edit Environment protection rules (re-confirmed via `ToolSearch`). Per the hard
  guardrails, this routine does not bypass the gate.

**Needs human — recommended next step (persisting, 7th time):**
1. Approve the pending runs via **Actions → Release (Cloud Run) → Review deployments** (for
   `364e535e`, then `5a15c506` once it starts) and **Actions → Deploy Admin Console (Cloud Run) →
   Review deployments** (for `cfde42f9`).
2. As recommended in every prior report: go to **Settings → Environments → `production`** and
   either remove the required-reviewer rule (both `release.yml` and `deploy-admin.yml` target it,
   so one config change clears the recurring pattern for both) or wire a notification
   (Slack/email/PagerDuty webhook on `deployment_status` state `waiting`) so approvals happen
   within minutes automatically. This is now a 7-report-old recurring flag, and this run is the
   first time it has stalled *both* production pipelines concurrently — the structural fix would
   eliminate it permanently instead of relying on someone noticing each cycle.

---

## Merged-but-not-shipped

- **`364e535e`** (PR #369, mobile BH-23/24 fixes) — merged 2026-07-20 23:38 UTC, ~2h36m ago as of
  this report. Not yet in production; queued behind the gate.
- **`cfde42f9`** (PR #371, admin error-boundary + notify-me feed fallback) — merged this run.
  Not yet in production (either pipeline); queued behind the gate.
- **`5a15c506`** (PR #370, release 0.10.1) — merged this run. Not yet in production; queued behind
  `364e535e` in the Release pipeline.

All under the 48h escalation threshold — flagged only as direct evidence of the still-recurring
gate above, not because any PR did anything wrong.

---

## Needs human

**KB-PROD-DEPLOY-GATE (7th consecutive report, now blocking 2 pipelines simultaneously).** The
production `Release (Cloud Run)` environment's required-reviewer gate is stuck `waiting` on
`364e535e` (~2h36m and counting), with `5a15c506` queued behind it; `Deploy Admin Console (Cloud
Run)` is separately stuck `waiting` on `cfde42f9`. See the escalation section above for the two
remediation options (approve the pending runs as they appear, or remove/reconfigure the
`production` Environment's required-reviewer rule so it stops recurring). This routine cannot
approve Environment deployment reviews or edit Environment protection rules through the available
`mcp__github__*` tools.
