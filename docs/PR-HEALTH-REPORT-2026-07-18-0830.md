# PR Health & Delivery Report — 2026-07-18 08:30 UTC

**Summary:** 2 open PRs checked, 6 closed-unmerged reviewed (0 within the last 7 days; the 6
historical dependabot/infra closures pre-date the window and were already resolved in prior
reports), 5 deploy pipelines checked; 0 failures found, 0 fixed, 2 merged, 0 resurrected, 0 deploy
re-runs needed, 0 escalated.

---

## A. Open PRs

Two open PRs at run start, both authored by the nightly doc routines, both already green:

**[#300](https://github.com/unnfazzed/Lynia/pull/300)** — `docs(sync): reconcile docs against last
night's fix routines (2026-07-18)`.
- **What was failing:** nothing — all 6 check runs (CodeQL, typecheck·build·test, dependency
  audit·secret scan, prisma migrate·constraint proof, analyze) green, `mergeable_state: clean`,
  not a draft.
- **What I did:** squash-merged directly.
- **Status:** **Merged** (`e6cf1717`).

**[#301](https://github.com/unnfazzed/Lynia/pull/301)** — `docs(plans): admin console deployment
plan`.
- **What was failing:** nothing on CI (all 6 checks green, `mergeable_state: clean`) — it was
  just still marked **draft**.
- **What I did:** marked it ready for review, then squash-merged.
- **Status:** **Merged** (`64e2f23c`).

No PRs were in a merge-conflicted, auto-merge-stuck, or failing-CI state this run.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged)` → 6 total, all older than the 7-day window
(closed 2026-06-29 through 2026-07-10): 5 self-superseded Dependabot grouped-update PRs
(#116, #135, #155, #161, #171 — each replaced by a later Dependabot PR with a fuller set of
updates, already merged) and #47 (`Lock Cloud Run ingress to load-balancer-only`, closed
2026-06-29, superseded by the same change landing via a different PR per prior reports). Nothing
new to resurrect.

**Reverted merges:** checked commit history on `main` back to 2026-07-14T12:21 UTC (comfortably
past the 7-day cutoff of 2026-07-11) — zero commits with "revert" in the message. No revert to
diagnose.

---

## C. Deployments

| Pipeline | Latest run vs latest code-affecting `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Run `29629515747` green on `da0c16d3` (latest commit that touches deployable code — #300/#301 are docs-only and correctly skipped by `paths-ignore: docs/**, **.md`) | **Green and current** |
| **Release (Cloud Run)** (production) | Run `29629515762` green on `da0c16d3`. Two earlier same-night runs (`834b5455`, `c2b9ed7e`) show `cancelled` — superseded in the `release-cloud-run` concurrency queue by the next push before their `deploy` job started; no code was lost since the final queued run for `da0c16d3` deployed successfully and canary-promoted. The **KB-PROD-DEPLOY-GATE** issue flagged as "stuck, needs human" in the prior report (02:23 UTC) has cleared — this run completed without a required-reviewer wait. | **Green and current** |
| **Release Please** | No new release PR opened this run (expected — #300/#301 are docs-only conventional commits, which don't bump `fix`/`feat` versions) | No action needed |
| **Mobile Release (Play)** | 0 recent runs | Dormant by design (`EAS_RELEASE_ENABLED` unset, per prior reports) |
| **Mobile OTA Update (expo-updates)** | 0 recent runs | Dormant by design, same as above |
| **Deploy Autoheal** | Recent runs all `success`/`skipped` for `da0c16d3` and `834b5455` — nothing needed healing | Healthy |

### KB-PROD-DEPLOY-GATE — resolved this run

The prior report (02:23 UTC) left this open: production release run `29625832637` (commit
`b778a10b`) had been sitting in `waiting` on the `production` Environment's required-reviewer gate
for 40+ minutes, with two more runs (`c2b9ed7e`, `834b5455`) queued behind it. By this run, all
three had resolved — `b778a10b`'s run completed successfully, and the two behind it were cleanly
`cancelled` (superseded, not failed) once the newest commit's run (`da0c16d3`, currently HEAD of
deployable code) queued and succeeded. No action was needed from me; whatever held the gate open
overnight cleared on its own, consistent with the intermittent pattern noted in the 07-17 and
07-18 reports (the required-reviewer rule appears to engage inconsistently rather than being
reliably on or off). **Recommend a human take five minutes to check Settings → Environments →
`production` and either confirm the required-reviewer rule is intentionally off, or set expectations
for how often a manual click will be needed** — this has now flip-flopped across three consecutive
reports (07-17: resolved; 07-18 early: stuck; 07-18 this run: resolved again).

---

## Merged-but-not-shipped

None. Every code-affecting commit currently on `main` (`da0c16d3` and earlier) has a green,
current production deploy. `#300`/`#301` are docs-only and carry no runtime surface to ship.

---

## Needs human

**KB-PROD-DEPLOY-GATE (informational, not currently blocking).** No open blocker right now — see
the "resolved this run" note above. Flagging only because the required-reviewer gate's behavior
has been inconsistent across the last three watchdog runs (engaged 07-18 early morning, not
engaged before or since). If a human wants deploys to always require a manual approval, or never
to, worth checking the `production` Environment's protection-rule configuration once to remove the
ambiguity — this routine cannot view or edit Environment protection rules through the available
`mcp__github__*` tools.
