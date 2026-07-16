You are running the daily **deep bug sweep** for the Lynia codebase (a NestJS/Prisma delivery platform: `apps/api`, `apps/mobile` Expo, `apps/admin` Next.js, `packages/shared`). This is a fresh session — start from the latest `main`. Follow the repo's CLAUDE.md conventions and `docs/ROUTINES.md` if present. Work on a new branch `claude/deep-sweep-<YYYY-MM-DD>`.

## Model usage (REQUIRED): Fable for planning, Opus for execution
Split the work by model, using the Agent/Task tool's `model` override so this holds regardless of your main-loop model:
- **Planning / discovery / analysis → Fable-5** (`model: fable`, i.e. claude-fable-5): run ALL of Phase 0 review, the Phase 1 orthogonal sweep (the hunting/analysis subagents), and the Phase 3 adversarial analysis by delegating to subagents with `model: fable`. Fable finds.
- **Execution → Opus** (`model: opus`, i.e. claude-opus-4-8): run ALL Phase 2 work — writing the fixes, the regression tests, and wiring the PR — on Opus. If your own main-loop model is already Opus, do it directly; otherwise delegate the implementation to subagents with `model: opus`. Opus fixes.
Keep the split clean: Fable does the finding and analysis, Opus does the code changes. If the Agent/Task tool or a model override is unavailable, proceed on the session model and note it in the report — never abort over model availability.

## Phase 0 — Inherit history (do this FIRST, before reading any product code)
1. Read `docs/KNOWN_BUGS.md` — the consolidated, deduplicated ledger of every finding from every prior sweep, with statuses and a coverage map. This is your source of truth for what is already known.
2. Skim the dated reports it references (e.g. `docs/DEEP-SWEEP-*.md`, `BUGHUNT_FINDINGS.md`, `docs/BUG-HUNT*.md`, `docs/FRAUD-REVIEW.md`, `docs/UX-USABILITY-REVIEW-*.md`) only as needed for context.
3. **Inherit tonight's not-yet-merged sibling PRs, not just `main`.** The bug-hunt (23:00) and UX (01:00) routines ran earlier tonight; their ledger updates SHOULD be on main, but the 2h gaps do not guarantee their PRs merged. List OPEN Claude PRs (`mcp__github__list_pull_requests` state=open, head prefix `claude/`) and read their KNOWN_BUGS.md + report diffs. A finding already claimed on an open sibling branch is NOT new — do not re-derive it.
4. Verify status against code for a small sample of findings the ledger marks FIXED — confirm the fix still exists. If any regressed, that's a finding.

**Hard rule:** anything in `KNOWN_BUGS.md` (or in an open sibling PR), or trivially adjacent, does NOT count as a new finding. If you catch yourself re-deriving a known bug, confirm it and move on. Do not pad.

**Your lane** (concentrate here — mobile journeys/contract seams belong to the bug-hunt routine, UX friction/copy to the UX routine): backend correctness, concurrency, data integrity, security, and the adversarial API pass. **You also own the cross-lane seams pass (Phase 1.5 below)** — as the backend-correctness lane, the interactions *between* lanes are your territory. Out-of-lane bugs you find anyway: STILL FIX THEM (no deferrals), tagged in the ledger with the owning lane.

## Phase 0.5 — Cluster-claim re-verification (distrust the summaries, not just the rows)
The Phase-0 skip makes you inherit the ledger's *errors* — most dangerously the rolled-up "→ FIXED / MOOT" cluster summaries, which can mark a whole class FIXED while an individual member is still live in code (exactly how IR16-01 session-revoke-on-ban and IR16-02 shared-strike-counter sat live under an "Auth/identity → FIXED" header every prior Phase-0 trusted and skipped). Each run:
1. Pick 2–3 of the "→ FIXED / MOOT" cluster headers (rotate run-over-run so every cluster is periodically re-checked; record which you picked in the report).
2. For each, open the code for ≥2 named members and confirm the fix is actually present (grep for the guard/CAS/scrub/gate the summary claims). A cluster summary is a *claim*, not evidence — a member whose guard you cannot find in code is a **fresh finding**, not a skip.
3. Log the headers checked + outcome in the dated report.

## Phase 1 — Orthogonal sweep (agentic loop; Fable subagents)
Run the hunt as the multi-agent agentic loop: `Workflow({ name: 'lane-bug-hunt' })` with `args: 'deep-sweep'` — diverse blind finders across backend correctness / concurrency / authz-IDOR / timer-expiry / adversarial-API lenses, a 3-skeptic adversarial verify per candidate (≥2 "real" votes to survive), and a repo-wide pattern-signature grep per survivor. It is READ-ONLY; consume its ranked output. If `Workflow` is unavailable, fall back to the linear orthogonal sweep, prioritizing in order:
1. **Never-audited areas** — use the ledger's coverage map; hunt where past sweeps have NOT concentrated.
2. **Pattern propagation** — for each still-OPEN finding, identify the underlying mistake pattern and grep the codebase for every other occurrence (bugs cluster in sibling flows).
3. **Mechanism audit (cross-cutting):** transactions & partial-failure rollback; socket handlers firing twice/out-of-order/on stale records; BullMQ job idempotency, retries, and EventEmitter `error` handling; timer/expiry boundaries (t = expiry ± 1s, clock skew); client/server state divergence after killed apps or lost responses; Prisma queries assuming exactly-one row; swallowed catch blocks; silent notification failures that flows depend on; money/price numeric handling; object-level authorization and KYC-gate bypass via direct API calls.

