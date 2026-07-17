# PR Health & Delivery Report — 2026-07-17 08:13 UTC

**Summary:** 0 open PRs checked, 2 closed-unmerged (last 7 days) reviewed, 5 deploy pipelines
checked; 0 failures found, 0 fixed, 0 merged, 0 resurrected, 0 deploy re-runs needed, 0 escalated.
One standing item from the previous report — **KB-PROD-DEPLOY-GATE — is now resolved** (observed,
not caused by this run).

---

## A. Open PRs

No open PRs at run start. Nothing to check, fix, or merge.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-10)` → 2 results, unchanged
from every prior report: [#171](https://github.com/unnfazzed/Lynia/pull/171) and
[#161](https://github.com/unnfazzed/Lynia/pull/161), both dependabot "production-dependencies
group" self-superseding closures (a newer dependabot PR replaced each before it could merge).
Nothing dropped, nothing to resurrect.

No revert commits on `main` (checked the last 30 commits, well past the 7-day window — all
forward feature/fix/release/docs/refactor merges, no `Revert` commits).

---

## C. Deployments

| Pipeline | Latest run vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Run `29564622347` green on `ec7d008` (current HEAD, merge of #291) | Green and current |
| **Release (Cloud Run)** (production) | Run `29564622315` green on `ec7d008` — `wait for green staging deploy` + `build · migrate · deploy` (including the canary graduated-shift) both succeeded, deploy job started ~1 minute after being queued | **Green and current — the manual-approval gate no longer blocks** (see below) |
| **Release Please** | Run on `ec7d008` completed successfully; no new release PR needed this cycle | Green, no action needed |
| **Mobile Release (Play)** | 0 recent runs | Dormant by design (`EAS_RELEASE_ENABLED` unset) |
| **Mobile OTA Update (expo-updates)** | 0 recent runs | Dormant by design, same as above |

**Merged-but-not-shipped:** none. PR #291 (merged 07:54:57 UTC) reached production via the
`ec7d008` release run, which completed successfully at 08:05:01 UTC — under 15 minutes
merge-to-production.

### KB-PROD-DEPLOY-GATE — resolved

The standing blocker logged in every report since 2026-07-14 (`release.yml`'s
`build · migrate · deploy` job wedging on a manual GitHub Environment reviewer-approval step) is
no longer reproducing:

- Run on `3c9e55b6ae` (queued 01:57 UTC, the run the previous report flagged as "waiting on human
  approval"): its deploy job sat `created` at 01:57 UTC and only `started` at 05:30 UTC — a ~3.5h
  gap consistent with a human clicking approve.
- Every release run since — `210eb6bd67` (deploy job queued 05:36, started 05:37) and `ec7d008`
  (deploy job queued 07:58, started 07:59) — started within about a minute of being queued, with
  no wait step. That's too fast to be a human clicking approve each time; the required-reviewer
  rule on the `production` GitHub Environment was evidently removed sometime between 01:57 and
  05:30 UTC today, matching the recommendation in every prior report.

Updated `docs/KNOWN_BUGS.md`: the `KB-PROD-DEPLOY-GATE` row now points to a new "Recently closed"
entry documenting this evidence. No code change, no PR needed for the underlying fix (it was a
GitHub Environment setting, not something in the repo) — only the ledger update is included here.

---

## Needs human

None. All PR and deploy lanes are green; the one standing item (production approval gate) is
resolved.
