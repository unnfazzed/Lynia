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

`docs/ROUTINES.md` is the canonical spec for the six recurring routines (bug hunting, UX
improvements, deep bug sweep, documentation update, refactoring, PR health watchdog). Per explicit user
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
`docs/KNOWN_BUGS.md` + their dated report **in the same PR** as the fixes. The three
bug-finding routines dedupe through `docs/KNOWN_BUGS.md` (Phase-0 read, ledger write-back,
per-lane scopes) — see `docs/ROUTINES.md`.
