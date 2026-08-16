You are running the weekly **useless-test pruning routine** for the Lynia codebase (a pnpm/Turbo monorepo delivery platform: `apps/api` NestJS + Prisma, `apps/mobile` React Native + Expo, `apps/admin` + `apps/merchant` Next.js, `packages/shared`). This is a fresh session with no repo context — if the repo is not already checked out, attach `unnfazzed/lynia` with the `add_repo` tool (push access) and clone it; then start from the latest `main` and read `CLAUDE.md` in full. Work on branch `claude/test-prune-<YYYY-MM-DD>`. Model policy (owner instruction 2026-08-16): this lane runs on **Sonnet 5** (`claude-sonnet-5`) — do not escalate the model.

**Mission: find tests that can't fail, prove it by mutation, then strengthen or delete them.** This repo auto-merges Claude PRs on green, which makes a vacuous test worse than no test — it manufactures false green. This failure mode is documented here: the 2026-08 copy-grep "parity" checks reported ✅ while 243 of 244 screens were misaligned. A test earns its place only if some plausible regression makes it fail.

## Phase 0 — Dedup + baseline
1. Read `docs/KNOWN_BUGS.md` in full — your prefix is **TP-**.
2. List open `claude/*` PRs and read any not-yet-merged sibling PRs.
3. `pnpm install`, then `pnpm typecheck && pnpm test` on clean `main`. If red: STOP — docs-only note, end the run (the watchdog owns red main).

## Phase 1 — Hunt
Sweep all suites for cannot-fail patterns: assertions true on any input (`toBeDefined()` on a literal, asserting the mock you just configured), tests that mock the unit under test, copy-string greps posing as behavior tests, long-skipped/quarantined tests, snapshot tests too large to ever be reviewed, tests with no reachable assertion, tests duplicating another test's exact coverage.

## Phase 2 — Prove by mutation, then act
A test is condemned only by EVIDENCE: deliberately break the behavior it claims to cover (invert the guard, corrupt the value, remove the handler), run the test, and record that it still passes. Record every mutation verbatim in the report. Then, per condemned test: **strengthen it into a test that fails under the mutation** when the behavior matters (preferred), or delete it when it is redundant or meaningless. Restore every mutation afterwards — mutations never ship.

Hard rules:
- Never weaken or delete a FAILING test to get green — that is the forbidden move this routine exists to be the opposite of.
- Never delete the guardrail suite (`design-tokens.drift.spec.ts`, `parity/screen-inventory.spec.ts`, `scripts/check-design-freeze.mjs` and their CI jobs) — guardrails may only be strengthened.
- Sensitive-lane tests (bids / assignment / agreed-price / KYC / wallet) are strengthened, never removed, unless a surviving test demonstrably fails the same mutation.

## Phase 3 — Ledger, report, ship
Update `docs/KNOWN_BUGS.md` and write `docs/TEST-PRUNE-<date>.md` (per-test verdict: pattern → mutation applied → observed outcome → action) in the SAME PR as the changes. Full suite green locally, push, open the PR ready for review with the GitHub MCP tools (`gh` is not available), subscribe to it, and enable auto-merge (squash) per merge-on-green — never merge red. A clean sweep still ships the report.
