Run the nightly bug-hunting and fix routine for the Lynia monorepo (unnfazzed/Lynia) — a two-sided, on-demand motorbike courier marketplace for Zimbabwe with customer-priced bidding (inDrive-style). Payments are cash/offline — there is NO in-app payment processing.

Stack (do not assume anything else): `apps/mobile` = React Native + Expo (one app, customer↔rider role toggle); `apps/api` = NestJS + TypeScript + Prisma/PostgreSQL, Socket.IO + Redis realtime, BullMQ jobs; `apps/admin` = Next.js; `packages/shared` = shared types/contracts. There is NO hand-written Android/Compose/Espresso/Maestro code (Expo prebuilds the native Android project in CI). Type-check with `pnpm typecheck`, test with `pnpm test`.

Tooling: the `gh` CLI is NOT available. Use the GitHub MCP tools (mcp__github__*) for all PR operations. If MCP GitHub tools are unavailable in this session, push the branch (auto-PR creation is enabled) and state loudly in your report that ready+merge needs the watchdog routine.

## Model usage (split by model when subagents are available)
Use the Agent/Task tool's `model` override so the split holds regardless of your main-loop model: delegate discovery/analysis/journey-walking/contract-diffing to `model: fable` (finding), and do the code fixes, regression tests, and PR wiring on `model: opus` (fixing). If your own main-loop model is already Opus, do the fixes directly. If the Agent/Task tool or a model override is unavailable, proceed on the session model and note it in the report — never abort over model availability.

== PHASE 0: LEDGER (before reading any product code) ==
1. Read docs/KNOWN_BUGS.md — the consolidated cross-routine bug ledger — and docs/ROUTINES.md if present. Anything already in the ledger, or trivially adjacent to a ledger entry, does NOT count as a new finding: confirm its status in the ledger and move on. Do not pad.
2. **Read tonight's not-yet-merged sibling PRs, not just `main`.** The dedup design assumes the prior routine's PR merged before you start, but the 2h gap does not guarantee it. List OPEN Claude PRs (`mcp__github__list_pull_requests` state=open, head prefix `claude/`) and read the `docs/KNOWN_BUGS.md` + dated-report diffs on their branches. A finding already claimed in an open sibling PR is NOT new — treat it as covered. Never re-derive a finding that exists on an unmerged sibling branch.
3. Your lane: mobile-app user journeys, client state/lifecycle, and app↔API contract seams. The deep-sweep routine (03:00) owns deep backend correctness/security/adversarial AND the cross-lane seams pass; the UX routine (01:00) owns copy/friction/recoverability. If you find an out-of-lane bug anyway, STILL FIX IT (no deferrals), and tag its ledger row with the owning lane so that routine knows the territory is covered.
4. Create a branch from latest main: claude/bug-hunt-<YYYY-MM-DD>.

== PHASE 0.5: CLUSTER-CLAIM RE-VERIFICATION (distrust the summaries, not just the rows) ==
The Phase-0 skip makes you inherit the ledger's *errors* too — the most dangerous being the rolled-up "→ FIXED / MOOT" cluster summaries, which can mark a whole class FIXED while an individual member is still live in code (this is exactly how IR16-01/02 sat live under an "Auth/identity → FIXED" header every prior run trusted). Each run:
1. Pick 2–3 of the "→ FIXED / MOOT" cluster headers in the ledger (rotate run-over-run so every cluster is periodically re-checked; record which you picked in the report).
2. For each, open the code for ≥2 named members and confirm the fix is actually present (grep for the guard/CAS/scrub/gate the summary claims). A cluster summary is a *claim*, not evidence — a member whose guard you cannot find in code is a **fresh finding**, not a skip.
3. Log the headers checked + outcome in the dated report.

== PHASE 1: HUNT — agentic loop (search diversity = recall) ==
Run the hunt as the multi-agent agentic loop, not a single linear read-through:
`Workflow({ name: 'lane-bug-hunt' })` with `args: 'bug-hunt'`. It fans out diverse blind finders over the lane, runs a 3-skeptic adversarial verify on every candidate (survives on ≥2 "real" votes), and greps each survivor's pattern signature repo-wide. It is READ-ONLY — consume its ranked, verified output and apply fixes under the policies below. If `Workflow` is unavailable in this run, fall back to the linear hunt below; the dedup/sibling-sweep/report policies are unchanged either way.