## Phase 1.5 — Cross-lane seams pass (you own this — one seam per run)
Lane disjointness is the dedup mechanism, and it is *structurally blind to the seams between lanes*, where a change in one lane's territory breaks an invariant another lane owns. The most valuable findings of the 2026-07-16 review lived in exactly these seams (IR16-01…06) — none sit inside a single lane, so no single-lane hunt finds them. Pick ONE shared piece of state or cross-cutting invariant and trace it across EVERY writer/reader regardless of lane. Standing menu (rotate run-over-run):
- **Rider standing** (`accountStatus`/`onHold`/`isOnline`/`kycStatus`) — every path that changes it (admin, self-service, webhook, automated hold, KYC lapse, erasure) must leave the rider out of all four supply planes (geo, board, `isOnline`, dashboard count) AND revoke sessions on a demotion. (Now funnelled through `TrackingGateway.evictRiderFromSupply` — verify new paths use it.)
- **A single DB column with two writers** — grep each `Rider`/`Order` counter/flag column for ALL its writers and confirm they don't collide or wipe each other (the IR16-02 class).
- **PII across representations** — every personal-data field vs `apps/api/src/privacy/pii-manifest.ts` (the manifest test enforces schema coverage; the seam pass checks the storage-object and JSON-embedded siblings a column scan misses).
- **A value threaded through a notification/feed/push or an admin action** — every id/status it carries must re-assert its trust boundary at each hop (the audit-forgery / notify-me-orderId class).
Record the seam traced + the writers/readers enumerated in the report; a seam whose invariant an out-of-lane path violates is a fresh finding (fixed this run, tagged with the owning lane).

## Phase 2 — Report + fixes (Opus)
Append findings to a new dated report `docs/DEEP-SWEEP-<today's-date>.md` (mirror the existing report format: ID, file:line, repro scenario, severity CRITICAL/HIGH/MEDIUM/LOW, confidence, and one line on why past sweeps missed it). Include the Phase-0.5 cluster headers re-verified, the Phase-1.5 seam traced, and the `## Sibling-sweep` evidence (below). Update `docs/KNOWN_BUGS.md` with the new findings (ID prefix DS-) and any status changes, so the next run inherits them — **in the same PR as the fixes**. Then implement the fixes.

## Phase 3 — Adversarial pass (Fable subagents)
Act as a malicious authenticated user with direct API access (curl, no app): free/underpriced deliveries, bid/fare manipulation, acting on other users' resources, replaying/forging requests, reaching KYC- or standing-gated features. Report only genuinely new gaps.

**Stopping rule:** if Phase 1+1.5+3 produce zero new CRITICAL/HIGH findings, say so explicitly rather than padding the report with LOW-severity noise.

## Mandatory sibling-sweep (evidenced)
~70–80% of this repo's findings are sibling re-occurrences of an already-fixed class. For EVERY finding, before the PR: distil a grep-able pattern signature, grep the whole repo, fix or ledger every hit in the same PR (a sibling you leave gets a KNOWN_BUGS.md OPEN row with the reason), and paste the exact grep command(s) + raw hit count + per-hit disposition under a `## Sibling-sweep` heading in the report. A finding with no sibling-sweep evidence is unfinished. Prefer, where cheap, converting the class into a write-time guard (a single funnel method every path must call, a declarative registry + test, or a shared helper) so the sweep never has to re-find it.

## Fixes, tests, PR (Opus) — no deferrals, auto-merge
- Implement fixes for ALL findings this run — do not defer any code fix. Each fix gets a regression test that would have caught it. Keep KYC-gating / order-cancel / fare / bid-acceptance changes conservative and well-tested.
- Only genuinely non-code items (founder-gated infra applies, vendor/device work) may be recorded OPEN in the ledger instead of fixed.
- Run `pnpm typecheck && pnpm test` (and `pnpm build` for API) — everything must be green locally.
- Push and open the PR **ready for review, NOT draft** (follow the repo PR template), using the GitHub MCP tools (`gh` CLI is not available). Then subscribe to the PR.
- **Auto-merge (per user instruction 2026-07-14, superseding the old draft/carve-out policy):** enable auto-merge (squash), or squash-merge directly once CI is green with no unresolved review comments. This applies to ALL fixes, including those touching bid acceptance, order assignment, agreed-price, or KYC gating — those still need conservative implementations and a regression test each, but they merge on green like everything else. Never merge on red: fix forward until CI is green, then merge before finishing the run.
- If the sweep found nothing new CRITICAL/HIGH, still ship the (docs-only) ledger/report-refresh PR if there were LOW findings or status updates — same ready+auto-merge treatment; otherwise report "clean, no new CRITICAL/HIGH" and skip the PR.
