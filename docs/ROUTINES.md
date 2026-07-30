# Scheduled Claude Routines — canonical spec

This file is the single source of truth for the eight recurring Claude routines that run
against this repo. Each routine's cron prompt is kept **self-contained** (a routine must not
depend on this file existing to function), but this spec is authoritative when a prompt and
this file disagree — the next prompt revision must be reconciled against it.

The live cron prompts are version-controlled mirrors under **`docs/routines/*.md`** (one file per
routine). Those files are the reviewable source of truth for the prompt *text*; this file is the
authoritative spec for the *policy*. When any of the three (spec, mirror file, live trigger)
disagree, the **live trigger is what actually runs** — reconcile toward it or push the change into
it. See `docs/routines/README.md` for how to update a live trigger's prompt safely (its
`session_context` cannot be reproduced by delete+recreate from a routine session).

Last reconciled: 2026-07-16 (routines audit): (a) propagated the previously doc-only learnings —
Phase-0.5 cluster-claim re-verification, the deep-sweep-owned cross-lane seams pass, the evidenced
mandatory sibling-sweep, and the agentic-loop hunt — into the actual bug-finder prompts (they had
drifted behind this spec); (b) gave the bug-hunt prompt the Fable/Opus model split the other
bug-finders already had; (c) added a Phase-0 "read tonight's not-yet-merged sibling PRs" step to
every bug-finder so dedup no longer depends purely on the 2h gap being enough for the prior PR to
merge; (d) moved the PR-health watchdog off the routine-boundary hours (`0 */6` → `0 2,8,14,20`) so
it stops colliding with in-flight routine sessions; (e) added `DOC-`/`RF-` to the ledger prefix list.
Prior: 2026-07-16 (interactive-review learnings: first documented Phase-0.5, the seams pass, and the
mandatory sibling-sweep — the two blind spots that let IR16-01…06 sit live under "→ FIXED" cluster
headers and in the seams between lanes).
Prior: 2026-07-15 (added the wallet & data-lifecycle audit routine).

## The eight routines

