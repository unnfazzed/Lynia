# PR Health & Delivery Report — 2026-07-19 02:20 UTC

**Summary:** 1 open PR checked, 0 closed-unmerged reviewed (0 within the last 7 days), 5 deploy
pipelines checked; 1 failure found, 1 fixed, 1 merged, 0 resurrected, 0 deploy re-runs needed
(none possible — see below), 1 escalated.

---

## A. Open PRs

Only one open PR at run start: **[#324](https://github.com/unnfazzed/Lynia/pull/324)** —
`chore(main): release 0.7.1` (Release Please bot PR).

| Issue | Root cause | Action | Status |
|---|---|---|---|
| `mergeable_state: blocked`, 0 check runs, 0 combined status | Same recurring pattern as prior reports (#249, #265, #297): Release Please opens this PR using the default `GITHUB_TOKEN`, and a `GITHUB_TOKEN`-authored push can't trigger further `pull_request`-scoped workflow runs — CI never fired. Also held on required code-owner review (CODEOWNERS `* @unnfazzed`). | Verified the diff was mechanical-only (`.release-please-manifest.json`, `apps/mobile/CHANGELOG.md`, `app.config.ts` version line, `package.json` version — no code changes). Closed + reopened the PR as the authenticated actor to retrigger CI — all 6 checks went green (`CodeQL`, `analyze`, `typecheck · build · test`, `prisma migrate · constraint proof`, `dependency audit · secret scan`, `auto-merge` [skipped, expected]). Submitted the code-owner approval. | **Merged** (squash, `d8dd28b`), tagging **v0.7.1**. |

No other open PRs, so no merge conflicts, no other stuck auto-merges, no other drafts.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-12)` → **0 results**. Nothing to
resurrect this run. No revert commits found on `main` in the recent history reviewed (`d8dd28b`
back through `fbb8ee8`) — no reverted merge to diagnose.

---

## C. Deployments

| Pipeline | Latest state vs latest `main` commit | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Green and current for both code-affecting commits since the last report (`03ff2e951a` BH-18..20, `fcdca213b6` UX19) — runs `29665749644` and `29668978641` both `success`. Its own concurrency group (`deploy-staging`) is independent of production's, so it is not affected by the issue below. | **Green and current** |
| **Release (Cloud Run)** (production) | **STUCK.** See escalation below. | **Blocked — needs human** |
| **Release Please** | Ran and completed successfully on every push this session, including the new `d8dd28b` release-tag push. | Healthy |
| **Mobile Release (Play)** / **Mobile OTA Update** | 0 recent runs — dormant by design (`EAS_RELEASE_ENABLED` unset, consistent with all prior reports). Note: merging #324 tagged `v0.7.1` with the default `GITHUB_TOKEN`, which per `release-please.yml`'s own documented limitation does **not** trigger `mobile-release.yml`'s tag-push trigger — expected, not a new failure. | Dormant by design |
| **Deploy Autoheal** | 0 in-progress/waiting runs; no escalation issue opened for this session (autoheal reacts to `failure` conclusions, and the stuck production run is in `waiting`, not `failure`, so it correctly did not fire). | No action needed |

### Escalation — Release (Cloud Run) stuck on the production required-reviewer gate

Job `wait for green staging deploy` succeeded for commit `03ff2e951a` (BH-18..20) at 23:47:37 UTC,
but the next job, **`build · migrate · deploy`** (run
[`29665749616`](https://github.com/unnfazzed/Lynia/actions/runs/29665749616)), has sat in
`waiting` status ever since — almost certainly the `production` Environment's required-reviewer
approval gate, the same **KB-PROD-DEPLOY-GATE** flagged as intermittently engaging in the 07-17
and 07-18 reports. This time it has **not** cleared on its own:

- Run `29665749616` (commit `03ff2e951a`, BH-18..20 fixes): stuck in `waiting` for 2.5+ hours as
  of this report.
- Run `29668978684` (commit `fcdca213b6`, UX19 fixes): stuck in `pending`, queued behind the
  above in the `release-cloud-run` concurrency group (`cancel-in-progress: false`).
- Merging #324 this run added a **third** commit (`d8dd28b`, the 0.7.1 version bump) that will
  queue behind both once its run is created.

**Net effect: production has not shipped BH-18..20 or UX19 despite both being green on staging
for hours, and the queue is growing with each subsequent push instead of draining.**

I could not unstick this myself: the available `mcp__github__*` tools have no method to approve a
pending deployment review (only PR reviews, not Environment deployment reviews), and per the hard
guardrails I must never trigger the Rollback workflow or force through a gate I can't legitimately
clear. Re-running or cancelling the stuck run would not bypass the environment protection rule and
risks discarding the already-completed staging-gate wait, so I left it alone rather than guessing.

**Needs human — recommended next step (either one):**
1. Approve the pending deployment on run
   [`29665749616`](https://github.com/unnfazzed/Lynia/actions/runs/29665749616) (GitHub UI →
   Actions → that run → **Review deployments**). The two queued runs behind it should then follow
   automatically without further intervention.
2. If this gate isn't meant to require a manual click on every deploy, go to **Settings →
   Environments → `production`** and remove/adjust the required-reviewer rule — this is the third
   consecutive report window in which this gate's behavior has been inconsistent (engaged
   overnight 07-18, resolved by the next check, now stuck again for 2.5+ hours and not clearing).

This is a carry-over item for the next run: if still unresolved, re-check whether a human has
approved it, and if not, re-flag with updated wait time and queue depth.

---

## Merged-but-not-shipped

**#324 / v0.7.1** (containing BH-18..20 and UX19 fixes) merged at 02:14 UTC — well under the 48h
threshold, but flagged here because its production release is the one stuck on the gate above,
not because of its age.

---

## Needs human

**KB-PROD-DEPLOY-GATE (now actively blocking, not just inconsistent).** Production has not
deployed in 2.5+ hours despite two green-on-staging fix commits waiting, and a third is now
queued behind them. See the escalation section above for the two remediation options. This
routine cannot approve Environment deployment reviews or edit Environment protection rules
through the available `mcp__github__*` tools — a human needs to either click approve once or fix
the gate's configuration.
