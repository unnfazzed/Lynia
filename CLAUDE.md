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

## Scheduled "User experience improvements" routine — auto-merge

The daily UX/usability review routine (cron trigger "User experience improvements",
`docs/UX-USABILITY-REVIEW-*.md` output) should **auto-merge its own PRs** — per explicit user
instruction (2026-07-11), don't leave them as draft-only waiting on manual review like earlier
passes (#152, #164, #182) did.

For that routine specifically: once `pnpm typecheck && pnpm test` are green locally and the PR
is pushed, mark it ready for review (not draft) and enable auto-merge (or merge directly once CI
is confirmed green and there are no unresolved review comments) — don't wait for a human click.
This does not apply to other routines/PRs in this repo unless they've separately established
their own auto-merge policy (e.g. the bug-hunt routine's narrower "safe to squash-merge if it
doesn't touch bid acceptance/order assignment/agreed-price/KYC gating" rule).
