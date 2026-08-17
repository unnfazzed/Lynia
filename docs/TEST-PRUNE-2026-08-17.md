# Test-prune sweep — 2026-08-17

First run of the weekly useless-test pruning routine (`docs/ROUTINES.md`). No prior `TP-` rows to
dedup against — `docs/KNOWN_BUGS.md` had none. No open `claude/*` PRs to read as siblings.

**Baseline.** Fresh checkout needed `pnpm --filter api run prisma:generate` (the API's Prisma client
isn't committed — same environment-only gap prior routines have logged, not a code defect) before
`pnpm typecheck && pnpm test` went green: api 100 files / 1729 tests, mobile 160 suites / 1201 tests,
admin 11 files, merchant 29 files, shared 12 files, all passing.

## Method

Three parallel read-only hunts (api; mobile; admin+merchant+shared) swept every test file for the
seven cannot-fail patterns in the routine brief. All three lanes came back reporting an unusually
disciplined suite overall — no `.skip`/`.todo`/`xdescribe`/`xit` anywhere in the repo, no oversized
snapshot tests (the suite doesn't use `toMatchSnapshot` at all), no unreachable assertions, and no
literal mock-the-unit-under-test cases. 13 candidates were shortlisted across the three lanes. Every
candidate below was proven or cleared by an actual mutation — the source was changed, the target test
was run against the mutated code, the outcome was recorded, and the mutation was reverted (`git diff`
confirms zero net source changes — every row below nets to a **test-only** diff). Of the 13 candidates,
9 were condemned (consolidated into 8 ledger entries below — TP-07 covers two originally-separate
`gates.test.tsx` candidates) and **4 turned out to be false positives**, cleared with the mutation that
refuted them. Two of the four false positives share one root cause: the hunt's static reading assumed
a "compile-time-only" protection argument, missing that vitest/Babel transpile TypeScript without
type-checking, so that argument doesn't hold at `pnpm test` time — only at the separate `pnpm
typecheck` gate. The other two false positives were duplicate-coverage claims that mutation testing
showed were not actually duplicates (distinct behavior, or a partial rather than full overlap).

## Verdicts

### TP-01 — `apps/api/src/adapters/payments/stub-payment-rail.spec.ts` (condemned → strengthened)

**Pattern:** 1 (assertion true on any input). The "exposes a DI token and a documented default
timeout" test asserted `typeof PAYMENT_RAIL === "symbol"` — true from the moment the `Symbol(...)`
literal is declared, regardless of how the token is actually wired into Nest's DI graph.

**Mutation:** in `payments.module.ts`, changed both the `provide` key and the `exports` entry from
`PAYMENT_RAIL` to a literal `"WRONG_TOKEN_MUTATION"` string — the real regression class this test's
name ("exposes a DI token") claims to guard: `food-order.service.ts`'s `@Inject(PAYMENT_RAIL)` would
fail to resolve at Nest bootstrap.

**Observed outcome:** all 7 tests in the file still passed. No test anywhere in the repo bootstraps
`PaymentsModule` or `AppModule` through real DI (confirmed: `AppModule` appears in only one spec,
`merchant-routes-dead.e2e.spec.ts`, which walks static class metadata rather than calling
`Test.createTestingModule(...).compile()` — and `@nestjs/testing` is not even a project dependency).
The wiring bug would have shipped silently.

**Action — strengthened.** Replaced the vacuous `typeof` check with a `Reflect.getMetadata("providers"
| "exports", PaymentsModule)` read (matching the existing metadata-walk convention already used in
`merchant-routes-dead.e2e.spec.ts`, since `@nestjs/testing` isn't a dependency) asserting the provider
binds `PAYMENT_RAIL → StubPaymentRail` and is exported. Re-ran the same module mutation against the
strengthened test: fails with the token mismatch. Reverted; full file green (8 tests).

*Cleared on the same file, not condemned:* the neighboring "satisfies the PaymentRail interface
(initiate/confirm/reconcile are callable)" test looked identically vacuous under a compile-time
argument (the module-scope `const rail: PaymentRail = new StubPaymentRail()` type-pins the shape).
Mutation: renamed `initiate` to `initiateRENAMED` in `stub-payment-rail.ts`. **Refuted** — vitest
transpiles via esbuild with no type-checking, so the runtime `typeof rail.initiate === "function"`
check actually failed (`expected 'undefined' to be 'function'`). `pnpm typecheck` is a separate CI
gate; at `pnpm test` time this assertion is live. Left unchanged.

### TP-02 — `apps/api/src/observability/metrics.service.spec.ts` (condemned → strengthened)

**Pattern:** 1. "startTimer returns a closure yielding a non-negative elapsed-ms number" asserted
`typeof elapsed === "number"` and `elapsed >= 0`.

**Mutation:** `startTimer()`'s returned closure changed from `() => performance.now() - started` to
`() => 0` — a timer that always reports zero elapsed time no matter how long the operation actually
took.

**Observed outcome:** test still passed (`0` is a number, and `0 >= 0`). A first attempt at a
mutation (swapping the subtraction order to `started - performance.now()`, a plausible sign-flip typo)
was CAUGHT by the original assertion, since real wall-clock time had passed by the time `done()` ran —
but that was luck of timing, not a structural guarantee; the hardcoded-zero mutation proves the
assertion's real ceiling.

**Action — strengthened.** Replaced with a `vi.spyOn(performance, "now")` returning two controlled
values (1000, then 1042) and asserting the closure returns exactly `42` — pins the actual subtraction,
not just its sign/type. Re-ran the `() => 0` mutation against the strengthened test: fails
(`expected +0 to be 42`). Reverted; full file green (13 tests).

### TP-03 — `packages/shared/src/fixtures.test.ts` (condemned → strengthened)

**Pattern:** 1. The "makeOrderItem → OrderItem" test's second assertion used
`.toBeTruthy()` where the file's own stated contract (parse must round-trip **exactly**, proving
nothing was coerced/stripped) and every sibling assertion in the file use `.toEqual(...)`.

**Mutation:** `makeOrderItem` in `fixtures.ts` changed to ignore its `overrides` argument entirely
(always returns the hardcoded default `{description:"Documents", quantity:1}`).

**Observed outcome:** test still passed — `OrderItem.parse(makeOrderItem({...}))` is a non-empty
object regardless of whether the override was honored, so `.toBeTruthy()` can't tell "override
applied" from "override silently dropped."

**Action — strengthened, with a second-order fix.** A first pass just swapped `.toBeTruthy()` for
`.toEqual(makeOrderItem({...}))` — re-testing the SAME mutation showed this was STILL vacuous, because
both sides of the comparison call the same (now-broken) factory and cancel out (both collapse to the
same wrong default). Rewrote to compare against an independent object literal
(`{description: "Phone charger", quantity: 3}`) instead of a second factory call, THEN parse-round-trip
against that. Re-ran the ignore-overrides mutation: fails (`Phone charger` expected, `Documents`
received). Reverted; full file green (15 tests).

### TP-04 — `apps/admin/app/components/ConfirmModal.test.tsx` (condemned → strengthened)

**Pattern:** 1, in a sensitive lane (wallet credit — `D-D0c`/`LC-D06`). The dismissal-guard test's
`idempotencyKey` sub-assertion only checked `.toBeTruthy()`.

**Mutation:** in `ConfirmModal.tsx`, `setFormKey(crypto.randomUUID())` → `setFormKey("x")` — a
constant, non-unique key minted on every modal open.

**Observed outcome:** all 3 tests in the file still passed. Nowhere else in the repo does a test
assert idempotency-key uniqueness across separate modal opens (`grep -rn "idempotencyKey"` across
`apps/admin` returns only this one file). The comment directly above this assertion explains WHY a
fresh key per open matters (a lost-response retry after reopen must not dedupe against the original
credit) — but nothing tested it.

**Action — strengthened.** Since this is a money-adjacent sensitive lane, strengthened rather than
merely commented: after the first submit resolves and the dialog closes, the test now reopens the
modal, submits again, and asserts the second `idempotencyKey` is both truthy AND `.not.toBe(firstKey)`.
Re-ran the constant-key mutation against the strengthened test: fails (`expected 'x' not to be 'x'`).
Reverted; full file green (3 tests).

*Cleared, not condemned — same lane's guardrail file, not touched:* the hunt agent additionally flagged
`error.test.tsx` as a pattern-7 duplicate of `components/states.test.tsx`'s `RetryableError` test (both
render a "Try again" button and assert a callback fires once). Mutation: `error.tsx`'s
`onRetry={reset}` → `onRetry={() => {}}` (drop the prop forwarding). **Refuted** — `states.test.tsx`
(unaffected, since it doesn't render `AdminError`) still passed, while `error.test.tsx` caught the
regression (`expected "vi.fn()" to be called 1 times, but got 0 times`). The two tests cover distinct
surfaces (the wrapper's prop-forwarding vs. the underlying component's own mechanics); left unchanged.

### Cleared — `packages/shared/src/money.test.ts` vs `policy.test.ts` (investigated, not condemned)

**Pattern flagged:** 7 (duplicate coverage) — `money.test.ts`'s "matches the pinned commission
goldens" and `policy.test.ts`'s "rounds half a cent UP" block share 3 identical (amount, rate,
expected) triples, and `perRideCommission` is a pure one-line pass-through of `percentOf`.

**Mutation:** `percentOf` in `money.ts` changed from `Math.round(...)` to `Math.floor(...)` (breaks the
documented half-cent-rounds-up behavior).

**Observed outcome:** BOTH blocks failed identically. Not vacuous — the mutation just doesn't
distinguish the two call sites, because they exercise the same underlying rounding through direct vs.
indirect calls, which is legitimate (not meaningless) redundancy. Also: the `policy.test.ts` block
carries 2 boundary cases (`(0.01, 50)`, `(0.03, 20)`) that `money.test.ts` does NOT have — it is a
partial overlap, not a full duplicate, so there's no clean "redundant half" to delete without losing
coverage. Left unchanged; the file's own comment ("These MUST equal the values policy.test.ts pins")
already documents the overlap as deliberate.

### TP-05 — `apps/mobile/src/api/__tests__/heartbeat.test.ts` (condemned → deleted)

**Pattern:** 1, degenerate case. The "does NOT fall back on a network failure" test ended with
`expect(sendHeartbeat).toBeDefined()` — checking the already-imported top-level function reference is
non-`undefined`. Every other test in the same `describe` block calls `sendHeartbeat(...)` directly and
would throw loudly if it were ever undefined, so this line adds nothing beyond what's already fully
subsumed by its siblings. No mutation could target this line alone without also failing every other
test in the file first (an actually-missing export breaks every call site, not just this assertion).

**Action — deleted** the one dead line; the rest of the test (the real network-failure-vs-404 behavior
it verifies) is untouched. Full file green (5 tests, same count).

### TP-06 — `apps/mobile/src/logic/__tests__/eta.test.tsx` (condemned → strengthened)

**Pattern:** 1. "bakes in the road-winding factor (constants exported and sane)" asserted
`ROAD_WINDING_FACTOR > 1` and `ETA_SPEED_KMH > 0`.

**Mutation:** `ROAD_WINDING_FACTOR` in `eta.ts` changed from `1.3` to `50`.

**Observed outcome:** test still passed (`50 > 1` is true). The file's OWN neighboring test
("computes minutes from distance × winding ÷ speed") does catch this via its banded-range assertion —
but the "bakes in" test, taken on its own, can't distinguish the documented value from a wildly wrong
one.

**Action — strengthened.** Since these are documented, behavior-preserving exported constants (not
runtime-computed values), replaced the sanity bounds with exact pins: `.toBe(1.3)` / `.toBe(22)`.
Re-ran the same mutation against the strengthened test: fails (`Expected: 1.3, Received: 50`).
Reverted; full file green (9 tests).

### TP-07 — `apps/mobile/src/logic/__tests__/gates.test.tsx` (condemned → strengthened, 2 assertions)

**Pattern:** 1, on copy strings — directly relevant to CLAUDE.md's mock-copy-verbatim mandate. Two
gate-copy assertions used `.toBeTruthy()` where the mocks specify exact, drawn text:
`ONLINE_GATE_COPY.kyc_expired.title` and `ACCOUNT_ON_HOLD_COPY.{title,message}`.

**Mutation 1:** `ACCOUNT_ON_HOLD_COPY.title` in `gates.ts` changed from `"Your account is on hold"` to
`"WRONG COPY MUTATION"`. **Observed:** test still passed. (Also mutated the identically-worded but
distinct `ONLINE_GATE_COPY.on_hold.title` by an over-broad `sed` in the process — caught immediately
via `git diff`, both restored to their original independent values before re-testing.)

**Mutation 2:** `ONLINE_GATE_COPY.kyc_expired.title` changed from `"Your ID has expired"` to `"WRONG
COPY MUTATION"`. **Observed:** the file's existing `.not.toBe(ONLINE_GATE_COPY.kyc.title)`
distinctness check also passed (the wrong string is still distinct from the `kyc` title), so a
wrong-but-nonempty-and-distinct string fully slipped through both assertions in the test.

**Action — strengthened, both.** Replaced `.toBeTruthy()` with `.toBe(<exact mock copy verbatim>)` in
both spots (kept the pre-existing distinctness check alongside the kyc_expired pin). Re-ran both
mutations against the strengthened assertions: both fail with the exact expected/received diff.
Reverted; full file green (26 tests).

### TP-08 — `apps/mobile/src/ui/__tests__/stepper.test.tsx` (condemned → strengthened)

**Pattern:** 3 (weak structural check masquerading as behavior). "marks a step live rather than
leaving the whole timeline inert during the kitchen phase" — the regression this test exists to catch
(documented in the file's own header comment: before the fix, `currentIdx` was `-1` for the whole
`requested` status and EVERY step rendered as "todo") — only asserted
`textOf(tree).toContain("✓")`, i.e., that a checkmark exists ANYWHERE in the rendered tree.

**Mutation:** in `apps/mobile/src/ui/index.tsx`, `Stepper`'s `currentIdx` for the food-customer branch
changed from `foodCustomerStepIndex(props.currentStatus, props.merchantPhase)` to a hardcoded
`stepKeys.length - 1` (always the LAST step, ignoring the real dispatch/kitchen state entirely).

**Observed outcome:** all 10 tests in the file still passed. With 6 of 7 steps now wrongly marked
"done," a checkmark trivially "exists somewhere" — the test could not tell "step 0 done, correctly"
from "everything except the last step done, wrongly."

**Action — strengthened.** Replaced the `.toContain("✓")` check with a full ordered-sequence
`.toEqual([...])` pin of every glyph+label pair the component renders for the `requested` +
`merchantPhase: "preparing"` case (`["✓","Order placed","2","Restaurant accepted","3","Rider
secured", ...]`), so the CORRECT step (not just any step) must carry the checkmark. Re-ran the
always-last-step mutation against the strengthened test: fails, showing the full wrong-shape diff
(steps 0–5 all `"✓"` instead of `"2".."6"`). Reverted; full file green (10 tests).

### Cleared — `apps/mobile/src/logic/__tests__/order-offers.test.ts` (investigated, not condemned)

**Pattern flagged:** 1 — `expect(r.every((x) => typeof x.recommended === "boolean")).toBe(true)`,
immediately after `expect(r.some((x) => x.recommended)).toBe(true)`, looked like it added nothing
beyond the truthiness check above it.

**Mutation:** `order-offers.ts`'s `best`-mode mapper changed `recommended: r.recommended` to
`recommended: (r.recommended ? 1 : 0) as unknown as boolean` — a numeric flag instead of a boolean one
(TypeScript would catch this at `pnpm typecheck`, but `pnpm test` runs under Babel/jest with no type
checking, so a runtime type regression here is live at test time, same class of gap as TP-01's
refuted candidate).

**Observed outcome:** the `typeof` assertion FAILED (`expected true to be false`) while the `.some()`
truthiness check above it would have passed unchanged (`1` is truthy). Not vacuous — it's the specific
line that catches a shape regression the sibling assertion can't. Left unchanged.

## Summary

| ID | File | Pattern | Verdict | Action |
|---|---|---|---|---|
| TP-01 | `apps/api/.../stub-payment-rail.spec.ts` | 1 | Condemned | Strengthened (real DI-metadata check) |
| — | same file, "satisfies the interface" test | 1 (claimed) | Refuted | No change |
| TP-02 | `apps/api/.../metrics.service.spec.ts` | 1 | Condemned | Strengthened (mocked `performance.now`) |
| TP-03 | `packages/shared/src/fixtures.test.ts` | 1 | Condemned | Strengthened (independent-literal `toEqual`) |
| TP-04 | `apps/admin/.../ConfirmModal.test.tsx` | 1 (sensitive: wallet) | Condemned | Strengthened (reopen + distinct-key) |
| — | `apps/admin/app/error.test.tsx` | 7 (claimed) | Refuted | No change |
| — | `money.test.ts` vs `policy.test.ts` | 7 (claimed) | Refuted | No change (partial overlap, both real) |
| TP-05 | `apps/mobile/.../heartbeat.test.ts` | 1 (degenerate) | Condemned | Deleted (fully subsumed) |
| TP-06 | `apps/mobile/.../eta.test.tsx` | 1 | Condemned | Strengthened (exact-value pin) |
| TP-07 | `apps/mobile/.../gates.test.tsx` | 1 (×2) | Condemned | Strengthened (exact mock-copy pin, ×2) |
| TP-08 | `apps/mobile/.../stepper.test.tsx` | 3 | Condemned | Strengthened (ordered glyph-sequence pin) |
| — | `apps/mobile/.../order-offers.test.ts` | 1 (claimed) | Refuted | No change |

9 original candidates condemned, consolidated into 8 ledger entries (7 strengthened, 1 deleted; TP-07
covers 2 originally-separate `gates.test.tsx` candidates), 4 cleared by mutation evidence — 13 total.
Net diff: 8 test files
changed, 0 source files changed (every mutation used to prove a verdict was reverted). No guardrail
suite (`design-tokens.drift.spec.ts` / `screen-inventory.spec.ts` / `check-design-freeze.mjs`) touched.
No sensitive-lane test deleted — TP-04 (wallet-credit) was strengthened, not removed, consistent with
the routine's hard rule.

Full suite green post-change: `pnpm typecheck` clean; `pnpm test` — api 100 files/1729 tests, mobile
160 suites/1201 tests (unchanged count — TP-05 deleted an assertion, not a test), admin 11 files,
merchant 29 files, shared 12 files, all passing.
