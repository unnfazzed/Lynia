# PR Health & Delivery Report — 2026-07-17 02:17 UTC

**Summary:** 1 open PR checked, 2 closed-unmerged (last 7 days) reviewed, 5 deploy pipelines
checked; 1 failure found, 1 fixed, 1 merged, 0 resurrected, 0 deploy re-runs needed, 1 escalated
(recurring, already logged).

---

## A. Open PRs

Only one open PR at run start: [#285](https://github.com/unnfazzed/Lynia/pull/285) — nightly
bug-hunt fixes (BH-13, BH-14, mobile board/active-job reconciliation + stale bid-draft expiry).

| Issue | Root cause | Action | Status |
|---|---|---|---|
| Merge-conflicted (`mergeable_state: dirty`), checks were all green | `#285`'s base (`c048a7e6`, before `#284`) was 4 commits behind `main` by the time this run started (`#283`, `#284`, `#281` release, `#286` UX review had all merged); `#286`'s UX ledger entry and `#285`'s own bug-hunt ledger entry both touched the same `docs/KNOWN_BUGS.md` header/section, producing a real content conflict (not a rename/move) | Checked out the PR branch locally, rebased onto `origin/main` (`git rebase origin/main`). One conflict, in `docs/KNOWN_BUGS.md`: both the "Last consolidated" header and a dated section were additive entries from two different routines; merged them by keeping the newer UX-2026-07-17 entry on top and re-inserting the bug-hunt-2026-07-16-night entry as the next "Prior consolidation" line/section (no content dropped from either side). Ran `pnpm install` (needed a `prisma generate` — the generated client wasn't present, causing spurious `PrismaService` property-not-found errors), then `pnpm typecheck && pnpm test`: clean across all 5 packages, 1003 API tests + 410 mobile tests green. Pushed with `--force-with-lease` to the same branch (`claude/vigilant-franklin-xsuh68`) | Rebased, CI re-ran all 6 checks green, **merged** (squash, `2765c17`) |

No other stuck auto-merge, no other drafts, no other conflicted PRs. No open Release Please PR
at run end (it evaluated the latest mobile-scoped commits and found nothing release-worthy this
cycle — informational, not a failure; see Section C).

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged)` → 6 results; only 2 fall inside the 7-day
window (`closed:>=2026-07-10`): [#171](https://github.com/unnfazzed/Lynia/pull/171) and
[#161](https://github.com/unnfazzed/Lynia/pull/161), both dependabot "production-dependencies
group" self-superseding closures — the same chain documented in every prior report. Nothing
dropped, nothing to resurrect.

No revert commits found on `main` in the last 7 days (checked the last 30 commits on `main`,
which cover well past the 7-day window — all forward feature/fix/release/docs merges, no
`Revert` commits).

---

## C. Deployments

| Pipeline | Latest run vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Run #101 green on `3c9e55b` (HEAD at run start); merging `#285` produced `2765c17` and triggered run #102, which was still `in_progress` as this report was written | Green / in progress on the newest commit, nothing to fix |
| **Release (Cloud Run)** (production) | Run on `3c9e55b` (pre-`#285`): the "wait for green staging deploy" gate job succeeded, then `build · migrate · deploy` parked on the `environment: production` manual-reviewer-approval step | **Waiting on human approval** (see below) — merging `#285` will queue another run behind the same gate |
| **Release Please** | Run on `3c9e55b` completed successfully; evaluated commits since the last mobile release (`v0.6.0`) and found none release-worthy for the `apps/mobile` component this cycle (its config only tracks that one component) | Green, no action needed |
| **Mobile Release (Play)** | n/a | Dormant by design (`EAS_RELEASE_ENABLED` unset), 0 recent runs |
| **Mobile OTA Update (expo-updates)** | n/a | Same — dormant by design, 0 recent runs |

**KB-PROD-DEPLOY-GATE recurred again** (documented in `docs/KNOWN_BUGS.md` since 2026-07-14):
`release.yml`'s `build · migrate · deploy` job requires a manual reviewer click on every run —
GitHub Environment protection, not something this routine can click through by design (no
environment-approval permission, and forcing a production deploy through without human sign-off
would defeat the point of the gate). No action taken beyond what's already logged in the ledger;
not re-adding a duplicate entry.

**Merged-but-not-shipped:** PR #285 (merged 02:17 UTC) is well under the 48h threshold, but — like
every merge since 2026-07-14 — it's waiting on the same production-approval click noted above.

---

## Needs human

1. **Click approve on the queued/upcoming production deploy(s)** for `Release (Cloud Run)` — the
   `environment: production` manual-approval step is the standing `KB-PROD-DEPLOY-GATE` blocker
   noted in every report since 2026-07-14 06:20. Either keep clicking approve each time, or remove
   the required-reviewer rule on the `production` environment (Settings → Environments) if
   unattended releases are desired.
