# PR Health & Delivery Report — 2026-07-20 08:16 UTC

**Summary:** 1 open PR checked, 0 closed-unmerged reviewed (0 within the last 7 days), 6 deploy
pipelines checked (7 including autoheal monitoring); 1 issue found (the recurring production
deploy-approval gate — self-cleared mid-run for one commit via human approval, then immediately
recurred for the next), 0 code-level failures needing a fix, 1 PR merged, 0 resurrected, 0 deploy
re-runs needed, 1 escalated (carry-over, 6th consecutive report — though this cycle's stall was
shorter and the admin-console side of the escalation is now resolved).

---

## A. Open PRs

`list_pull_requests(state=open)` → **1 open PR**.

### PR #345 — `perf(wave-2b): Loop-A-confirmed fixes — focus-gated home poll, extracted auction clock`

- **What was failing:** Nothing — green but unmerged. All 6 check runs (CodeQL, `analyze
  (javascript-typescript)`, `dependency audit · secret scan`, `prisma migrate · constraint proof
  (PostGIS)`, `typecheck · build · test`, `auto-merge`) completed successfully, `mergeable_state:
  "clean"`, not a draft.
- **Root cause:** n/a — just needed the merge-on-green step.
- **Fix:** Squash-merged as commit `c6411df`.
- **Status:** **Merged.** Triggered `chore(main): release 0.7.5` (PR #346), which this repo's own
  automation auto-merged ~40s after opening (commit `dd0d4c8`) — consistent with every prior
  release-please cycle; no action needed from this routine.

Zero drafts, zero merge conflicts, zero stuck auto-merge, zero unresolved-but-addressed review
threads this run.

---

## B. Closed-unmerged PRs (last 7 days)

Reviewed all 30 most-recently-updated closed PRs (covers 2026-07-18 15:04 UTC through this run,
well past the 7-day window) via `merged_at`/`closed_at` comparison: **every one was merged** — zero
closed-without-merging in the last 7 days. Nothing to resurrect this run.

Checked `git log origin/main --grep="^Revert "` (strict, anchored) across the full visible history:
no true revert commits. (A loose `-i "Revert"` grep over commit bodies turns up unrelated prose —
e.g. `b7002fe`'s "Reverting to WhatsApp later is a one-line `OTP_CHANNEL` flip" — confirmed by
reading the full message, not an actual revert.) No reverted merge to diagnose.

No unresolved items carried over from Section B of the last report (`docs/PR-HEALTH-REPORT-
2026-07-20-0222.md`) — its only carry-over was the Section C production-gate escalation, handled
below.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green through `4da55c0` (PR #344); runs for `c6411df` (PR #345) and `dd0d4c8` (release 0.7.5) in progress/queued as this report was written, no failures in visible history. | **Green** |
| **Release (Cloud Run)** (production) | Was stuck `waiting` on `4da55c0` when this run started (since 07:29:13 UTC); **cleared via human approval at 08:15:05 UTC** (~46min wait) and is now actively deploying. `c6411df`'s run was cancelled as superseded while queued behind it (expected — matches the pattern from the last report). The newest commit, `dd0d4c8`, is queued (`pending`) and will very likely need its own fresh approval once `4da55c0` finishes — same recurring gate, shorter wait this cycle. | **Recovering — recurring gate, see escalation** |
| **Deploy Admin Console (Cloud Run)** | **Resolved since last report.** The prior report flagged this as newly stuck; it has since deployed cleanly for all 3 subsequent code-bearing commits (`1095e70`, `87078e9`, `4da55c0`), each completing in ~1 minute. | **Green** |
| **Release Please** | Green for every commit since the one transient GitHub-side 5xx noted last report (already superseded then). PR #346 (release 0.7.5) created and auto-merged normally this run. | **Green** |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset), consistent with every prior report. | Dormant by design |
| **Deploy Autoheal** | Recent runs all `success`/`skipped`, no `failure` conclusions — no escalation issue opened, correct since the stuck production runs are `waiting`, not `failure`. | No action needed |

### Escalation — production deploy-approval gate (recurring, 6th consecutive report — partially improved)

Same **KB-PROD-DEPLOY-GATE** flagged in the 07-17, 07-18, 07-19 02:20, 07-19 20:10, and 07-20 02:22
reports (`release.yml` and `deploy-admin.yml` both declare `environment: production`, which requires
a human reviewer approval per run):

- **Improvement this cycle:** the admin-console side of the escalation (newly flagged last report)
  is now fully resolved — 3 clean deploys since. The production `Release` gate itself also cleared
  during this run, in ~46 minutes rather than the 15h40m+ stall reported last time — someone is
  approving these more promptly now.
- **Still recurring:** the gate requires a **fresh approval on every commit**, not once. Immediately
  after `4da55c0` was approved, the next commit's run (`c6411df`) queued and was cancelled as
  superseded, and the one after that (`dd0d4c8`, release 0.7.5, now on `main`) is queued and will
  almost certainly need its own manual approval before it ships. Production was briefly caught up to
  `4da55c0` as this report was written but is expected to fall behind `dd0d4c8` again pending the
  next approval.
- As in every prior report: no `mcp__github__*` tool can approve a pending Environment deployment
  review or edit Environment protection rules (confirmed again this run via a fresh tool search of
  `mcp__github__actions_*`) — approval and configuration both require the GitHub web UI. Per the hard
  guardrails, this routine does not bypass the gate.

**Needs human — recommended next step (persisting, though less urgent than last report):**
1. If a fresh approval is pending on [`dd0d4c8`'s Release run](https://github.com/unnfazzed/Lynia/actions/workflows/release.yml)
   (check **Actions → Release (Cloud Run)** for the newest `waiting` run), approve it via **Review
   deployments**.
2. This routine still recommends, as in every prior report: go to **Settings → Environments →
   `production`** and either remove the required-reviewer rule (both `release.yml` and
   `deploy-admin.yml` target it, so a single config change clears the recurring pattern for both) or
   add a notification (Slack/email/PagerDuty webhook on `deployment_status` state `waiting`) so
   approvals happen within minutes automatically rather than depending on someone noticing. Response
   time has visibly improved (46min vs 15h+ last cycle), so this may already be receiving more
   attention — but the structural fix (remove or auto-approve the gate) would eliminate the recurring
   flag entirely.

---

## Merged-but-not-shipped

- **`c6411df` / PR #345** (wave-2b perf fixes) — merged 08:14 UTC, ~2 min ago as of this report. Not
  yet in production; superseded in the Release queue by the newest commit, will ship once that
  commit's gate clears.
- **`dd0d4c8` / release 0.7.5** — merged 08:14:49 UTC (release-please auto-merge), ~1 min ago as of
  this report. Not yet in production; queued behind the gate.

Both well under the 48h escalation threshold — flagged only as the direct evidence of the
still-recurring gate above, not because either PR did anything wrong.

---

## Needs human

**KB-PROD-DEPLOY-GATE (6th consecutive report; improved but not resolved).** The production
`Release (Cloud Run)` environment's required-reviewer gate cleared for `4da55c0` in ~46 minutes this
cycle (down from 15h40m+ last report), and the previously-new admin-console side of the escalation
is now fully resolved. However, the gate still requires a fresh manual approval on every code-bearing
commit rather than staying cleared, so `dd0d4c8` (now on `main`, includes PR #345 and release 0.7.5)
is likely queued behind another pending approval. See the escalation section above for the two
remediation options (approve the pending run as it appears, or remove/reconfigure the
`production` Environment's required-reviewer rule so it stops recurring). This routine cannot
approve Environment deployment reviews or edit Environment protection rules through the available
`mcp__github__*` tools.
