# PR Health & Delivery Report — 2026-07-20 02:22 UTC

**Summary:** 2 open PRs checked, 0 closed-unmerged reviewed (0 within the last 7 days), 5 deploy
pipelines checked; 3 failures found (2 merge conflicts, 1 stuck production gate that's now spread to
a second pipeline), 2 fixed, 2 merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated (carried
over, worse than last report).

---

## A. Open PRs

`list_pull_requests(state=open)` → **2 open PRs**, both authored by this account's prior routine
runs, both created ~23:30 UTC 2026-07-19 against a `main` that has since moved on (PR #340 landed at
01:46 UTC today, ahead of both).

### PR #339 — `fix(mobile,api): persist rider sent-offer list and dedupe issue-raise (BH-21, BH-22)`

- **What was failing:** `mergeable_state: "dirty"` — a real merge conflict against current `main`,
  confirmed with a local `git merge --no-commit`. CI and CodeQL were both green on the existing head
  commit; the conflict was invisible to CI (GitHub doesn't run checks against a hypothetical merge
  commit for a conflicted PR).
- **Root cause:** PR #340 (`fix(mobile,api,admin): ...UX20-01..04`, merged 01:46 UTC) landed after
  this PR was opened and edited the same `docs/KNOWN_BUGS.md` "Last consolidated" header block this
  PR also edited (both routines append to the top of the file).
- **Fix:** Checked out the PR branch, merged `origin/main`, resolved the single conflict by keeping
  `main`'s (chronologically newer, 2026-07-20) header — the BH-21/BH-22 detail this PR added lives in
  full further down the file in its own dated section (`## Bug hunt 2026-07-19 night`), so nothing was
  lost. Ran `pnpm typecheck && pnpm test` (1090 API tests / 482 mobile tests, all green), pushed to the
  same branch (`claude/vigilant-franklin-5ttorr`).
- **Status:** CI green (CI + CodeQL success on the merge commit), `mergeable_state` turned `clean`.
  **Squash-merged** as commit `87078e9`.

### PR #338 — `perf(wave-2): BFF bootstrap, standardized cache layer, lightweight heartbeat, feed parallelization + weekly perf routine`

- **What was failing:** Same class of issue — `mergeable_state: "dirty"`, confirmed with a local
  merge attempt: a real conflict in `apps/api/src/notifications/notifications-feed.service.ts`.
- **Root cause:** This PR's "wave-2 perf" rewrite parallelized `NotificationsFeedService.feedForUser`'s
  ~9 sequential DB reads into two `Promise.all` batches. PR #340 (UX20-04) independently added a new
  sequential read + row-building block to the *same* method (a fare-adjust feed fallback) and a new
  `agreedFare` field to the order `select`. Textually adjacent, semantically compatible — just needed
  manual reconciliation.
- **Fix:** Checked out the PR branch, merged `origin/main`. Resolved by keeping the wave-2 parallel
  structure, folding `main`'s new `agreedFare` select field into the parallelized order query, and
  folding `main`'s new fare-adjust `AuditLog` read into the existing 6-way `Promise.all` batch (it only
  depends on `orderIds`, same as its batch-mates) rather than leaving it as a stray sequential `await`
  — consistent with the PR's own stated perf goal. Ran `pnpm typecheck && pnpm lint && pnpm test`
  (1105 API tests / 483 mobile tests, all green, including the 23-test `notifications-feed.service.spec.ts`
  covering the fare-adjust row). **Note:** a concurrent session resolved this identical conflict
  independently while this fix was in progress; diffed the two resolutions (functionally identical,
  only comment/formatting differences) and adopted the already-pushed one rather than force-pushing a
  redundant duplicate.
- **Status:** CI green (CI + CodeQL success), `mergeable_state` turned `clean`. **Squash-merged** as
  commit `d52eb97`.

