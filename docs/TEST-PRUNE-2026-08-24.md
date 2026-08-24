# Test-prune sweep — 2026-08-24

Second run of the weekly useless-test pruning routine (`docs/ROUTINES.md`), continuing `TP-`
numbering from the 2026-08-17 run (`docs/TEST-PRUNE-2026-08-17.md`, TP-01..08). No open `claude/*`
PRs to read as siblings (the only open PR was release-please's `chore(main): release 0.48.1`, not a
sibling routine run).

**Baseline.** Fresh checkout again needed `pnpm --filter api run prisma:generate` (the Prisma client
isn't committed — same environment-only gap the 2026-08-17 and 2026-08-23 runs already logged, not a
code defect) before `pnpm typecheck` went green. `pnpm test` then showed 2 failures, both in
`app/rider/(tabs)/__tests__/index.test.tsx` — a `FlatList` render timeout and a KYC-pending-state
assertion seeing stale content. This is the exact failure the 2026-08-23 `FLAG-01` re-verification
already recorded as a full-suite worker-contention/ordering flake, not a defect. Re-ran that file in
isolation: 56/56 green. Then re-ran the full `pnpm test` a second time: 192/192 suites, 1569/1569
tests, fully green, no flake this time either. Proceeded from a confirmed-clean baseline (api 100
files/1729 tests, mobile 192 suites/1569 tests, admin 11 files, merchant 29 files, shared 12 files).

## Method

Three parallel read-only hunts (api; mobile; admin+merchant+shared) swept every test file for the
seven cannot-fail patterns in the routine brief, explicitly excluding every file the 2026-08-17 run
already fixed or cleared. All three lanes independently reported the remaining suite as unusually
clean — no `.skip`/`.todo`/`xdescribe`/`xit` anywhere, no oversized snapshots (the suite still doesn't
use `toMatchSnapshot` at all), no literal mock-the-unit-under-test cases, and (per the admin/merchant/
shared hunt) no copy-string-grep-as-behavior beyond what's already legitimately scoped. Rather than pad
the candidate list to hit a target count, all three lanes reported only what genuinely cleared the
bar: 2 from mobile, 1 from api, 1 borderline from shared — 4 total. Every candidate below was proven or
cleared by an actual mutation — the source was changed, the target test was run against the mutated
code, the outcome was recorded, and the mutation was reverted (`git diff` confirms zero net source
changes — every row nets to a **test-only** diff). Of the 4, 3 were condemned and 1 was cleared as a
false positive.

## Verdicts

### TP-09 — `apps/mobile/src/logic/__tests__/food-checkout.test.ts` (condemned → strengthened)

**Pattern:** 1 (loose sanity-bound assertion where an exact value is the real contract). The "mirrors
the server's own haversineKm + deliveryFeeForDistance computation" test used a fixture pair (merchant
`-17.8292,31.0522`, dropoff `-17.8200,31.0500`, ~1.05km apart) and asserted only
`expect(fee).toBeGreaterThanOrEqual(1.5)`. Hand-computed (and confirmed via a standalone Node script
running the real `haversineKm`/`deliveryFeeForDistance` formulas): that fixture's real fee is **exactly
$1.50** — byte-identical to the N-01 floor value the very next test in the same file already pins via
`.toBe(1.5)`. The assertion could not distinguish "correctly mirrors the server's per-km formula" from
"always returns the floor regardless of distance."

**Mutation:** `estimateDeliveryFee` in `apps/mobile/src/logic/food-checkout.ts` changed from computing
the real `distanceKm` to hardcoding `deliveryFeeForDistance(0)` — i.e. completely ignoring the actual
distance and always returning the floor.

**Observed outcome:** all 10 tests in the file still passed, including the targeted test.

**Action — strengthened.** Swapped the fixture to two points ~4.01km apart (merchant `-17.8292,31.0522`,
dropoff `-17.80,31.03`), whose real fee computes to exactly $3.00 — well above the floor — and pinned
the exact value with `.toBe(3)`. Re-ran the same always-floor mutation against the strengthened test:
fails (`Expected: 3, Received: 1.5`). Reverted the mutation; full file green (10 tests).

### TP-10 — `apps/mobile/src/logic/__tests__/order-offers.test.ts` (condemned → strengthened)

**Pattern:** 1. The "best returns one entry per input, each original offer once, carrying a recommended
flag" test asserted `toHaveLength`, `new Set(...ids).toEqual(new Set([...]))` (unordered set
membership), `r.some((x) => x.recommended)` (at least one recommended, anywhere), and a `typeof
recommended === "boolean"` check — never the actual output ORDER or WHICH specific offer got
recommended, the two things `rankOffers`' price/rating/ETA blend (`packages/shared/src/offer-ranking.ts`,
roadmap D-d) exists to produce.

**Mutation:** `orderOffers`'s `best`-mode mapper in `apps/mobile/src/logic/order-offers.ts` changed from
`offers[r.index]!` to `offers[(r.index + 1) % offers.length]!` — an off-by-one that silently
misattributes every ranked slot to the wrong offer.

