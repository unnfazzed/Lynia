You are running the weekly **flag-retirement routine** for the Lynia codebase (a pnpm/Turbo monorepo delivery platform: `apps/api` NestJS + Prisma, `apps/mobile` React Native + Expo, `apps/admin` + `apps/merchant` Next.js, `packages/shared`). This is a fresh session with no repo context — if the repo is not already checked out, attach `unnfazzed/lynia` with the `add_repo` tool (push access) and clone it; then start from the latest `main` and read `CLAUDE.md` in full (pixel-parity rules bind flag work directly — flag-off states have SH· mocks). Work on branch `claude/flag-retirement-<YYYY-MM-DD>`. Model policy (owner instruction 2026-08-16): this lane runs on **Sonnet 5** (`claude-sonnet-5`) — do not escalate the model.

**Mission: keep the feature-flag surface honest.** Every fully-shipped flag left in the tree is a latent MOB-BOOT-02 (the retired flag-off design flashed on every cold start because a launched feature still sat behind a fail-safe-OFF seed). Inventory every flag, classify it against reality, and act.

## Phase 0 — Dedup + baseline
1. Read `docs/KNOWN_BUGS.md` in full — your prefix is **FLAG-**. Respect recorded deliberate keeps (e.g. `MOB-BOOT-02-SIB-2`, the still-unlaunched dispatch flag) — a recorded keep is not a finding.
2. List open `claude/*` PRs and read any not-yet-merged sibling PRs.
3. `pnpm install`, then `pnpm typecheck && pnpm test` on clean `main`. If red: STOP — docs-only note, end the run (the watchdog owns red main).

## Phase 1 — Inventory
Find every feature flag, kill switch, env-var gate and remote-config branch across all faces (`useFeatureFlags`, the `/app/bootstrap` payload, API-side gates, env-conditional code). For each, record: where defined, where consumed, default/seed value, fail direction (fails-open vs fails-safe), launch status in reality (is the feature live for users — check docs and the flag's server value, don't guess), and whether any mock (including the SH· shipped-states wave) draws its OFF state.

## Phase 2 — Classify + act, same run
- **Shipped & launched** → inline the ON path, delete the OFF branch and any retired UI it renders; keep the server kill switch ONLY where a recorded decision says so. First-frame rule: no screen may render a decision it has not yet made — seeds must never paint the wrong state for even one frame.
- **Unlaunched** → verify the fail-safe default is correct and the seed state never renders a wrong first frame; leave the flag in place.
- **Forgotten / internal-only** → do NOT unilaterally ship or delete a feature: gather usage evidence, write a FLAG- ledger row with a ship-or-delete recommendation for the owner, and only execute decisions that are already recorded.

Flag removals must preserve pixel parity: the surviving state must match its mock, and removed flag-off screens must not orphan screen-inventory targets (rewire or re-allowlist so the guardrail suite stays green). Any behavior change gets a regression test.

## Phase 3 — Ledger, report, ship
Update `docs/KNOWN_BUGS.md` and write `docs/FLAG-RETIREMENT-<date>.md` (the full inventory table: flag → class → action taken or recommended) in the SAME PR as the changes. `pnpm typecheck && pnpm test` green locally, push, open the PR ready for review with the GitHub MCP tools (`gh` is not available), subscribe to it, and enable auto-merge (squash) per merge-on-green — never merge red. A run with nothing to retire still ships the inventory report: the inventory is what keeps next week's run cheap.
