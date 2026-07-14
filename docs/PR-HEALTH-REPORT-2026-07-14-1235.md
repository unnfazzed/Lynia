# PR Health & Delivery Report — 2026-07-14 12:35 UTC

**Summary:** 1 open PR checked, ~75 closed PRs (last 7 days) reviewed for unmerged drops, 5 deploy
pipelines checked; 2 failures found, 2 fixed, 2 merged, 0 resurrected, 0 deploy re-runs needed,
0 escalated.

---

## A. Open PRs

| PR | Was | Root cause | Action | Status |
|---|---|---|---|---|
| [#235](https://github.com/unnfazzed/Lynia/pull/235) — fix(deep-sweep): remediate DS14-01..15 | Not draft, auto-merge already enabled by the repo owner (per this repo's 2026-07-14 universal auto-merge policy — see `CLAUDE.md`), but `mergeable_state: dirty` (real merge conflicts against `main`) and the branch's last push had never triggered a CI run at all | 15 commits had landed on `main` since the branch was cut, conflicting in 4 files (`docs/KNOWN_BUGS.md`, `admin-riders.service.ts`, `order-lifecycle.service.ts`, `apps/mobile/app/rider/job.tsx`). Separately, the PR's second commit had been pushed via the GitHub API (not a plain `git push`), which — like `GITHUB_TOKEN`-authored pushes — doesn't fire the `pull_request: synchronize` event, so CI (`ci.yml`) had never run on that commit; `get_check_runs` returned `total_count: 0`. | Checked out the branch locally, merged `main`, resolved all 4 conflicts by hand (kept both sides' independent fixes in each case — see detail below), ran `pnpm typecheck && pnpm lint && pnpm build && pnpm test` locally (833 API tests + 351 mobile tests, all green, after `pnpm --filter @lynia/api prisma:generate`), then pushed via a normal `git push` (not the API) specifically so CI would actually trigger. CI ran and went green; auto-merge (already enabled) landed it automatically. | **Merged** (`e1aa97f`) — see the self-critical note below; this merge briefly broke `main`'s typecheck, fixed by PR #244. |

**Conflict-resolution detail (PR #235):**
- `docs/KNOWN_BUGS.md`: combined both branches' "OPEN" section updates (main's KB-NOTIFY-ORDERID/KB-FEED-SYNTH closure + this branch's DS14-10..15 closure) into one paragraph.
- `admin-riders.service.ts`: `suspendRider`/`banRider` each had two independent post-commit side effects added on different branches (KB-BOARD-REVOKE's `kickRiderFromBoard` here, main's `notifyCustomersOfRiderStandingChange`) — kept both; they don't interact.
- `order-lifecycle.service.ts`: `rotateDeliveryCode` had two independent fixes — this branch's DB-`now()` timestamp stamp (KB-DELIVERY-CODE-ROTATION-SIGNAL) via raw SQL, and main's CAS guard against a concurrent status change. Merged into one `$transaction` that CAS-updates the hash/attempts via `updateMany` (throwing `ConflictException` on 0 rows) and then raw-SQL-stamps `delivery_code_rotated_at`, so neither fix regresses the other. Updated the spec to assert both behaviors in one test.
- `apps/mobile/app/rider/job.tsx`: kept both the KB-CONFIRMITEMS-RETRY durable-retry logic (this branch) and main's `pickup-checklist-draft` clearing — independent, both fire in `confirmAndCollect`.

No other open PRs. No stuck auto-merge, no other merge conflicts, no other drafts.

---

## Self-critical: this run introduced (and fixed) a `main` regression

While resolving PR #235's conflicts, `AdminRidersService`'s constructor gained a 5th (`gateway`)
parameter as part of the merge (from main's side). Two spec call sites needed a matching update
(passing the already-defined `noGateway` stub) — I made both edits, verified `pnpm typecheck` passed
**in my working tree**, but ran `git commit` without re-running `git add` after those two edits (they'd
been made *after* an earlier `git add -A`). The commit — and therefore PR #235's merge into `main`
(`e1aa97f`) — silently dropped both fixes. `main`'s `pnpm typecheck` was red from ~12:20 to ~12:28 UTC
(~8 minutes): two `TS2554: Expected 5 arguments, but got 4` errors in
`admin-riders.service.spec.ts`. This did **not** reach production — `tsconfig.build.json` excludes
`*.spec.ts` from the deploy build, and staging/production both built and deployed successfully on the
broken commit — but it broke the `pnpm typecheck` gate for `main` and any PR based on it.

Caught it by re-reading the CI job logs after auto-merge fired (the failing job had started microseconds
*after* the merge — auto-merge doesn't wait for non-required checks on this repo, worth noting for
anyone reviewing branch-protection config). Fixed forward: branched `claude/fix-main-typecheck-noGateway`
off latest `main`, restored the two-line fix, verified `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
green locally (833 API + 351 mobile tests), opened [PR #244](https://github.com/unnfazzed/Lynia/pull/244),
got CI green, merged (squash, `fc7bb8e`).

Notable: a **different, concurrently-running "refactoring routine" session** independently found and
fixed the exact same two-line issue via [PR #245](https://github.com/unnfazzed/Lynia/pull/245), based on
the same `main` commit. Both PRs merged within ~30 seconds of each other; because the diffs were
byte-identical, `main`'s merge commit (`6942e4e`, PR #245 merging after #244) resolved the "conflict"
automatically with no manual intervention needed — confirmed by inspecting the file on `main` post-merge.
CI on the current `main` HEAD is green.

**Corrective lesson for future runs:** after resolving merge conflicts (or making any fix-up edits) with
the `Edit` tool, always run `git status` / `git diff --cached --stat` immediately before `git commit` to
confirm every edited file is actually staged — don't trust "I ran `pnpm typecheck` and it passed" alone,
since that only proves the *working tree* is correct, not what's about to be committed.

---

## B. Closed-unmerged PRs (last 7 days)

Paged through all closed PRs from 2026-07-07 onward (~75 PRs, #130 through #240) via
`list_pull_requests(state: closed)`. Every single one had `merged_at` set — i.e., every closed PR in
the window was actually merged, none were closed-without-merging. (Note: this MCP server's `merged`
boolean field reads `false` even on merged PRs — `merged_at` is the reliable field; flagging this in
case a future run trusts the boolean.)

The dependabot "production-dependencies group" self-superseding chain noted in prior reports
(`#135 → #155 → #161 → #171`) has now rolled entirely out of the 7-day window — nothing left to verify
there.

**No revert commits found on `main` in the last 7 days** (`git log --grep="^Revert"` and a manual scan
of `git log --oneline`, both empty). No merged-then-reverted PRs to re-land.

**Verdict: nothing dropped, nothing to resurrect.**

---

## C. Deployments

| Pipeline | Latest relevant run vs latest `main` | Status |
|---|---|---|
| **Deploy Staging (Cloud Run)** | Current | ✅ Green on every commit through this run's window, including `e1aa97f` (PR #235), `fc7bb8e` (PR #244), and `6942e4e` (PR #245) |
| **Release Please** (the workflow itself) | Current | ✅ Green on every push |
| **Release (Cloud Run)** (production) | `e1aa97f` (PR #235's merge) | ✅ Deployed successfully — full canary graduated-shift-observe-promote cycle completed clean (12:24–12:31 UTC), no rollback triggered. Unlike the 2026-07-14 06:20 report, **no required-reviewer approval-gate wedge this time** — the pipeline ran end-to-end unattended. Newer commits (`fc7bb8e`, `6942e4e`) queued behind it in the workflow's `concurrency: group: release-cloud-run` as expected and are cycling through normally (one superseded run was auto-cancelled mid-queue, which is the pipeline's designed behavior, not a fault) |
| **Mobile Release (Play)** | n/a | Dormant by design — gated on `EAS_RELEASE_ENABLED` (unset). `total_count: 0`, unchanged from prior reports |
| **Mobile OTA Update (expo-updates)** | n/a | Same as above — dormant by design |

**Merged-but-not-shipped:** nothing merged in this run's window is outside the normal release-queue
latency (minutes, not hours) — the production pipeline is healthy and unattended-clean right now, a
contrast with the prior report's 4+ hour approval-gate wedge. No PR from this run's window has crossed
the 48h threshold.

---

## Needs human

Nothing outstanding. Everything found this run was fixed forward and merged (or, for the deploy
pipelines, was already healthy). The prior report's escalated item — a required-reviewer approval gate
on the `production` environment that had wedged the release queue for 4+ hours — did **not** recur this
run; the pipeline completed unattended. Worth a light watch on future runs in case that gate reappears
intermittently, but nothing actionable today.
