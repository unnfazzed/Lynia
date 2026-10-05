# Documentation Reconciliation Routine

You are reconciling the Lynia repository's documentation (`*.md`, plus any doc comments treated as spec) against the real state of the system. This runs at 05:00 UTC — AFTER tonight's three fix routines (bug hunt 23:00, UX 01:00, deep sweep 03:00) — so start from the **latest `main`** and reconcile against the tree that includes their merged changes.

Repo layout (do not assume anything else): pnpm/Turbo monorepo — `apps/api` (NestJS + Prisma/PostgreSQL, Socket.IO + Redis, BullMQ), `apps/mobile` (React Native + Expo), `apps/admin` (Next.js), `packages/shared` (shared types/contracts), `infra/` (Terraform/GCP), plus root and `docs/` markdown. Payments are cash/offline — there is no payments/loan service. Consult `docs/ROUTINES.md` if present.

Documentation is NOT the source of truth. Your job is to make the docs describe reality — and to surface the cases where reality has drifted from *intent* instead of quietly rewriting intent to match a bug.

## Code is the source of truth — docs are claims (owner instruction 2026-10-05; applies to every phase below)
The code on current `main` — and, for PR/CI/deploy state, the live GitHub/CI/EAS record — is what the system actually does. `docs/KNOWN_BUGS.md`, prior dated reports, `docs/ROUTINES.md`, plans, trackers, READMEs and code comments are **claims about the code, never evidence**. Read them for orientation and dedup, then verify before you act on them:
- **Verify before you skip or trust.** Before treating anything as "already FIXED / known / covered / shipped / aligned / dead / tested", open the code it names and confirm it at that `file:line` (grep the guard, CAS, gate, flag read, test assertion or wiring the doc claims). If the cited location moved or the claimed fix is not there, it is a **fresh finding**, not a skip. This applies to every ledger row you rely on, not only the Phase-0.5 cluster sample.
- **Discover from the code, not from doc lists.** Build your inventories (routes, endpoints, flags, screens, tests, state transitions, money paths) by searching the tree (`rg`, `git ls-files`, the actual registries) and diff them against what the docs list — a thing missing from the docs is still in scope, and a thing the docs list but the code no longer has is a stale doc.
- **Unverified ≠ true.** A doc claim you could not confirm in code is reported as UNVERIFIED with what you checked; never mark a ledger row FIXED/MOOT, or a tracker row done, on documentation alone.
- **When a doc and the code disagree,** the code is reality: describe current behaviour from the code. Whether the code or the doc is *wrong* is decided by intent sources (design mocks + `docs/DESIGN-DEVIATIONS.md`, owner decisions in `CLAUDE.md`, the sensitive-lane doctrine) — a divergence from intent is a code bug to fix; a doc that merely mis-describes behaviour is a stale doc you correct in the same PR. Never edit code to match a doc that only described it.
- **Evidence in the report.** Every finding, every "already covered" skip, and every status you change in the ledger cites the `file:line`, command output or check-run you verified it against. Ledger rows you touch get their status re-checked in code first.

## 0. Authority hierarchy — decide this BEFORE deciding who is wrong

For every claim in a doc, first classify what kind of fact it is, then check it against the authoritative artifact for that kind. Never resolve an intent question by reading code, and never resolve a behavior question by reading a mockup.

| The claim is about...                                    | Source of truth |
|----------------------------------------------------------|-----------------|
| What the code does now (behavior, control flow, effects) | the code |
| API routes, request/response shape, status codes         | the actual handlers + validation/serializer code |
| Data model / tables / fields                             | Prisma schema + migrations |
| Config, env vars, defaults, feature flags                | the env schema + where the value is actually read in code |
| Intended user flow / screens / copy                      | design & mockup artifacts + product decision docs |
| Why a decision was made                                  | human-authored ADRs / decision log — never overwrite these |

Behavior facts → code wins. Intent facts → designs/PRD win.

## 1. Scope the run
- Prefer an incremental pass: diff against the commit recorded in `docs/.last-doc-sync` so you focus on code and docs that actually moved. Full scan only if no marker exists.
- Cover each app (`apps/api`, `apps/mobile`, `apps/admin`), `packages/shared`, `infra/`, and the root-level architecture docs.

## 2. Extract checkable claims
For each doc, break it into discrete, falsifiable statements ("the API exposes POST /kyc/callback", "OTP expires after 5 minutes"). Ignore purely narrative / rationale prose.

## 3. Ground every claim
Trace each claim to the authoritative artifact from the hierarchy and check whether it holds. A claim you cannot trace to any code path or design artifact is itself suspect — mark it ORPHAN.

## 4. Classify each discrepancy — do NOT edit yet
- **STALE_DOC** — code/design is correct, the doc is out of date. → safe to auto-fix the doc.
- **CODE_BUG** — the doc reflects a real design/PRD/mockup decision and the *code* diverges from it. → DO NOT touch the doc. Register it in `docs/KNOWN_BUGS.md` as OPEN with the owning lane (bug-hunt / UX / deep-sweep / wallet-audit per docs/ROUTINES.md) so tonight's fix routines — which all read that ledger in Phase 0 — pick it up and fix it. This is how doc reconciliation feeds the bug routines; never silently sit on a divergence.
- **ORPHAN** — doc describes something that no longer exists in code or design. → flag for removal (it may be aspirational/planned; don't silently delete).
- **AMBIGUOUS** — you cannot tell which side is right. → flag for a human in the report. Never guess.

**The one rule that matters most: only STALE_DOC gets auto-edited.** Rewriting an intent doc to match buggy code launders the bug into the spec. When in doubt, flag — don't edit.

## 5. Apply STALE_DOC fixes only
- Edit the minimum needed to make the claim true. Preserve surrounding rationale, examples, and human voice.
- Do not add sections, reformat unrelated content, or "improve" docs beyond correctness.
- Every edit must be justified by a specific file/path you read.

## 6. Report + ledger
- Write `docs/doc-sync-report.md` (overwrite each run): summary counts per class; STALE_DOC edits with the `file:line` evidence; CODE_BUG entries (doc says X, code does Y, locations, which ledger row was created); ORPHAN / AMBIGUOUS items needing a human decision.
- Add the CODE_BUG rows to `docs/KNOWN_BUGS.md` (ID prefix DOC-, status OPEN, owning lane).
- Record the current commit SHA in `docs/.last-doc-sync`.

## 7. Ship (PR + auto-merge — every run that changed anything)
- Branch `claude/doc-sync-<YYYY-MM-DD>`; commit the doc edits, report, ledger rows, and sync marker together.
- Run `pnpm typecheck && pnpm test` (docs-only changes should trivially pass — but never push on red).
- The `gh` CLI is NOT available: open the PR with the GitHub MCP tools (mcp__github__*), following the repo PR template. If MCP GitHub tools are unavailable, push the branch (auto-PR creation is enabled) and flag that ready+merge needs the watchdog.
- Mark the PR READY (not draft) and AUTO-MERGE: enable auto-merge (squash) or merge directly once CI is green with no unresolved review comments — per user instruction 2026-07-14, every routine merges its own PR. Never merge on red.
- If the run produced zero edits, zero CODE_BUGs, and zero flags, skip the PR and just report "no drift".

## 8. Determinism
Re-running with no code or design changes must produce zero doc edits. If it doesn't, you over-reached somewhere above.