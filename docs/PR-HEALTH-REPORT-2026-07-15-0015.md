# PR Health & Delivery Report — 2026-07-15 00:15 UTC

**Summary:** 1 open PR checked, 4 closed-unmerged (last 7 days) reviewed, 5 deploy pipelines
checked; 3 issues found, 1 fixed, 0 merged, 0 resurrected, 0 deploy re-runs needed, 2 escalated.

---

## A. Open PRs

Only one open PR: [#249](https://github.com/unnfazzed/Lynia/pull/249) — `chore(main): release
0.2.4` (release-please bot PR, version-bump-only diff: manifest, mobile `CHANGELOG.md`,
`app.config.ts`, `package.json`).

| Issue | Root cause | Action | Status |
|---|---|---|---|
| `mergeable_state: blocked`, 0 checks had ever run | Same recurring pattern as prior reports (#234, #238): release-please opens PRs using the default `GITHUB_TOKEN`, and a `GITHUB_TOKEN`-authored event can't trigger further `pull_request`-scoped workflow runs, so CI never fired. | Closed + reopened the PR as a real actor to retrigger CI. | **Fixed** — CI ran: 5/6 checks green (`typecheck · build · test`, `prisma migrate · constraint proof`, `CodeQL`, `analyze`, `auto-merge` [skipped, expected]). |
| `dependency audit · secret scan` check **fails** | Not this PR's fault — see **KB-CI-AUDIT-410** below. `pnpm audit --audit-level high` hard-fails because npmjs.org retired both its quick and bulk audit endpoints (HTTP 410, `ERR_PNPM_AUDIT_BAD_RESPONSE`), unrelated to any real advisory in this repo's dependency tree. This is a **repo-wide CI break**, not specific to #249 — every open and future PR (including this report's own PR) will fail the same check until it's addressed. | Drafted a fix to `.github/workflows/ci.yml` (details below) but did **not** push it: the run's own safety classifier withheld the edit, since it modifies a security gate (SCA/dependency-audit step) and this is an unattended background run with no human present to confirm that kind of change. Logged as **KB-CI-AUDIT-410** with the proposed diff for a human to review. | **Not merged.** Per guardrails, never merge on a failing/missing check — #249 stays open, green on everything except this one repo-wide, non-#249-specific check. |

**Proposed fix (not applied — needs human review/approval):**

```yaml
      - name: pnpm audit (high+)
        run: |
          set +e
          output=$(pnpm audit --audit-level high 2>&1)
          status=$?
          echo "$output"
          set -e
          if [ $status -ne 0 ]; then
            if echo "$output" | grep -q "ERR_PNPM_AUDIT_BAD_RESPONSE" && echo "$output" | grep -q "410"; then
              echo "::warning::pnpm audit endpoint returned 410 (retired by npmjs.org) — SCA gate skipped for this run, not a code failure. See docs/KNOWN_BUGS.md."
              exit 0
            fi
            exit $status
          fi
```

This only treats the specific 410/`ERR_PNPM_AUDIT_BAD_RESPONSE` response as non-blocking; any other
`pnpm audit` failure (a real high/critical advisory, or a different registry error) still fails the
job exactly as before. Alternative: swap to an SCA tool that doesn't depend on the retired npm
endpoint (e.g. `osv-scanner` against `pnpm-lock.yaml`), which would avoid touching the "fail on
error" semantics at all.

No merge conflicts. No stuck auto-merge. No other drafts.

---

## B. Closed-unmerged PRs (last 7 days)

`search_pull_requests(is:pr is:closed is:unmerged closed:>=2026-07-08)` → 4 results, all part of
the previously-documented dependabot "production-dependencies group" self-superseding chain:
`#135 → #155 → #161 → #171`. Each was closed by dependabot itself when the next PR in the group
opened; #171 (the last link) was closed with "these dependencies are no longer being updated."
Matches the verdict in every prior report. **Nothing dropped, nothing to resurrect.**

No revert commits found on `main` in the last 7 days (`git log --oneline --since="7 days ago" |
grep -i revert` → empty).

---

## C. Deployments

| Pipeline | Latest run vs latest `main` (`8d6703a`) | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Current | ✅ Green on `8d6703a` (run [29376578274](https://github.com/unnfazzed/Lynia/actions/runs/29376578274)) |
| **Release Please** (workflow itself) | Current | ✅ Green on `8d6703a` — this is the run that opened PR #249 |
| **Release (Cloud Run)** (production) | `8d6703a` | 🔴 **Stuck in `waiting`, unapprovable by me.** See below. |
| **Mobile Release (Play)** | n/a | Dormant by design — gated on `EAS_RELEASE_ENABLED` (unset), `total_count: 0`, unchanged |
| **Mobile OTA Update (expo-updates)** | n/a | Same — dormant by design |

### 🔴 Release (Cloud Run) — production: recurring required-reviewer approval gate (escalated)

Run [29376578226](https://github.com/unnfazzed/Lynia/actions/runs/29376578226) for `8d6703a`
(current `main` HEAD, merged 23:35 UTC 2026-07-14): its `wait for green staging deploy` job passed
(staging went green within 4 minutes), but the `build · migrate · deploy` job — which carries
`environment: production` — has sat in `waiting` status since 23:38:58 UTC 2026-07-14 with no
conclusion. This is GitHub's standard signal for a required-reviewer approval gate on the
`production` environment. I have no tool access to approve GitHub Environment protection-rule
reviews, so per this routine's guardrails I did not and could not push this further.

This is the **same recurring issue** first documented in the 2026-07-14 06:20 report (wedged the
release queue 4+ hours that day) and periodically resolved by a human click since (production did
successfully deploy `e1aa97f`/`fc7bb8e`/`6942e4e` later that day per the 12:35 report). Logged now
as **KB-PROD-DEPLOY-GATE** in the ledger so future runs stop re-diagnosing the same root cause.

**Merged-but-not-shipped:** `8d6703a` (this run's only new commit on `main`) is built, staging-
tested, and one approval click away from production. Merged ~00:15 UTC into this report — well
under the 48h threshold, but flagging since it's the same gate that wedged for 4+ hours previously
and could recur.

---

## Needs human

1. **Approve [Release (Cloud Run) run #29376578226](https://github.com/unnfazzed/Lynia/actions/runs/29376578226)'s `build · migrate · deploy` job** — required-reviewer approval on the `production` environment. Ships `8d6703a` (BH-03..BH-06 bug-hunt fixes + the 0.2.4 version bump). Recurring wedge — worth deciding whether this manual click is the desired steady state (tracked as **KB-PROD-DEPLOY-GATE**).
2. **Review/land the `pnpm audit` 410 fix** — `.github/workflows/ci.yml`'s `security` job now hard-fails on every PR (including this report's own PR) because npmjs.org retired the audit endpoints it depends on. Proposed patch is above and in **KB-CI-AUDIT-410**; a background run can't land a security-gate change unattended, so this needs a human to apply the fix (or an equivalent) directly. **Until this lands, no PR in this repo — including this one — can reach a fully-green CI run**, which blocks the "merge on green" policy repo-wide.
3. **Merge [PR #249](https://github.com/unnfazzed/Lynia/pull/249)** once item 2 is resolved and its check re-runs green — it's otherwise ready (trivial version-bump diff, 5/6 checks already green).
4. **This report's own PR** will also show a failing `dependency audit · secret scan` check for the same reason as item 2 — it is being opened as **ready for review, not auto-merged**, since it cannot go green until that's fixed. Once item 2 lands, re-run this report PR's checks and merge it as a normal green PR.
