You are running the weekly **logic-model audit routine** for the Lynia codebase (a pnpm/Turbo monorepo delivery platform: `apps/api` NestJS + Prisma, `apps/mobile` React Native + Expo, `apps/admin` + `apps/merchant` Next.js, `packages/shared`). This is a fresh session with no repo context — if the repo is not already checked out, attach `unnfazzed/lynia` with the `add_repo` tool (push access) and clone it; then start from the latest `main` and read `CLAUDE.md` in full. Work on branch `claude/logic-model-<YYYY-MM-DD>`. Model policy (owner instruction 2026-08-16): this lane runs on **Sonnet 5** (`claude-sonnet-5`) — do not escalate the model.

**Mission: formally model ONE sensitive business-logic lane end-to-end, and make every logic claim provable with a truth table.** This repo's rule for parity is "every parity claim becomes an image"; this routine's rule is **every logic claim becomes a truth table**, posted to the PR. Lanes in rotation: bid acceptance → order assignment → agreed-price → KYC gating → wallet/top-up/earnings → cancellation & hand-back. Pick the lane LEAST recently audited (check prior `docs/LOGIC-MODEL-AUDIT-*.md` reports and `docs/KNOWN_BUGS.md` LM- rows); one lane per run, done properly, beats three done shallowly.

## Phase 0 — Dedup + baseline
1. Read `docs/KNOWN_BUGS.md` in full — your prefix is **LM-**. Re-verify any "FIXED" claim overlapping the chosen lane against the code.
2. List open `claude/*` PRs and read any not-yet-merged sibling PRs.
3. `pnpm install`, then `pnpm typecheck && pnpm test` on clean `main`. If red: STOP — record it, ship a docs-only note, end the run (the watchdog owns red main).

## Phase 1 — Model the lane
Enumerate the lane's REAL state machine from the code: every state, every actor (customer, rider, merchant, admin, system/cron, webhook), every action/event, every guard. Build the full (state × actor × action) truth table: for each cell, what the code DOES, what it SHOULD do, and which test (if any) pins it. Include the concurrency cells — double-submit, simultaneous accepts, webhook-vs-user races, retry/idempotency behavior. Mark each cell **OK** / **GAP** (unhandled or wrong) / **UNTESTED** / **DUPLICATED** (a second, divergent implementation of the same rule elsewhere).

## Phase 2 — Fix, same run
Every GAP gets a conservative fix plus a regression test (sensitive-lane doctrine: smallest safe change, never a rewrite). Every UNTESTED cell whose behavior matters gets a pinning test. DUPLICATED logic is unified when small, or recorded as an LM- ledger row for the refactoring lane with exact file locations. No deferrals of confirmed defects (universal routine policy).

## Phase 3 — Evidence, ledger, ship
The truth table goes verbatim in the PR body AND in `docs/LOGIC-MODEL-AUDIT-<date>.md`; update `docs/KNOWN_BUGS.md` in the SAME PR as the fixes. `pnpm typecheck && pnpm test` green locally, push, open the PR ready for review with the GitHub MCP tools (`gh` is not available), subscribe to it, and enable auto-merge (squash) per merge-on-green — never merge red. A lane that models clean still ships the table + report: the table IS the deliverable, because it is what makes the next audit of this lane cheap.
