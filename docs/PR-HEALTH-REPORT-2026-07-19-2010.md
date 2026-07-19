# PR Health & Delivery Report — 2026-07-19 20:10 UTC

**Summary:** 0 open PRs checked, 0 closed-unmerged reviewed (0 within the last 7 days), 5 deploy
pipelines checked; 1 failure found, 0 fixed (blocked by guardrails — needs human), 0 merged,
0 resurrected, 0 deploy re-runs needed (re-run would not clear the blocking gate), 1 escalated.

---

## A. Open PRs

`list_pull_requests(state=open)` → **0 open PRs.** Nothing to check for CI failures, merge
conflicts, stuck auto-merge, or stale drafts.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-12)` → **0 results.** Nothing
to resurrect this run.

Checked `git log origin/main --since=2026-07-12` for revert commits: none. (A grep for "revert"
only matched false positives — mentions of the word "revert" inside prior PR-health report bodies
and one code comment, not actual `git revert` commits.) No reverted merge to diagnose.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green and current — latest run (`29684160964`) succeeded for `dc9fbd8` (current `main` HEAD, PR #335 merge). | **Green and current** |
| **Release (Cloud Run)** (production) | **STUCK again.** See escalation below. | **Blocked — needs human** |
| **Release Please** | Green and current — latest run succeeded for `dc9fbd8`. Healthy on every push this session. | Healthy |
| **Deploy Admin Console (Cloud Run)** | Path-filtered to `apps/admin/**` (new workflow, added 2026-07-18). Latest relevant run (`fcdca213b6`, UX19 commit) succeeded. No `apps/admin` changes have landed since, so no new runs expected — this is current for its scope, not stale. Earlier same-day failures on `5a485b6663` (12:06–12:07 UTC 07-18) were already fixed forward by `b8fd7d0` ("pin PORT=8080 in the admin image") before this run window; not a new issue. | **Green and current for its scope** |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset), consistent with every prior report. | Dormant by design |
| **Deploy Autoheal** | No escalation issue opened; the stuck production run is in `waiting`, not `failure`, so autoheal correctly did not fire. | No action needed |

### Escalation — Release (Cloud Run) stuck on the production required-reviewer gate (recurring, now worse)

This is the same **KB-PROD-DEPLOY-GATE** issue flagged in the 07-17, 07-18, and 07-19 02:20
reports, and it has **not** been durably fixed:

- Run [`29684160968`](https://github.com/unnfazzed/Lynia/actions/runs/29684160968) (commit
  `dc9fbd8`, the current `main` HEAD — PR #335, release-please merge): job
  `wait for green staging deploy` succeeded at 11:00:26 UTC, immediately followed by job
  `build · migrate · deploy` entering `waiting` status at 11:00:28 UTC. As of this report
  (20:10 UTC) it has been stuck for **~9 hours 10 minutes** — considerably longer than the 2.5h
  wait reported at 02:20 UTC today, which a human evidently cleared at some point between then and
  now (the run for `03ff2e951a` at 23:44 the prior day did go on to succeed, and several
  more commits deployed cleanly afterward: `fbb8ee8` through `0cfd3b5`).
- Net effect: **production is one commit behind `main`** — the last successful production deploy
  was for `0cfd3b5` (10:40:32 UTC); `dc9fbd8` (the release-please merge for v0.7.3, containing no
  code changes beyond the version bump — see `c4869f1`) has not shipped.
- As before, I could not unstick this myself: the available `mcp__github__*` tools (confirmed by
  a fresh search this run) have no method to approve a pending Environment deployment review —
  only PR review methods exist (`pull_request_review_write`), which are a different gate. Per the
  hard guardrails I must never trigger Rollback or bypass a gate I can't legitimately clear, and
  re-running the stuck run would not satisfy the environment-protection wait — it would just
  re-queue behind the same manual-approval requirement. I left it running rather than cancelling
  or re-triggering it.

**Needs human — recommended next step (unchanged from prior reports, now more urgent given the
pattern of recurrence):**
1. Approve the pending deployment on run
   [`29684160968`](https://github.com/unnfazzed/Lynia/actions/runs/29684160968) (GitHub UI →
   Actions → that run → **Review deployments**).
2. Given this is now the **fourth consecutive report window** flagging inconsistent/stuck behavior
   on this gate (07-17, 07-18, 07-19 02:20, and now 07-19 20:10, with the stuck duration trending
   up — 2.5h → 9h10m), strongly recommend going to **Settings → Environments → `production`** and
   either removing the required-reviewer rule (if it isn't meant to gate every single deploy) or
   assigning a reviewer/team who can approve promptly, and/or wiring a notification so a human is
   alerted the moment a deploy enters `waiting`. A routine like this one cannot approve Environment
   deployment reviews through any available tool, so unattended runs will keep stalling production
   indefinitely until the gate itself is reconfigured.

This remains a carry-over item for the next run: re-check whether a human has approved it, and if
not, re-flag with updated wait time.

---

## Merged-but-not-shipped

**`dc9fbd8` / PR #335 (v0.7.3 release-please merge)** — merged at 10:54 UTC, ~9h15m ago as of this
report. Under the 48h threshold, but flagged because it is the commit stuck behind the production
gate above; it contains no code changes beyond the version bump (the code changes it packages,
`0cfd3b5` and `4065689`, already shipped to production earlier today).

---

## Needs human

**KB-PROD-DEPLOY-GATE (fourth consecutive report, longest stall yet: ~9h10m and counting).**
Production is one commit behind `main` because the `production` Environment's required-reviewer
approval gate has not been cleared. See the escalation section above for the two remediation
options (approve the pending run, or reconfigure/remove the gate so it stops silently stalling
every release). This routine cannot approve Environment deployment reviews or edit Environment
protection rules through the available `mcp__github__*` tools.