| Routine | Cron (UTC) | Environment | Lane |
|---|---|---|---|
| Documentation update | `0 5 * * *` | env_01B3aX… | Doc ⇄ code reconciliation (runs **after** the night's fix routines) |
| Refactoring | `0 7 */2 * *` (every 2nd day) | env_01B3aX… | Behavior-preserving code-health work: hotspots, duplication, dead code, complexity |
| Bug hunting | `0 23 * * *` | env_01B3aX… | Mobile-app journeys + app↔API contract seams |
| User experience improvements | `0 1 * * *` | env_01B3aX… | UX friction, copy, recoverability, blockers |
| Deep bug sweep | `0 3 * * *` | env_01V3Lw… | Backend correctness, concurrency, security, adversarial API |
| Wallet & data-lifecycle audit | `0 9 */2 * *` (every 2nd day) | env_01V3Lw… | Wallet/earnings/admin data-lifecycle correctness — money & reporting integrity |
| PR health & delivery watchdog | `0 2,8,14,20 * * *` | env_01V3Lw… | CI/merge/deploy babysitting for **all** PRs |
| Performance watch | `0 11 * * 0` (Sundays) | env_01V3Lw… | Latency / bandwidth / battery / server-cost regressions + new perf wins (mobile + API) — see `docs/PERFORMANCE.md` |

> **Temporary build loops (2026-07-28, not part of the eight):** five daily implementation loops
> build the joint Restaurants + Send launch, one lane each, until their lane checklists complete
> and they self-disable. **As of 2026-07-30 they run 3×/day each on the paced all-day chain grid
> below** (was 2×/day). Spec: `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §6;
> prompt mirrors: `docs/routines/build-loops-restaurants-send.md`. They follow the universal
> policies below (merge-on-green, docs-in-same-PR, never-merge-red) and the sensitive-lane
> doctrine. Their PRs use `claude/build-*` branches; bug-finder Phase-0 sibling reads cover them
> like any other `claude/*` PR.

## Paced all-day chain (token-max, credit-capped) — 2026-07-30

Per user instruction (2026-07-30): **fill the day with work, one heavy session at a time, to
maximise token throughput — but with a hard structural cap on daily sessions so it does not
deplete credits, and one knob to raise the frequency later.** The mechanism is a fixed hourly
grid, not a live orchestrator: every slot is a pre-scheduled trigger firing, so the schedule
*is* the cap and there is no runaway path. Full rationale, the grid, the credit math, and the
frequency dial live in **`docs/routines/routine-chain.md`** (the reviewable source of truth for
this schedule). Summary:

- **Serial by construction.** Slots are spaced ≥1 h apart and never share an hour, so at most one
  heavy session bills at a time — the single biggest credit-protection lever.
- **Build loops = the token sink (15 slots/day).** The five launch build loops carry the
  productive, token-hungry work, so they get the frequency bump (2×→3×/day each). Backend lane C
  fires first in every cycle so its dependants (D, E) inherit a satisfied gate.
- **Maintenance interleave (5 slots/day).** The eight standing routines rotate through the grid's
  free hours, one lane per slot, deduping through `docs/KNOWN_BUGS.md` exactly as before — so extra
  cadence never re-bills rediscovery of already-ledgered findings.
- **Hard daily cap = 20 sessions** (15 build + 5 maintenance). Hours `03,04,06,07` UTC are left
  idle on purpose as credit-relief breathing room.
- **Frequency dial.** To turn it up: fill an idle hour, or halve the cadence (add `:30` slots).
  To turn it down: drop a build cycle back to 2×/day. One edit per lever, all reversible.

**The grid (UTC, one session per hour):**

| Hour | 02 | 05 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 00 | 01 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Lane | M | M | M | C | A | B | D | E | M | C | A | B | D | E | M | C | A | B | D | E |

`C/A/B/D/E` = build loops (`0 9,15,21` / `0 10,16,22` / `0 11,17,23` / `0 12,18,0` / `0 13,19,1`).
`M` = maintenance slot (`0 2,5,8,14,20 * * *`), rotating the eight lanes so each recurs ~every
1.6 days. The build-loop crons are applied in place via `update_trigger` (schedule-only edit —
preserves each loop's bound `session_context`); the maintenance-lane re-timing to the `M` slots is
a schedule-only edit of each standing trigger and is applied the same way once run from a session
whose account owns those triggers (see `docs/routines/routine-chain.md` §"Applying / reverting").

The three overnight bug-finding routines run 2 hours apart (23:00 → 01:00 → 03:00) **by
design**: each one's ledger/report PR must be merged before the next routine starts, so the
next routine inherits the previous one's findings and does not rediscover them. The wallet &
data-lifecycle audit (09:00, every 2nd day) is a fourth bug-finder that runs last in the day's
chain — after doc-sync (05:00) and refactoring (07:00) — so on the days it fires it starts from a
fully settled tree and inherits everything the overnight routines merged. It runs every 2nd day
rather than nightly because its surface (wallet + earnings + admin) is narrow and slow-changing,
and the deep sweep (03:00) already covers money/price integrity nightly as a backstop.

**The "merged before the next starts" guarantee is timing-only, so it is not trusted alone.** A
full hunt+fix+CI+merge can overrun the 2h gap; if it does, the next fresh session would read a
`main` that lacks the prior PR and re-derive its findings. Belt-and-suspenders: every bug-finder's
Phase 0 now also reads tonight's **open** `claude/*` PRs (their `KNOWN_BUGS.md` + report diffs) and
treats a finding claimed on an unmerged sibling branch as already-covered — so dedup holds even when
a prior PR is still in flight. The **PR-health watchdog runs at `0 2,8,14,20`** (not `0 */6`), i.e.
offset from the routine-boundary hours (23/01/03/05/07/09) so it does not rebase or merge a routine's
PR while that routine's session is still pushing to the same branch.

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

## Sensitive-lane review doctrine (roadmap 4.5)

Because every routine auto-merges on green with no human in the loop, **the review is the safety
culture** — so it is path-scoped, not one generic pass (the DoorDash "AI reviewer engineers actually
listen to" lesson: load area-specific doctrine, and stay silent unless a comment would change the code).

**A diff that touches a money / trust lane — `apps/api/src/{wallet,settlements,offers,orders,matching}/`,
`apps/api/src/{kyc,riders}/` (KYC gating), the admin money actions, or `packages/shared/src/{policy,pricing,money}.ts` —
must state in its PR body, and the review must confirm:**

1. **Idempotency** — the deterministic key / CAS / unique-constraint that makes the operation
   exactly-once (name it, or say why the op is naturally idempotent). Cross-check the inventory in
   `docs/ARCHITECTURE.md §13`.
2. **State transition** — which order-lifecycle edge(s) it exercises, checked against the declarative
   table in `apps/api/src/orders/order-lifecycle.transitions.ts`. No new illegal transition.
3. **Money arithmetic** — any money math goes through the `@lynia/shared` money seam
   (`addMoney`/`subMoney`/`roundToCents`/`percentOf`), never ad-hoc float `+`/`-`/`Math.round`.
4. **A regression test** that would fail without the change (sensitive fixes are conservative +
   test-backed per Universal policy 1).

A sensitive-lane PR that doesn't answer 1–4 is **not green regardless of CI** — the reviewer blocks it.
For all other lanes, keep the precision bar: comment only when it would change the code.

> **Editing a routine's trigger:** a live trigger's `session_context` cannot be reconstructed by
> delete-and-recreate — follow the in-place update procedure in `docs/routines/README.md`. Changing a
> routine's *prompt* to carry this doctrine is an in-place edit, never a re-create.

## Bug-dedup protocol (the four bug-finders + the weekly performance watch)

`docs/KNOWN_BUGS.md` is the coordination ledger. Duplicate findings across routines are a
process failure; the ledger is how the routines stay disjoint.

- **Phase 0, before reading any product code:** read `docs/KNOWN_BUGS.md`. Anything already in
  the ledger — or trivially adjacent to a ledger entry — does **not** count as a new finding.
  Re-derived known bugs are confirmed in the ledger and skipped, never re-reported. **Also read
  tonight's not-yet-merged sibling PRs, not just `main`:** list OPEN `claude/*` PRs and read their
  `KNOWN_BUGS.md` + dated-report diffs. A finding claimed on an unmerged sibling branch is already
  covered — the ledger dedup must not depend on the prior routine's PR having merged inside the 2h
  gap (see the schedule note above).
- **Phase 0.5 — cluster-claim re-verification (distrust the summaries, not just the rows).** The
  ledger's Phase-0 skip is what makes the routines efficient, but it also means the routines *inherit
  the ledger's errors* — and the most dangerous errors are the **rolled-up cluster summaries**
  ("Auth/identity → FIXED", "Object-authz/IDOR → FIXED", etc.), which can mark a whole class FIXED
  while an individual member is still live in code. This is not hypothetical: the 2026-07-16
  interactive review found `IR16-01` (session-revoke-on-ban, FRAUD P2-3) and `IR16-02` (the shared
  strike counter, FRAUD P2-4) **still live** under an "Auth/identity → FIXED" header that every prior
  Phase-0 had trusted and skipped. So each run, **re-verify a rotating sample against current code**:
  1. Pick **2–3 of the "→ FIXED / MOOT" cluster headers** (rotate through them run-over-run so every
     cluster is re-checked periodically — track which you picked in the report).
  2. For each, open the code for **≥2 of its named members** and confirm the fix is actually present
     (grep for the guard/CAS/scrub/gate the summary claims). A cluster summary is a *claim*, not
     evidence — treat a member whose guard you can't find in code as a **fresh finding**, not a skip.
  3. This is distinct from the existing per-fix spot-check (which samples individual fixed rows): here
     you are auditing the **summary's coverage of its own members**, the exact blind spot that hid
     IR16-01/02. Log the headers checked + the outcome in the dated report.
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
    KYC-gate bypass, plus the adversarial direct-API pass. **Also owns the cross-lane seams pass**
    (below) — it is the backend-correctness lane, so the interactions between lanes are its territory.
  - **Wallet & data-lifecycle audit (09:00):** the money + reporting data lifecycle end to end —
    the rider wallet journey (top-up → `CommissionAccount` balance → append-only
    `CommissionLedger`), the per-ride commission debit, the earnings tab, and the admin
    dashboard's reported numbers + mutating actions (wallet-credit, fare-adjust, cancel,
    hold/suspend/ban, KYC decision). It concentrates on *reconciliation* (balance = sum(ledger);
    no lost/double/mis-recorded transaction; dashboard KPIs = orders + ledger; every admin action
    correct, authorized, audited, idempotent). Deep sweep owns generic backend concurrency; this
    lane owns the financial/reporting integrity specifically. Behavior-correcting UI/UX +
    data-integrity fixes only — **no new features** (feature ideas go in the report's
    "Suggestions (not implemented)" section).
- **Out-of-lane finds are still fixed** (policy 2 — no deferral), but tagged in the ledger with
  the owning lane so the owning routine knows the territory is covered.
- **Cross-lane seams pass (deep sweep owns it).** Lane disjointness is the dedup mechanism — and it
  is *structurally blind to the seams between lanes*, where a change in one lane's territory breaks an
  invariant another lane owns. The most valuable findings in the 2026-07-16 review lived in exactly
  these seams: `IR16-01` (auth-guard × admin-ban), `IR16-02` (issues × orders sharing one column),
  `IR16-03` (tracking × riders × orders standing planes), `IR16-04`/`06` (schema × privacy × storage).
  None sit *inside* a single lane, so no single-lane hunt was ever going to find them. So the deep
  sweep runs one explicit **seam pass** per run: pick a **shared piece of state or a cross-cutting
  invariant** and trace it across **every** writer/reader regardless of lane. Standing menu of seams
  (rotate):
  - **Rider standing** (`accountStatus`/`onHold`/`isOnline`/`kycStatus`) — every path that changes it
    (admin, self-service, webhook, automated hold, KYC lapse, erasure) must leave the rider out of all
    four supply planes (geo, board, `isOnline`, dashboard count) **and** revoke sessions where a
    demotion. (Now funnelled through `TrackingGateway.evictRiderFromSupply` — verify new paths use it.)
  - **A single DB column with two writers** — grep each `Rider`/`Order` counter/flag column for *all*
    its writers and confirm they don't collide or wipe each other (the IR16-02 class).
  - **PII across representations** — every personal-data field vs. `apps/api/src/privacy/pii-manifest.ts`
    (the manifest test enforces schema coverage; the seam pass checks the *storage-object* and
    *JSON-embedded* siblings a column scan misses).
  - **A value threaded through a notification/feed/push or an admin action** — every id/status it
    carries must re-assert its trust boundary at each hop (the audit-forgery / notify-me-orderId class).
  Record the seam traced + the writers/readers enumerated in the report; a seam whose invariant an
  out-of-lane path violates is a fresh finding (fixed this run, tagged with the owning lane).
- **Mandatory sibling-sweep (evidenced) — the single most important anti-recurrence rule.** The
  dominant defect pattern in this repo's history is *"a fix hardened one instance and a sibling
  elsewhere stayed vulnerable"* — the check but not the write, the admin path but not self-service,
  one Redis client but not the pattern, one PII column but not its storage twin, one screen but not
  the others. **~70–80% of findings in the nightly sweeps are sibling re-occurrences of an
  already-fixed class.** So for **every** finding, before opening the PR you MUST:
  1. Distil the finding to a **pattern signature** — the grep-able shape of the bug (e.g.
     `findUnique(...) → decide → update(` without a CAS guard; a standing write missing an
     `evictRiderFromSupply`/`isOnline:false`; a raw `new Redis(` without an `error` listener; a PII
     column absent from `pii-manifest.ts`; a `rebroadcast()`/durable-marker/viewer-role gate applied
     to one call site but not its siblings).
  2. **Grep the whole repo** for that signature and enumerate every hit.
  3. **Fix or ledger every hit in the same PR** (policy 2 — no deferral). A sibling you consciously
     leave gets a `KNOWN_BUGS.md` OPEN row with the reason.
  4. **Paste the evidence in the dated report** under a `## Sibling-sweep` heading: the exact grep
     command(s), the raw hit count, and the disposition of each hit (fixed / already-guarded /
     ledgered). A finding with no sibling-sweep evidence is an unfinished finding.
  Prefer, where cheap, converting the class into a **write-time guard** so the sweep never has to
  re-find it: a single funnel method every path must call (e.g. `TrackingGateway.evictRiderFromSupply`
  for standing demotions), a declarative registry + test (e.g. `apps/api/src/privacy/pii-manifest.ts`
  and its spec, which fails when a new PII column isn't handled), or a shared helper replacing a
  repeated fragile idiom. A guard that makes the pattern the *only* way to do the thing retires the
  class; an instance fix just postpones the next sibling.
- **Every new finding gets a ledger row in the same PR as its fix**, with the routine's ID
  prefix: `BH-` (bug hunting), `UX-` (user experience), `DS-` (deep sweep), `WD-` (wallet &
  data-lifecycle), `DOC-` (documentation-reconciliation CODE_BUG rows, filed OPEN with an owning
  lane), `RF-` (refactoring debt register — lives in `docs/REFACTOR-LEDGER.md`, but defects found
  while refactoring are filed here under the owning lane's prefix). Row carries: file:line,
  severity, status, fixing PR.
- **Dated report files** (same PR): `docs/BUG-HUNT-<date>.md`, `docs/UX-USABILITY-REVIEW-<date>.md`,
  `docs/DEEP-SWEEP-<date>.md`, `docs/WALLET-DATA-AUDIT-<date>.md` — mirroring the existing formats.
- **Report retention (2026-07-19 docs cleanup): only the most recent report per lane stays on `main`.**
  When a routine lands a new dated report (including `PR-HEALTH-REPORT-*` and `REFACTOR-<date>`), it
  deletes the lane's previous one in the same PR — git history is the archive, `KNOWN_BUGS.md` (and
  `REFACTOR-LEDGER.md`) carry the durable findings. The doc-sync routine prunes any stragglers. The
  PR-health watchdog's "most recent report" read is unaffected — the newest file is always present.

## Agentic-loop engine (the bug-finders' hunt step)

Added 2026-07-16. The four bug-finders (BH/UX/DS/WD) should run their **hunt** as a multi-agent *agentic
loop*, not a single linear read-through. A linear pass finds bugs along one reading path; a loop casts a wide
net and then filters it hard, which is what actually raises recall. The engine is codified as a reusable
workflow at `.claude/workflows/lane-bug-hunt.js` and is invoked with `Workflow({ name: 'lane-bug-hunt' })`,
passing the lane via `args` — a built-in key (`"wallet"`, `"bug-hunt"`, `"ux"`, `"deep-sweep"`) or a custom
`{ key, context, lenses:[{key,prompt}] }`. It is **read-only** (finds + verifies; it does not edit code), so
the routine consumes its ranked output and then applies the fixes under the universal policies above.

Three stages (see the script for the exact shape):

1. **Diverse finders (search diversity = recall).** N finder agents fan out over the lane, each with ONE
   distinct lens (e.g. for WD: exactly-once credit, ledger reconciliation, per-ride debit, earnings, admin
   KPIs, admin-action authz/audit, concurrency, contract/nullability). Each does the Phase-0 `KNOWN_BUGS.md`
   read itself and reports only what prior runs missed. Ten blind finders cover far more surface than one
   reader taking a single path.
2. **Adversarial verify (precision, so recall can run high).** Every candidate faces a 3-skeptic panel —
   one agent trying to confirm, one to prove it a false positive, one to prove it already in the ledger — and
   survives only on ≥2 "real" votes. This is what lets the finders be aggressive without shipping
   plausible-but-wrong findings on sensitive paths.
3. **Sibling-sweep (structural anti-recurrence).** Each survivor's pattern signature is grepped across the
   whole repo, producing the evidence the mandatory sibling-sweep rule above already requires — and directly
   attacking the "fixed one instance, sibling stayed vulnerable" class that is ~70–80% of this repo's findings.

The pipeline is un-barriered: each lens's candidates verify the moment that lens returns, and stop conditions
are the fixed lens set (single round) — extend to loop-until-dry (repeat finder rounds until K consecutive
rounds surface nothing new) or a token budget for a deeper hunt. First live run: `WD-018…WD-020`
(report `AGENTIC-LOOP-BUGHUNT-2026-07-16.md`, retired to git history; findings live in `KNOWN_BUGS.md`) —
the loop surfaced a **prod-breaking HIGH the prior linear WD
runs missed** (an operator identity written into an `@db.Uuid` FK column, aborting every admin cancel) **plus
its unfixed sibling** in admin issue-resolution, which is the recall gain the engine exists to capture.

As of the 2026-07-16 routines audit, all four bug-finder prompt mirrors (`docs/routines/{bug-hunting,
ux-improvements,deep-bug-sweep,wallet-data-audit}.md`) invoke this engine in their Phase 1 —
`Workflow({ name: 'lane-bug-hunt' })` with `args` set to the lane key (`"bug-hunt"`, `"ux"`,
`"deep-sweep"`, `"wallet"`) — with the linear hunt kept as the explicit fallback. Previously the
engine was documented and built but wired into zero routines; that drift is what the audit closed.

> Note: `Workflow` (multi-agent fan-out) is opt-in because it spends tokens fanning out — routine prompts that
> use it have pre-authorized that spend. If `Workflow` is unavailable in a given run, the routine falls back to
> the linear hunt it did before; the dedup/sibling-sweep/report policies above are unchanged either way.

## Refactoring routine (07:00 UTC, every 2nd day)

Added 2026-07-14. Runs after the documentation routine (05:00) so it starts from a tree the
night's fix routines and doc reconciliation have already settled. Every 2nd day — not nightly —
so refactor churn stays digestible and the nightly bug routines diff against a stable base.
(`0 7 */2 * *` fires on odd days of the month; the 31st→1st boundary occasionally produces
back-to-back runs, which is acceptable.)

**Mission:** improve code health without changing behavior. The routine is modeled on
published practice at large delivery/rides platforms — Uber's Piranha (recurring small
per-flag dead-code diffs) and Shepherd (mechanical rewrites validated per-diff by full CI),
DoorDash's incremental monolith extraction with parallel-run verification, Shopify's
strangler-fig refactoring, and Google's small-CL discipline (sources at the end of this
section):

1. **Target by hotspot, not by taste.** Rank candidates by churn × complexity: files with the
   highest `git log` change frequency over the last 30–60 days intersected with high
   complexity/size/duplication. Refactoring cold code is low-yield; hotspots are where debt
   taxes every future change. The ledger's hotspot map carries the ranking between runs.
2. **Behavior-preserving only.** A refactor changes structure, never observable behavior. No
   endpoint/socket contract changes, no Prisma schema changes, no enum/DTO shape changes, no
   copy changes, no dependency major-bumps. If improving structure requires changing behavior,
   that's a bug fix or a feature — record it in the appropriate ledger and leave it to the
   owning lane (or fix it in a **separate commit with its own regression test**, tagged for the
   owning lane, per universal policy 2).
3. **Tests are the safety harness.** Tests must be green before the refactor starts and after
   it lands. Code with no meaningful coverage gets **characterization tests first** (pin down
   current behavior, including oddities), then the refactor, in the same PR. Never refactor
   uncovered sensitive-area code (bid acceptance, order assignment, agreed-price, KYC gating)
   — characterize first or skip and ledger it.
4. **Small, single-concern, atomic PRs.** Target ≤ ~400 changed lines per PR; one refactoring
   concern per PR (one extraction, one dedup, one dead-code sweep — not a grab-bag). At most
   3 refactor PRs per run. Never mix refactoring with feature work or opportunistic drive-by
   edits. Multi-run migrations use the strangler pattern: new path in, callers moved
   incrementally across runs, old path deleted last — state tracked in the ledger so each run
   resumes where the last stopped.
5. **Standard menu** (in priority order): dead code & unused exports/flags/deps removal;
   duplication collapse (especially logic duplicated across `apps/api`/`apps/mobile`/`apps/admin`
   that belongs in `packages/shared`); oversized files/functions split along seams; misplaced
   logic moved to its layer (e.g. business rules out of controllers/components); naming and
   type-safety cleanups (`any`-elimination, narrowing); test-suite health (flaky/slow/duplicated
   tests).
6. **Anti-patterns (hard NO):** big-bang rewrites; refactors without tests; "while I'm here"
   scope creep; churn for style preference alone (if `pnpm lint` doesn't flag it and it doesn't
   reduce complexity/duplication, leave it); touching `infra/terraform` or release plumbing.

**Ledger & report:** `docs/REFACTOR-LEDGER.md` is the routine's memory — hotspot map, debt
register (`RF-` IDs with file:line, kind, effort, status), in-flight strangler migrations, and
completed-refactor log. Updated **in the same PR** as the refactors (universal policy 3), plus
a dated report `docs/REFACTOR-<date>.md` (what was targeted, why, evidence of behavior
preservation, what was deliberately skipped). Defects discovered while refactoring also get a
`KNOWN_BUGS.md` row tagged with the owning lane.

**Verification gate (stricter than the other routines):** `pnpm typecheck && pnpm build &&
pnpm test` green **before** starting (on clean `main` — if red, stop and ledger it for the
watchdog; never refactor on a broken base) and **after** each PR's changes. Additionally,
diff the public surface: exported symbols of `packages/shared`, API route/DTO shapes, and
socket event names must be byte-identical before/after, or the change is not a refactor.
Mobile changes must stay OTA-able (JS-only, no native/config-plugin changes). Ships
ready-for-review + auto-merge per universal policy 1.

**Sources** (published practice this routine encodes): Uber — [Piranha: stale feature-flag
removal](https://www.uber.com/us/en/blog/piranha/), [JUnit 4→5 migration via
Shepherd](https://www.uber.com/us/en/blog/junit-migration/), [controlling rollout of
large-scale monorepo changes](https://www.uber.com/us/en/blog/controlling-the-rollout-of-large-scale-monorepo-changes/);
DoorDash — [monolith → microservices](https://careersatdoordash.com/blog/how-doordash-transitioned-from-a-monolith-to-microservices/),
[migration pain points](https://careersatdoordash.com/blog/reducing-the-migrations-pain-points/),
[zero-downtime session migration](https://careersatdoordash.com/blog/session-management-migration/)
(parallel-run/shadow verification); Shopify — [strangler-fig
refactoring](https://shopify.engineering/refactoring-legacy-code-strangler-fig-pattern);
Google — [small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html),
[Code Health](https://testing.googleblog.com/2017/04/code-health-googles-internal-code.html);
hotspot prioritization — [CodeScene churn × complexity](https://codescene.com/blog/benchmarking-code-health-refactoring-roi).

## Wallet & data-lifecycle audit (09:00 UTC, every 2nd day)

Added 2026-07-15 (user request). Runs every 2nd day (`0 9 */2 * *`), last in the day's chain on
the days it fires (after the overnight bug-finders, doc-sync at 05:00, and refactoring at 07:00)
so it audits a fully settled tree and inherits every merged finding. Every-2nd-day rather than
nightly because the wallet/earnings/admin surface is narrow and slow-changing (mirroring the
refactoring cadence), and the deep sweep (03:00) covers money/price integrity nightly as a
backstop. It is the fourth bug-finder in the dedup protocol above, lane prefix `WD-`.

**Mission:** prove — and where broken, fix — that the money and reporting data lifecycle is
correct end to end. The unit of work is the path a dollar and a reporting datum travel:

    rider wallet (top-up → CommissionAccount.balance → append-only CommissionLedger)
      → per-ride commission debit on order completion
      → earnings the rider sees
      → the numbers the admin dashboard reports and the admin actions that mutate them.

The bar is three things: **(a)** no transaction is lost, double-counted, or mis-recorded;
**(b)** balances, earnings, and dashboard KPIs reconcile with the append-only ledger and the
underlying orders; **(c)** every admin action (wallet-credit, fare-adjust, order cancel, customer
hold/lift, rider suspend/lift/ban/clear-hold, KYC decision) writes correct, authorized, audited
(`AuditLog`), idempotent data. This encodes the intent that the data lifecycle is sound and that
payments are well integrated into the data + reporting lifecycle.

**Surfaces (Phase 1):**

- **A. Rider wallet journey** — `apps/mobile/app/wallet/{index,top-up}.tsx`,
  `apps/mobile/src/api/wallet.ts`, `apps/mobile/src/query/use-wallet.ts`; API
  `apps/api/src/wallet/wallet.{controller,service}.ts`. Exactly-once top-up credit (CAS status
  transition + unique `topUpId`, re-openable `expired`), `balance` vs `sum(ledger)`,
  negative-balance handling, confirmation-vs-expiry races, `Decimal(10,2)` rounding, and the wallet
  UI states.
- **B. Per-ride commission debit** — one `ride_commission` row per order (UNIQUE
  `(riderId, orderId, type)`) at the ride's `ratePct`, fare-adjust deltas as `adjustment` rows,
  written inside the completion transaction under the balance row-lock; the launch-rate 0% path.
- **C. Earnings tab** — `apps/mobile/app/earnings/index.tsx`; earnings reconcile with completed
  orders and ledger receipts, correct period/timezone bucketing, complete empty/loading/error states.
- **D. Admin dashboard** — `apps/admin/app/*` (overview, cash, orders, riders, customers, issues,
  sos, actions) + API `apps/api/src/admin/*` and `apps/api/src/reports/*`; KPIs and the
  `cash/settlements` commission view reconcile with orders + ledger, and every mutating action is
  authorized, audited, and idempotent.

**Reconciliation checks (Phase 2 — the core of the lane):** balance ≠ sum(ledger); a top-up
confirmed but not credited, or credited twice; a completed order with no or duplicate
`ride_commission`; a fare-adjust that breaks the one-debit-per-order invariant; an admin
wallet-credit applied twice or unaudited; a dashboard aggregate that double-counts
cancelled/refunded orders or mis-buckets by timezone; an earnings total that disagrees with the
ledger. For each hit, grep every sibling occurrence (bugs cluster).

**Scope discipline:** behavior-correcting bug/UI/UX/data-integrity fixes only — **no new
features**; feature ideas are recorded under a "Suggestions (not implemented)" heading in the
report and left for the human. No deferrals — every code finding is fixed this run with a
regression test that would have caught it; wallet-credit / fare-adjust / commission / KYC changes
stay conservative. `Settlement` is dormant — don't build against it.

**Ledger & report (same PR as fixes):** `docs/WALLET-DATA-AUDIT-<date>.md` (IDs `WD-###`,
file:line, repro, severity, confidence) + `docs/KNOWN_BUGS.md` rows (`WD-` prefix). Ships
ready-for-review + auto-merge on green per universal policy 1; skip the PR only when nothing new
and no doc updates are worth shipping.

## Performance watch (11:00 UTC, Sundays)

Added 2026-07-19 (user request — the standing half of the wave-2 agentic-loop performance
program; strategy, shipped optimizations and the ranked backlog live in `docs/PERFORMANCE.md`).
Weekly (`0 11 * * 0`), outside every routine-boundary hour (23/01/03/05/07/09) and the watchdog's
slots (02/08/14/20), so on Sundays it starts from a fully settled tree after the day's chain. It
is the fifth bug-finder in the dedup protocol above, lane prefix `PW-`.

**Mission:** keep the app *radically fast on the target network* (metered 2G/3G, ~300-600 ms RTT,
low-end Android) and the serving cost flat-or-falling — by (a) catching regressions against the
production scorecard, and (b) landing the next confirmed optimization from the hunt or the
backlog, every week, in the same run.

**Phase 0 — ledger read (dedup):** `docs/KNOWN_BUGS.md`, `docs/PERFORMANCE.md` (shipped state +
ranked backlog — treat backlog items as KNOWN, not fresh findings), and tonight's open `claude/*`
sibling PRs, per the bug-dedup protocol.

**Phase 1 — scorecard:** check the latency/cost signals for drift vs. the prior run: client RUM
(`client_apifetch_latency_ms` p50/p95 per role, glass metrics), `micro_cache_requests_total` hit
rates per cache, `http_request_duration_ms` on the hot routes (order snapshot, offers, feed,
bootstrap, heartbeat), and any bundle/payload growth visible in the repo (new unbounded arrays,
dropped `select`s). Where dashboards aren't reachable from the routine environment, derive what's
derivable from code + note the gap honestly in the report.

**Phase 2 — hunt (agentic loop):** run the perf lens set over the code — server query efficiency,
payload shape, mobile re-render cost, polling/radio, cold-start path, cost hotspots — via
`lane-bug-hunt` with a custom lane (`{ key: "perf", … }`) or an equivalent finder→adversarial-
verify loop (2 skeptics per finding: measurable-impact + safe-to-fix; majority-refuted dies).

**Phase 3 — fix in-run:** every CONFIRMED code finding is fixed the same run with a regression
test, per universal policy 2. Sensitive areas (bid acceptance / order assignment / agreed-price /
KYC gating / presence & standing enforcement) stay conservative; caching is allowed only where
staleness is provably inconsequential (the `MicroCache` rules — never money, assignment, or
auth). Founder-gated infra items (CDN/edge, Cloud Run scaling, log sampling) are NOT code — log
them OPEN with an owner in `docs/KNOWN_BUGS.md` instead of half-shipping terraform.

**Phase 4 — ship:** `docs/PERF-WATCH-<date>.md` (IDs `PW-###`, file:line, evidence, measured or
estimated impact, fix) + `docs/KNOWN_BUGS.md` rows (`PW-` prefix) + a `docs/PERFORMANCE.md`
backlog re-rank **in the same PR** as the fixes; ready-for-review + auto-merge on green per
universal policy 1. Skip the PR only when the scorecard is flat AND the hunt came back dry.

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