Zero drafts, zero stuck-auto-merge, zero unresolved-but-addressed review threads this run.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-13)` → **0 results.** Nothing to
resurrect this run.

Checked `git log origin/main --since=2026-07-13 --grep="Revert"` and a manual scan of the last 30
commit subjects on `main`: no revert commits. No reverted merge to diagnose.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green through `1095e70` (PR #340); runs for `87078e9` (PR #339) and `d52eb97` (PR #338) were in progress/queued as this report was written — no failures in the visible history. | **Green** |
| **Release (Cloud Run)** (production) | **STUCK — same recurring gate, now worse.** See escalation below. | **Blocked — needs human** |
| **Release Please** | One transient failure (`1095e70`: "No server is currently available to service your request" — a GitHub-side 5xx, not a code cause) superseded by a fresh green run already in progress for the latest commit (`d52eb97`) by the time this was checked — no re-run needed. | **Healthy** |
| **Deploy Admin Console (Cloud Run)** | **Also newly stuck on the same class of gate** — see escalation below. | **Blocked — needs human (new)** |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset), consistent with every prior report. | Dormant by design |
| **Deploy Autoheal** | No escalation issue opened; the stuck production runs are in `waiting`, not `failure`, so autoheal correctly did not fire. | No action needed |

### Escalation — production deploy gate stuck, now blocking TWO pipelines (recurring, longest and widest yet)

This is the same **KB-PROD-DEPLOY-GATE** issue flagged in the 07-17, 07-18, 07-19 02:20, and 07-19
20:10 reports. It has **not** been durably fixed, and this run it spread to a second workflow:

- **Release (Cloud Run), run [`29684160968`](https://github.com/unnfazzed/Lynia/actions/runs/29684160968)**
  (commit `dc9fbd8`, the v0.7.3 release-please merge): job `build · migrate · deploy` has been
  `waiting` on its `environment: production` reviewer gate since **2026-07-19 11:00:28 UTC** —
  **~15h20m** as of this report (up from 9h10m at 20:10 UTC, 2.5h at 02:20 UTC — the wait has grown
  every single report window with no clearing in between this time). Three newer commits (`1095e70`
  PR #340, `87078e9` PR #339, `d52eb97` PR #338 — all landed by this routine's own fixes this run)
  queued behind it and got auto-cancelled rather than deploying. **Last successful production deploy
  is still `0cfd3b5` (10:40:32 UTC 2026-07-19)** — production is now **4 commits and ~15h40m behind
  `main`**, including two PRs with real user-facing changes (BH-21/22 mobile fixes, wave-2 perf).
- **NEW this run — Deploy Admin Console (Cloud Run), run
  [`29711414283`](https://github.com/unnfazzed/Lynia/actions/runs/29711414283)** (commit `1095e70`,
  which touches `apps/admin`): job `build · smoke · deploy` has been `waiting` since **2026-07-20
  01:46:25 UTC** — ~35 minutes and growing as of this report. Confirmed by reading both workflow
  files (`release.yml` line 145, `deploy-admin.yml` line 59): **both jobs declare the identical
  `environment: production`** — this isn't two separate gates, it's the same single GitHub Environment
  protection rule now blocking two different workflows. This workflow is new (added 2026-07-18) and
  every run before this one deployed cleanly within ~1 minute of being queued; the required-reviewer
  rule on `production` was evidently re-added (or never fully removed) after the 07-17 report's fix,
  and now that it's live again it catches every workflow that targets that Environment, not just
  Release.
- As in every prior report, I could not unstick either myself: no `mcp__github__*` tool can approve a
  pending Environment deployment review (confirmed again this run via a fresh tool search) — only PR
  review methods exist, a different gate. Per the hard guardrails I must never bypass a gate I can't
  legitimately clear, and re-running either stuck run would not satisfy the environment-protection
  wait — it would just re-queue behind the same manual-approval requirement. Left both running rather
  than cancelling or re-triggering.

**Needs human — recommended next step (escalating in urgency — this is the fifth consecutive report
flagging this, the wait has now grown monotonically across four of those five, and it just spread to
a second pipeline):**
1. Approve the two pending deployments: [Release run `29684160968`](https://github.com/unnfazzed/Lynia/actions/runs/29684160968)
   and [Admin Console run `29711414283`](https://github.com/unnfazzed/Lynia/actions/runs/29711414283)
   (GitHub UI → Actions → each run → **Review deployments**). Approving the Release run will not
   auto-deploy the 3 commits queued behind it — those runs were already cancelled — so a fresh
   `workflow_dispatch` (or push-triggered) run against current `main` will be needed after approval to
   actually ship `1095e70`/`87078e9`/`d52eb97`.
2. This routine strongly recommends, again: go to **Settings → Environments → `production`** (the one
   Environment both `release.yml` and `deploy-admin.yml` target — confirmed by reading both workflow
   files) and either remove the required-reviewer rule for good this time or assign a reviewer/team
   who can approve promptly within minutes, not hours — plus a notification (Slack/email/PagerDuty
   webhook on the `deployment_status` event with state `waiting`) so a human is alerted the moment the
   gate engages. Since it's a single Environment, one fix clears both stuck pipelines. A recurring
   routine has no tool-level path to clear this, so without a config change or an attentive human,
   every future report will just re-flag a longer wait across an ever-growing set of workflows that
   happen to target `production`.

This remains — and worsens as — a carry-over item for the next run.

---

## Merged-but-not-shipped

- **`87078e9` / PR #339** (BH-21/22) — merged 02:19 UTC, ~3 min ago as of this report. Real
  user-facing mobile fixes. Not yet in production (behind the stuck gate above).
- **`d52eb97` / PR #338** (wave-2 perf) — merged 02:19 UTC, ~3 min ago as of this report. Real
  user-facing perf changes + 2 new endpoints. Not yet in production (behind the stuck gate above).
- **`1095e70` / PR #340** (UX20-01..04) — merged 01:46 UTC, ~36 min ago as of this report. Not yet in
  production (behind the stuck gate above); also the commit whose admin-console deploy is itself now
  stuck on the same `production` Environment gate via `deploy-admin.yml`.

All three are well under the 48h escalation threshold, but are flagged together because they're the
direct, growing evidence of the KB-PROD-DEPLOY-GATE escalation above — production's gap to `main` grew
from 1 commit (last report) to 4 commits this run, entirely because of the stuck gate, not because of
anything these PRs did wrong.

---

## Needs human

**KB-PROD-DEPLOY-GATE (fifth consecutive report; longest stall yet — ~15h40m and counting on
production; now also blocking the admin console deploy, ~35m and counting).** Production is 4 commits
behind `main` and the admin console is 1 commit behind, both because the single shared `production`
GitHub Environment's required-reviewer approval gate has not been cleared (`release.yml` and
`deploy-admin.yml` both declare `environment: production`). See the escalation section above for the
two remediation options (approve both pending runs — noting Release will still need a fresh run
afterward to actually ship the queued commits — or reconfigure/remove the gate so it stops silently stalling
every release). This routine cannot approve Environment deployment reviews or edit Environment
protection rules through the available `mcp__github__*` tools.