Linear-fallback hunt — map the core journeys from the code (Expo Router navigation in apps/mobile):
- Customer onboarding: signup, login, WhatsApp OTP, permissions (location, notifications)
- Rider onboarding: signup + KYC via Didit (ID capture, selfie/liveness, document upload, verification status)
- Order creation: pickup/dropoff, package details, propose a price
- Bidding/negotiation: rider offers, customer sees offers, counter-offers, accept/reject, expiry
- Tracking: rider location updates, pickup confirmation, in-transit status, proof of delivery
- Completion: cash amount confirmation, rating, order history

Walk each journey and hunt for:
- Dead ends: states with no way forward or back (all offers expire → is the user stuck? KYC rejected → resubmit path?)
- Bidding edge cases: customer accepts an offer the rider just withdrew; counter-offer arrives after acceptance; expiry mid-negotiation; stale price shown after a counter
- Missing error states: network loss or 4xx/5xx at EACH step, especially mid-negotiation
- State loss: app killed / backgrounded mid-bid or mid-delivery — does the active order/negotiation survive relaunch and socket reconnect?
- KYC flow: camera/upload failures, retry on flaky networks, unclear pending/rejected states
- Tracking: stale rider location shown as live, out-of-order status updates, proof-of-delivery upload failure
- Permission edge cases: location denied, GPS off, "don't ask again" — recovery paths for both roles
- Race conditions: double-tap on Accept creating duplicate accept calls
- Navigation/lifecycle: broken back stack, deep links / push taps routing to dead screens, socket/event listeners never unsubscribed

App↔API contract seams:
- Contract mismatches: fields the app expects that the API doesn't send (types/nullability), especially offer and order status enums vs packages/shared
- Realtime recovery: if an offer, counter, or status socket event/push is missed, does the app recover on reconnect/next poll? Negotiation UIs that never refresh are critical bugs
- Versioning: will an older installed app break against the current API? (additive-only wire-contract rule)
- Retry safety: are client retries safe against non-idempotent endpoints like offer submission?
- Config: hardcoded URLs, missing env vars, debug endpoints reachable in release builds
- Run the test suites first and treat failing/flaky tests as findings.

== MANDATORY SIBLING-SWEEP (evidenced) — the single most important anti-recurrence rule ==
~70–80% of this repo's findings are sibling re-occurrences of an already-fixed class (the check but not the write, the admin path but not self-service, one screen but not the others). For EVERY finding, before opening the PR:
1. Distil the finding to a grep-able **pattern signature**.
2. **Grep the whole repo** for that signature and enumerate every hit.
3. **Fix or ledger every hit in the same PR** (no deferral). A sibling you consciously leave gets a KNOWN_BUGS.md OPEN row with the reason.
4. **Paste the evidence in the dated report** under a `## Sibling-sweep` heading: the exact grep command(s), the raw hit count, and the disposition of each hit (fixed / already-guarded / ledgered). A finding with no sibling-sweep evidence is unfinished.
Prefer, where cheap, converting the class into a write-time guard (a single funnel method, a declarative registry + test, or a shared helper) so the sweep never has to re-find it.

== FIX, DOCUMENT, SHIP (all in ONE PR — no deferrals) ==
1. Fix EVERY bug found with the smallest change possible; no unrelated refactoring. Do not skip or defer any code fix. Only genuinely non-code items (founder-gated infra/vendor/device work) may be recorded as OPEN in the ledger instead of fixed.
2. Add a test per fix: unit where possible, integration for contract bugs, and a concurrency test for any race-condition fix.
3. In the SAME PR: append new findings to docs/KNOWN_BUGS.md (ID prefix BH-, with file:line, severity, status, fixing PR) and write a dated report docs/BUG-HUNT-<YYYY-MM-DD>.md (findings, root causes, fixes, tests added, the Phase-0.5 cluster headers re-verified, the `## Sibling-sweep` evidence, plus anything you re-derived that was already known).
4. Run pnpm typecheck && pnpm test — everything must be green locally before pushing.
5. Push, open the PR via MCP (follow the repo PR template), mark it READY (not draft), and AUTO-MERGE: enable auto-merge (squash), or squash-merge directly once CI is green with no unresolved review comments. Do NOT leave the PR unmerged waiting for a human — this includes fixes touching bid acceptance, order assignment, agreed-price recording, or KYC gating (keep those conservative, each with a regression test, but merge on green; per user instruction 2026-07-14 this supersedes the old stop-for-review rule).
6. Never merge on red: failing or missing required checks block the merge until you fix forward.
7. Final report: bugs found per area, fixes made, tests added, merge status, and anything non-code left OPEN in the ledger.
