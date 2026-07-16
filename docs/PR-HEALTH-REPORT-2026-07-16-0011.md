# PR Health & Delivery Report — 2026-07-16 00:11 UTC

**Summary:** 1 open PR checked (plus 1 Release Please PR that opened mid-run), 2 closed-unmerged
(last 7 days) reviewed, 5 deploy pipelines checked; 2 issues found, 2 fixed, 2 merged,
0 resurrected, 0 deploy re-runs needed, 1 escalated (recurring, already logged).

---

## A. Open PRs

Only one open PR at run start: [#264](https://github.com/unnfazzed/Lynia/pull/264) —
nightly bug-hunt fixes (BH-07..BH-12).

| Issue | Root cause | Action | Status |
|---|---|---|---|
| Green but unmerged | All 6 checks passed (`CodeQL`, `analyze`, `typecheck·build·test`, `dependency audit·secret scan`, `prisma migrate·constraint proof`, `auto-merge` skipped), `mergeable_state: clean`, no reviews/unresolved threads blocking | Merged (squash, `9062ba0`) | **Merged** |

Merging #264 triggered Release Please to open **[#265](https://github.com/unnfazzed/Lynia/pull/265)**
("chore(main): release 0.4.2") against the new `main` HEAD. This got the same get-green-and-merge
treatment as any other PR:

| Issue | Root cause | Action | Status |
|---|---|---|---|
| `mergeable_state: blocked`, CI's only run sat at conclusion `action_required`, 0 checks ever completed | Release Please opens PRs using the default `GITHUB_TOKEN`; a `GITHUB_TOKEN`-triggered push can't start further `pull_request`-triggered workflow runs the normal way — the one CI run that *was* created needed a trusted actor to kick it (bots don't self-approve). Identical root cause to the 2026-07-14 06:20 report's PR #234. Branch protection also requires an approving review a bot-authored PR never gets automatically. | Closed + reopened the PR (as the authenticated actor, not the bot) to retrigger CI — all 6 checks went green. Diff is trivial version-bump-only (`.release-please-manifest.json`, `apps/mobile/CHANGELOG.md`, `apps/mobile/app.config.ts`, `apps/mobile/package.json`) — approved, matching precedent from PR #234 (2026-07-14) and PR #132 (2026-07-13). Squash-merged. | **Merged** (`c3c89b4`) |

No other stuck auto-merge, no other drafts, no other conflicted PRs.

The dependency-audit `pnpm audit` HTTP 410 issue (`KB-CI-AUDIT-410`) flagged in the last four
reports is **resolved** — `ci.yml` now runs `osv-scanner` instead of `pnpm audit`; both #264 and
#265 show that check green.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-09)` → 2 results, both the same
dependabot "production-dependencies group" self-superseding chain documented in every prior
report (#161 → #171, superseded by later dependabot batches now outside the 7-day window).
Nothing dropped, nothing to resurrect.

No revert commits found on `main` in the last 7 days.

---

## C. Deployments

| Pipeline | Latest run vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | `c3c89b4` (current HEAD, post-#265 merge) | Green |
| **Release (Cloud Run)** (production) | Last **successful** deploy: `a2f5595` (0.4.1). Two newer runs (`9062ba0`, then `c3c89b4`) are queued behind the `build · migrate · deploy` job's `environment: production` manual-reviewer-approval gate | **Waiting on human approval** — see below |
| **Release Please** | `c3c89b4` (current HEAD) | Green |
| **Mobile Release (Play)** | n/a | Dormant by design (`EAS_RELEASE_ENABLED` unset), 0 runs |
| **Mobile OTA Update (expo-updates)** | n/a | Same — dormant by design, 0 runs |

**KB-PROD-DEPLOY-GATE recurred again** (documented in `docs/KNOWN_BUGS.md` since 2026-07-14):
`release.yml`'s `build · migrate · deploy` job requires a manual reviewer click on every run —
GitHub Environment protection, not something this routine can click through by design (no
environment-approval permission, and forcing through a production deploy gate without a human
sign-off would defeat the point of the gate). Both queued runs
([9062ba0 run](https://github.com/unnfazzed/Lynia/actions/runs/29460744489),
[c3c89b4 run](https://github.com/unnfazzed/Lynia/actions/runs/29461312865)) are healthy and ready
to proceed — they just need the click. No action taken beyond what's already logged in the
ledger; not re-adding a duplicate entry.

**Merged-but-not-shipped:** PR #264 (merged 00:11 UTC) and PR #265 (merged 00:26 UTC) — both
well under the 48h threshold, so not (yet) a hard violation, but both are waiting on the same
production approval click above. Once approved, `c3c89b4` (0.4.2) carries both.

---

## Needs human

1. **Click approve on the queued production deploy(s)** — `Release (Cloud Run)` runs for `9062ba0`
   and `c3c89b4` are both green up through the staging-wait job and sitting on the
   `environment: production` manual-approval step
   ([run 29460744489](https://github.com/unnfazzed/Lynia/actions/runs/29460744489),
   [run 29461312865](https://github.com/unnfazzed/Lynia/actions/runs/29461312865)). This is the
   same `KB-PROD-DEPLOY-GATE` steady-state noted in prior reports (2026-07-14 06:20 onward) —
   either keep clicking approve each time, or remove the required-reviewer rule on the
   `production` environment (Settings → Environments) if unattended releases are desired.
