# Lynia

## gstack (required)

This project uses **[gstack](https://github.com/garrytan/gstack)** for all AI-assisted
work. gstack turns Claude Code into a virtual engineering team via a set of
sprint-structured skills (Think → Plan → Design → Build → Review → Test → Ship).

**Installation is mandatory.** Skill use is blocked by a PreToolUse hook
(`.claude/hooks/check-gstack.sh`) until gstack is installed:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Verify it is installed:

```bash
ls ~/.claude/skills/gstack/bin
```

### How to work in this repo

Follow the gstack sprint flow:

1. `/office-hours` — interrogate and refine the product concept
2. `/plan-ceo-review` — strategic / market feedback on the plan
3. `/plan-eng-review` — architecture and technical validation
4. `/design-consultation` → `/design-html` — UI/UX (when relevant)
5. Build against the approved plan
6. `/review` (staff-engineer audit) + `/codex` (independent second opinion)
7. `/qa` — automated browser testing
8. `/ship` — CI and release

Conventions:

- Use `/browse` for all web browsing.
- Use `~/.claude/skills/gstack/...` for gstack file paths.

> Note: the gstack skills themselves are NOT vendored into this repo — they are
> installed per-developer under `~/.claude/skills/gstack` (and gitignored). Each
> contributor installs gstack locally with the command above.

## Scheduled Claude routines — universal auto-merge + ledger protocol

`docs/ROUTINES.md` is the canonical spec for the eight recurring routines (bug hunting, UX
improvements, deep bug sweep, wallet & data-lifecycle audit, documentation update, refactoring,
PR health watchdog, weekly performance watch). Per explicit user
instruction (2026-07-14), **every scheduled routine ships a PR and auto-merges it**: once
`pnpm typecheck && pnpm test` are green locally and the PR is pushed, mark it ready for review
and enable auto-merge (or merge directly once CI is confirmed green with no unresolved review
comments) — don't wait for a human click. This supersedes the earlier draft-only deep-sweep
behavior and the bug-hunt "leave sensitive-area PRs open for review" carve-out; sensitive-area
fixes (bid acceptance / order assignment / agreed-price / KYC gating) still get conservative
implementations and a regression test each, but merge on green like everything else.

**This merge-on-green policy applies to ALL Claude-authored PRs, not only scheduled routines**
(user instruction 2026-07-14, second directive: "merge PRs when they are green"): any PR a
Claude session opens in this repo — interactive or scheduled — is squash-merged once CI is
green and there are no unresolved review comments, without waiting for a human click. Never
merge on red; fix forward first.

Routines also must: fix every defect they find in the same run (no deferrals), and update
`docs/KNOWN_BUGS.md` + their dated report **in the same PR** as the fixes. The four
bug-finding routines (bug hunting, UX, deep sweep, wallet & data-lifecycle audit) dedupe through
`docs/KNOWN_BUGS.md` (Phase-0 read, ledger write-back, per-lane scopes) — see `docs/ROUTINES.md`.

## Expo / EAS deployments — track them, never assume they happened

User instruction (2026-08-10): **track Expo deployments.** Merging is not shipping, and a green
build is not a shipped build. Any session that lands mobile changes and is asked whether they
shipped must verify against EAS/Play, not infer from `main`.

**Nothing auto-ships.** Both mobile workflows are `workflow_dispatch`-only. `mobile-release.yml`
does have a `v*` tag trigger, but it is separately gated behind `EAS_TAG_RELEASES_ENABLED`, and
release-please's bot tags never fire workflows anyway. Merging to `main` reaches no device.

**The `profile` input is load-bearing — the default is wrong for today's phase.**

| Profile | Channel | Submit track | Usable now? |
|---|---|---|---|
| `preview` | `preview` | `internal` | ✅ the working lane |
| `production` (workflow default) | `production` | `production`, 10% staged rollout | ❌ SA holds testing-track permissions only, and Play has not granted production access |

A default dispatch therefore builds fine and then fails at submission, burning one of a limited
monthly EAS build allowance. Pass `profile: preview` explicitly until the production train is
armed (`docs/PLAY-STORE-SUBMISSION.md` §8 step 3).

**Verifying a deployment** — `eas-build-status.yml` is the read-only bridge (dispatchable, not
environment-gated, mutates nothing). Since PR #631 its Recap answers both halves of "did it
ship?": build status *and* submission status + track. Read the tail of the job log.

- `eas build --no-wait` means a green GitHub job proves only that the build was **queued**.
- A FINISHED build with an ERRORED submission is a real, observed failure mode (every submission
  for build `c248fbf5` errored on service-account permissions while the build was green).
- `NO SUBMISSION` in that output means the build was never submitted — a reportable answer, not a
  gap to gloss over.

**Before dispatching**, run `pnpm install --frozen-lockfile` locally if the lockfile moved: the
release job uses a *strict* frozen install (deliberately diverging from CI's
`--frozen-lockfile=false`) so both sides compute the same fingerprint runtimeVersion. Drift there
killed build `5906d2f0`.

**Current phase:** internal testing only — `play.google.com/store/apps/details?id=zw.co.lynia`
returns 404 by design. Public release still needs a closed test, its mandatory ~14-day clock, and
production access. Do not describe anything shipped today as being "on Google Play".

The running ledger of every build/submission attempt and its failure class is
`docs/PLAY-STORE-SUBMISSION.md`; OTA-lane constraints are `REL-01`/`REL-02` in `docs/KNOWN_BUGS.md`
(runtimeVersion is stamped at build time, so an OTA cannot rescue a binary built before the fix).
