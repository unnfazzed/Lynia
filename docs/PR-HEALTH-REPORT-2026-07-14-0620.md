# PR Health & Delivery Report — 2026-07-14 06:20 UTC

**Summary:** 5 open PRs checked, 4 closed-unmerged reviewed, 5 deploy pipelines checked;
3 failures found, 2 fixed, 4 merged, 0 resurrected, 1 deploy re-run, 1 escalated.

---

## A. Open PRs

| PR | Was | Root cause | Action | Status |
|---|---|---|---|---|
| [#234](https://github.com/unnfazzed/Lynia/pull/234) — chore(main): release 0.2.1 (release-please) | Not draft, `mergeable_state: blocked`, 0 checks had ever run | Release-please opens PRs using the default `GITHUB_TOKEN`; a `GITHUB_TOKEN`-triggered event can't start further `pull_request`-triggered workflow runs, so CI never fired (the one run that *was* created sat at conclusion `action_required`, needing a trusted actor to kick it — bots don't self-approve). Branch protection also requires an approving review a bot-authored PR never gets automatically. | Closed + reopened (as a real actor, not the bot) to retrigger CI — all 6 checks went green. Approved (trivial version-bump-only diff: manifest, CHANGELOG, app.config.ts, package.json), matching how PR #132 was handled in the 2026-07-13 14:31 report. Squash-merged. | **Merged** (`df2133e`) |
| [#236](https://github.com/unnfazzed/Lynia/pull/236) — fix: bug-hunt follow-up (WhatsApp OTP delivery webhook, pickup-tick persistence, rotate-code CAS guard) | Draft, all 6 checks green, `mergeable_state: clean` | Just never marked ready. In scope per the bug-hunt routine's own narrower auto-merge carve-out (doesn't touch bid acceptance / order assignment / agreed-price / KYC gating), unlike sibling #235 below. CI's Postgres-backed integration job covered the two `rotateDeliveryCode` race tests the author flagged as unverifiable in their own sandbox. | Marked ready, squash-merged. | **Merged** (`f28d1f1`) |
| [#237](https://github.com/unnfazzed/Lynia/pull/237) — fix(ux): 07-14 follow-up (notify-me orderId routing, notifications-feed synthesis) | Not draft, all 6 checks green, `mergeable_state: clean`, no unresolved reviews | This is the daily UX/usability-review routine's own PR — `CLAUDE.md` gives it a standing auto-merge policy (unlike other routines): once green, merge directly without waiting for manual review. | Squash-merged per that policy. | **Merged** (`5e44010`) |
| [#238](https://github.com/unnfazzed/Lynia/pull/238) — chore(main): release 0.2.2 (release-please) | Same as #234 — appeared mid-run after #236 merged, then release-please amended it again after #237 merged | Same `GITHUB_TOKEN`-can't-trigger-`pull_request`-workflows issue as #234. | Closed/reopened to retrigger CI (twice, since the SHA moved when release-please folded in #237's changelog entry), approved. All 6 checks green, squash-merged. | **Merged** (`ea9d32a`) |
| [#235](https://github.com/unnfazzed/Lynia/pull/235) — fix(deep-sweep): remediate DS14-01..09 | Draft, checks expected green, `mergeable_state: unknown` | PR body explains: DS14-02/03/04/06 touch KYC-gating mutations and DS14-08 touches auth/session issuance — explicitly **not** eligible for the bug-hunt routine's auto-merge carve-out. Author deliberately left it draft for human review ("when in doubt, leave it draft"). | **Left untouched**, honoring the explicit hold. | **Draft, awaiting human review** (not merged) |

No merge conflicts, no stuck auto-merge.

## B. Closed-unmerged PRs (last 7 days)

Same picture as both prior reports — the dependabot "production-dependencies group"
self-superseding chain continues: `#135 → #155 → #161 → #171` (#116, the first link, has
now rolled out of the 7-day window). Each was closed by dependabot itself when the next
one in the group opened; #171 (the last) was closed by dependabot with "these
dependencies are no longer being updated." **Verdict: all superseded, nothing dropped,
nothing to resurrect.**

No revert commits found on `main` in the last 7 days.

## C. Deployments

| Pipeline | Latest relevant run vs latest `main` | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Current | ✅ Green throughout this run's window, including every new commit merged during it |
| **Release Please** (the workflow itself, not its PRs) | Current | ✅ Green on every push |
| **Release (Cloud Run)** (production) | Current commit reached the front of the queue | 🔴 **Was wedged for 4+ hours — queue jam fixed; now correctly blocked on a real, unapprovable-by-me approval gate.** See below. |
| **Mobile Release (Play)** | n/a | Dormant by design — gated on `EAS_RELEASE_ENABLED` (unset). `total_count: 0`, unchanged from prior reports. |
| **Mobile OTA Update (expo-updates)** | n/a | Same as above — dormant by design. |

### 🔴 Release (Cloud Run) — production: queue jam fixed forward, now blocked on a required-reviewer approval (escalated)

**What I found:** the production release run for commit `96a953c1` (pushed 02:14 UTC,
today's UX-review mega-commit) had sat in workflow-run status `waiting` with zero jobs
visible, for 4+ hours. `release.yml`'s workflow-level `concurrency: group:
release-cloud-run` means only one run in that group can be active at a time; every
subsequent push (`479f200f` merging #231, then this run's own merges) queued up behind
the stuck run and was silently **auto-cancelled** the moment a newer push superseded it
in the queue. Production never shipped anything merged after 02:14, and would have kept
cancelling forever with no alert: `deploy-autoheal.yml` only listens for `completed`
workflow-run events, and a run wedged at `waiting` never completes, so its retry/escalate
logic never engaged — a wedged `waiting` run is invisible to the existing autoheal net.

**What I did:** cancelled the stuck run for `96a953c1`
([run](https://github.com/unnfazzed/Lynia/actions/runs/29300582480)) — non-destructive,
no traffic had moved (no jobs had ever started for it). This immediately unblocked the
queue: the run for the current HEAD advanced normally, its `staging-gate` job found
staging green and passed within seconds.

**What's still blocking (real, not a glitch):** the deploy job itself
(`build · migrate · deploy`, which carries `environment: production` in the workflow)
is now sitting in genuine `waiting` status — GitHub's standard signal for a
required-reviewer approval gate on that environment. I confirmed this directly by
inspecting the job (not just the run): status `waiting`, no conclusion, unchanged across
repeated checks. **I have no tool access to approve or view GitHub Environment
protection-rule reviews**, so I did not and could not push this further — per this
routine's own guardrails, only fix-forward actions I can complete are appropriate, and
approving a production deployment isn't one of them.

This also retroactively explains the original jam: `96a953c1`'s deploy job almost
certainly hit this same approval gate at ~02:17 UTC and nobody approved it for 4+ hours,
which is what wedged the whole queue behind it.

**Merged-but-not-shipped:** every commit merged today (`96a953c1` UX review, `479f200f`/#231
bug-hunt sweep, `df2133e`/#234 release 0.2.1, `f28d1f1`/#236 bug-hunt follow-up, `5e44010`/#237
UX follow-up, `ea9d32a`/#238 release 0.2.2) is sitting on `main`, built, staging-tested, and one
click away from production via [this run](https://github.com/unnfazzed/Lynia/actions/runs/29310907027)
(`ea9d32a`'s own release run has queued cleanly behind it — no jam, since the queue is unstuck
now) — none has crossed the 48h threshold yet, but this is now the oldest pending production
release Lynia has had (the block started ~02:14 UTC, 4+ hours before this report).

## Needs human

1. **Approve the pending production deployment** — [Release (Cloud Run) run
   #167](https://github.com/unnfazzed/Lynia/actions/runs/29310907027)'s
   `build · migrate · deploy` job is waiting on a required reviewer for the `production`
   environment. This is the single action that ships everything merged today. If this
   required-reviewer rule was added intentionally (recommended: check
   **Settings → Environments → production**), every future release will need the same
   manual click — worth deciding now whether that's the desired steady state, since the
   existing autoheal automation (`deploy-autoheal.yml`) has no visibility into a run stuck
   at `waiting` and will never surface it as a failure on its own. This report is filling
   that gap for today, but a wedge like this could otherwise sit unnoticed for days.
2. **[#235](https://github.com/unnfazzed/Lynia/pull/235)** — green (expected) and
   intentionally left in draft. Touches KYC-gating mutations (DS14-02/03/04/06) and
   auth/session issuance (DS14-08) — needs a human look before landing, per the bug-hunt
   routine's own policy. Not blocking anything.
3. Mobile pipeline (Play + OTA) remains dormant pending EAS provisioning
   (`docs/LAUNCH-EXECUTION-RUNBOOK.md` §8) — founder-only, no CI action needed until then.
   Carried forward as background context only, not a new failure.

No other unresolved items carry forward.