**Observed outcome:** all 6 tests in the file still passed. The mutation is a permutation of the same 3
offer ids, so the set-membership check can't see it, and exactly one entry still carries
`recommended: true` (just attached to the wrong offer), so the `.some()`/`typeof` checks can't see it
either.

**Action — strengthened.** Hand-computed the exact `rankOffers` blend for the fixture using
`DEFAULT_OFFER_WEIGHTS` (price .45 / rating .35 / eta .2): offer `a` scores 0.4833, `b` scores 0.45,
`c` scores 0.675 — best-first order `c, a, b`, with only `c` recommended. Replaced the weak assertions
with a single `.toEqual([{id:"c",recommended:true},{id:"a",recommended:false},{id:"b",recommended:false}])`
pin of the full ordered `{id, recommended}` sequence. Re-ran the off-by-one mutation against the
strengthened test: fails, showing the exact wrong-shape diff (`a` recommended instead of `c`, order
`a,b,c` instead of `c,a,b`). Reverted the mutation; full file green (6 tests).

### TP-11 — `apps/api/src/config/env.spec.ts` (condemned → strengthened)

**Pattern:** 1. "accepts strong rotation + hash secrets in production" asserted only
`expect(env.TOKEN_HASH_SECRET).toBeDefined()` — true regardless of what value `loadEnv` actually
returns. Every other value-passthrough assertion in this 200+-line file (32 of them) uses an exact
`.toBe(<expected value>)`; this was the one outlier.

**Mutation:** added a `.transform((v) => v === undefined ? v : \`${v}-corrupted\`)` to the
`TOKEN_HASH_SECRET` zod schema field in `apps/api/src/config/env.ts` — any defined value now comes back
with `"-corrupted"` appended, still ≥16 characters (so the production-strength boot-guard doesn't
reject it either).

**Observed outcome:** all 52 tests in the file still passed — including the targeted test AND the
neighboring "rejects a weak `TOKEN_HASH_SECRET` in production when set" test, since the corrupted value
still clears the length floor.

**Action — strengthened.** Replaced `.toBeDefined()` with
`.toBe("a-strong-dedicated-hash-secret-0123456789")` (the exact value the test itself already passes in
as input). Re-ran the corruption mutation against the strengthened test: fails
(`Expected: "...0123456789", Received: "...0123456789-corrupted"`). Reverted the mutation; full file
green (52 tests).

### Cleared — `packages/shared/src/design-tokens.test.ts` (investigated, not condemned)

**Pattern flagged:** 1 (borderline) — the hunt agent flagged "maps each role to a real raw-palette
value (the two-layer contract)" because every assertion compares two exports of the *same* module to
each other (`expect(semantic.text.body).toBe(color.ink)`) rather than to an independent expected value,
and because it provides no protection against a raw hex value itself changing (e.g. `color.ink`'s hex
literal drifting) — that class of regression is a separate, already-existing guardrail's job
(`apps/api/src/design-tokens.drift.spec.ts`, CLAUDE.md's token-conformance guardrail), not this test's.

**Mutation:** in `packages/shared/src/design-tokens.ts`, changed the mapping `text.body: color.ink` to
`text.body: color.muted` — the actual regression class the test's own name ("the two-layer contract")
claims to guard: a semantic role silently pointing at the wrong raw palette entry.

**Observed outcome:** failed immediately with a clear diff
(`Expected: "#14181B", Received: "#5B6670"`). Not vacuous — the test does exactly what it claims (guard
the role→raw MAPPING) and nothing more; the "borderline" read conflated "doesn't guard raw-value drift"
(true, but out of this test's stated scope and already covered elsewhere) with "can't fail" (false).
Reverted the mutation; full file green (2 tests). Left unchanged.

## Summary

| ID | File | Pattern | Verdict | Action |
|---|---|---|---|---|
| TP-09 | `apps/mobile/.../food-checkout.test.ts` | 1 | Condemned | Strengthened (non-floor fixture, exact-value pin) |
| TP-10 | `apps/mobile/.../order-offers.test.ts` | 1 | Condemned | Strengthened (exact ordered id+recommended pin) |
| TP-11 | `apps/api/.../env.spec.ts` | 1 | Condemned | Strengthened (exact-value pin) |
| — | `packages/shared/.../design-tokens.test.ts` | 1 (claimed) | Refuted | No change (mapping-only scope, already correct) |

3 candidates condemned and strengthened (none deleted), 1 cleared by mutation evidence — 4 total. Net
diff: 3 test files changed, 0 source files changed (every mutation used to prove a verdict was
reverted). No guardrail suite (`design-tokens.drift.spec.ts` / `screen-inventory.spec.ts` /
`check-design-freeze.mjs`) touched. No sensitive-lane test (bids/assignment/agreed-price/KYC/wallet)
involved this run.

Full suite green post-change: `pnpm typecheck` clean; `pnpm test` — api 100 files/1729 tests (unchanged),
mobile 192 suites/1569 tests (unchanged), admin 11 files, merchant 29 files, shared 12 files, all
passing.
