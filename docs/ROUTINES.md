# Scheduled Claude Routines — canonical spec

This file is the single source of truth for the five recurring Claude routines that run
against this repo. Each routine's cron prompt is kept **self-contained** (a routine must not
depend on this file existing to function), but this spec is authoritative when a prompt and
this file disagree — the next prompt revision must be reconciled against it.

Last reconciled: 2026-07-14 (routines-analysis pass).

## The five routines

| Routine | Cron (UTC) | Environment | Lane |
|---|---|---|---|
| Documentation update | `0 5 * * *` | env_01B3aX… | Doc ⇄ code reconciliation (runs **after** the night's fix routines) |
| Bug hunting | `0 23 * * *` | env_01B3aX… | Mobile-app journeys + app↔API contract seams |
| User experience improvements | `0 1 * * *` | env_01B3aX… | UX friction, copy, recoverability, blockers |
| Deep bug sweep | `0 3 * * *` | env_01V3Lw… | Backend correctness, concurrency, security, adversarial API |
| PR health & delivery watchdog | `0 */6 * * *` | env_01V3Lw… | CI/merge/deploy babysitting for **all** PRs |

The three bug-finding routines run 2 hours apart (23:00 → 01:00 → 03:00) **by design**: each
one's ledger/report PR must be merged before the next routine starts, so the next routine
inherits the previous one's findings and does not rediscover them.

## Universal policies (apply to every routine — user instruction 2026-07-14)

1. **Every routine ships a PR and auto-merges it.** No draft-only output. Once
   `pnpm typecheck && pnpm test` are green locally and the PR is pushed: mark it ready for
   review and enable auto-merge (squash), or merge directly once CI is confirmed green with no
   unresolved review comments. This **supersedes** the earlier draft-only behavior of the deep
   sweep and the bug-hunt "leave sensitive PRs open for review" carve-out. Sensitive-area fixes
   (bid acceptance, order assignment, agreed-price, KYC gating) are still written
   conservatively and must each carry a regression test — but they merge on green CI like
   everything else.
2. **No deferred bug fixes.** A routine fixes every defect it finds in the same run. "Logged
   for later" is only acceptable for items that are genuinely not code (founder-gated infra
   applies, vendor/device work) — those go into `docs/KNOWN_BUGS.md` as OPEN with an owner.
3. **Documentation updates ship in the same PR as the fixes, immediately.** Every routine
   updates `docs/KNOWN_BUGS.md` (the shared ledger) plus its own dated report **in the same PR**
   as its code changes — never as a follow-up. A routine whose fixes merged but whose docs
   didn't has not finished.
4. **Never merge on red.** Auto-merge means merge-on-green, not merge-regardless. Failing or
   missing required checks always block; fix forward first.

## Bug-dedup protocol (the three bug-finders)

`docs/KNOWN_BUGS.md` is the coordination ledger. Duplicate findings across routines are a
process failure; the ledger is how the routines stay disjoint.

- **Phase 0, before reading any product code:** read `docs/KNOWN_BUGS.md`. Anything already in
  the ledger — or trivially adjacent to a ledger entry — does **not** count as a new finding.
  Re-derived known bugs are confirmed in the ledger and skipped, never re-reported.
- **Hunt your own lane first.** Lanes (see table above) define where each routine concentrates:
  - **Bug hunting (23:00):** mobile client journeys (onboarding, KYC capture, order creation,
    bidding UI, tracking, completion), client state/lifecycle (process death, backgrounding,
    reconnect), and app↔API contract mismatches (enums, nullability, realtime recovery,
    retry-safety of client calls).
  - **UX improvements (01:00):** journey-level friction, copy/jargon, missing/unclear error
    and empty states, dead ends users can't recover from, notification-story coherence, and
    the code fixes for those.
  - **Deep bug sweep (03:00):** backend correctness — transactions/rollback, concurrency and
    idempotency, timer/expiry boundaries, money/price integrity, object-level authorization,
    KYC-gate bypass, plus the adversarial direct-API pass.
- **Out-of-lane finds are still fixed** (policy 2 — no deferral), but tagged in the ledger with
  the owning lane so the owning routine knows the territory is covered.
- **Every new finding gets a ledger row in the same PR as its fix**, with the routine's ID
  prefix: `BH-` (bug hunting), `UX-` (user experience), `DS-` (deep sweep). Row carries:
  file:line, severity, status, fixing PR.
- **Dated report files** (same PR): `docs/BUG-HUNT-<date>.md`, `docs/UX-USABILITY-REVIEW-<date>.md`,
  `docs/DEEP-SWEEP-<date>.md` — mirroring the existing formats.

## Known constraints of the routine environments

- The `gh` CLI is **not** available in remote routine sessions. PRs are created/merged with the
  GitHub MCP tools (`mcp__github__create_pull_request`, `mcp__github__update_pull_request`,
  `mcp__github__enable_pr_auto_merge`, `mcp__github__merge_pull_request`). If MCP GitHub tools
  are unavailable in a run, push the branch (session auto-PR creation will open the PR) and
  state loudly in the report that the merge step needs the watchdog — the 6-hourly watchdog
  merges any green PR as a backstop.
- `/model` slash commands do not exist in headless runs. Model preferences are expressed via
  the Agent/Task tool's `model` override when subagents are available; when they are not, the
  routine proceeds on its session model rather than aborting.
- This repo is a **pnpm/Turbo monorepo**: `apps/api` (NestJS + Prisma), `apps/mobile`
  (React Native + Expo), `apps/admin` (Next.js), `packages/shared`, `infra/`. There is no
  Android/Compose code, no Espresso/Maestro, and no payments/loan service — payments are
  cash/offline. Routine prompts must not reference stacks or services that don't exist here.

## Fixed inconsistencies (2026-07-14 analysis)

Kept for history; the v2 trigger prompts resolve these:

1. **UX routine prompt was truncated mid-sentence** (evidence rule 4 cut off) and its phase
   structure ("Phases 0–3", "the ledger", "memory brief") was referenced but never defined.
2. **UX routine's model section was un-executable** (`/model` doesn't exist headless; its tool
   allowlist had no Agent/Task tool) and instructed the run to STOP if the switch failed —
   an instruction to abort every run.
3. **Bug-hunting prompt targeted the wrong stack** (Android/Compose/Espresso/coroutines) and
   used `gh pr create`/`gh pr merge`, which is unavailable in the routine environment.
4. **Contradictory merge policy inside bug hunting**: step 10 said STOP and leave sensitive PRs
   open; the appended final line said "auto merge PRs and don't skip bug fixes."
5. **Deep sweep opened draft PRs with a human-review carve-out while the watchdog was
   instructed to mark ALL drafts ready and merge them** — the carve-out was silently defeated
   3 hours later anyway. Policy is now uniform (universal policy 1).
6. **Documentation routine described a different project** (whatsapp-bot / payments /
   loan-engine / Fineract services) and never shipped its edits — no branch/commit/PR/merge
   step at all.
7. **Documentation routine ran at 22:00, before the three fix routines** (23:00/01:00/03:00),
   so it reconciled docs against a tree the night's fixes were about to change. Moved to 05:00.
8. **Only the deep sweep used the ledger.** Bug hunting and UX had no Phase-0 ledger read and
   no ledger write-back, which is exactly how overlapping/duplicate findings happen.
