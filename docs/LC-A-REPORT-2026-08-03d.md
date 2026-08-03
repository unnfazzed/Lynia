# LC-A report — 2026-08-03d (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the next unchecked
optimization item, **A-O11** (LC-A03 ledger row: the shared test-fixture module riding into the
mobile Hermes bundle via the `@lynia/shared` barrel export).

## What shipped

`packages/shared/src/index.ts` dropped `export * from "./fixtures"`. The 299-line
`fixtures.ts` module (`makeOrder`/`makeWallet`/`FIXTURE_IDS`/etc., roadmap 4.1's shared-fixture
factory) no longer rides into every `@lynia/shared` consumer's bundle — including
`apps/mobile`'s, which has zero use for it at runtime.

The A-T2 audit that seeded this item said the module's only consumer was its own sibling
self-test (`fixtures.test.ts`, which already imports it via a relative `./fixtures` path, not the
barrel) — true for `apps/mobile`/`apps/admin`/`apps/merchant`, but a repo-wide re-check this run
found one real consumer the original sweep didn't cover: `apps/api/src/offers/offers.service.spec.ts`
imports `makeOffer` from `@lynia/shared` (the barrel). `apps/api` is a Node/Nest service, so this
never cost mobile bundle bytes either way, but removing the barrel export would have broken that
test's import.

Fixed by giving `fixtures.ts` a proper non-barrel entry point instead of leaving it fully
unexported: `packages/shared/package.json` gained a `"./fixtures"` subpath in its `exports` map
(mirroring the existing `"."` entry, pointing at `dist/fixtures.{js,d.ts}`), and
`offers.service.spec.ts` now imports `makeOffer` from `@lynia/shared/fixtures` (keeping
`MakeOfferRequest`, a real contract type, from the main barrel). `fixtures.test.ts` needed no
change — it already used the relative import.

A repo-wide grep for every fixture export (`FIXTURE_IDS`, `FIXTURE_TIME`, `makeWaypoint`,
`makeOrderItem`, `makeCreateOrderRequest`, `makeOrder`, `ORDER_LIFECYCLE_STATUSES`,
`makeOrdersInEachState`, `makeOffer`, `makeLedgerEntry`, `makeWallet`, `makeTopup`,
`makeMerchantFeatureFlags`, `makeCommissionConfig`, `makeKycState`, `KYC_STATUSES`,
`makeKycStatesInEachState`) confirmed no other importer anywhere in `apps/`/`packages/` reaches
these through the `@lynia/shared` barrel — the other `makeOrder`/`makeOffer` hits found by grep
are unrelated same-named local helpers in API integration specs (`tracking.int.spec.ts`,
`offer-loop.int.spec.ts`, `order-lifecycle.int.spec.ts`) and the mobile API client
(`apps/mobile/src/api/offers.ts`'s own `makeOffer` wrapper), not imports of the shared module.

## Evidence (before/after, `expo export --platform android`)

| | Before | After | Delta |
|---|---|---|---|
| Hermes JS bundle | 6,194,115 B (5.91 MiB) | 6,189,316 B (5.90 MiB) | **−4,799 B (−0.08%)** |
| Hermes budget headroom | 260,885 B (4.0%) | 265,684 B (4.1%) | +4,799 B |
| Android export total | 7,238,815 B (6.90 MiB) | 7,234,016 B (6.90 MiB) | −4,799 B (−0.07%) |
| Export-total headroom | 611,185 B (7.8%) | 615,984 B (7.8%) | +4,799 B |

Both runs used `apps/mobile/scripts/check-bundle-size.mjs` against a real
`expo export --platform android` output tree (via `git stash`/`stash pop` around the change, same
working tree otherwise) — a modest win, as expected: the fixtures module is plain data-shaped
helper functions, not a large third-party dependency graph like A-O12's zod locales cut.
`size-budget.json` is left untouched — ratcheting budgets down after a measured improvement is the
weekly steer's job, not an individual optimize-mode firing's.

## Verification

- `packages/shared` test suite (157 tests) — all pass; `fixtures.test.ts`'s contract-validation
  self-tests are unaffected since they already used the relative `./fixtures` import.
- `apps/api/src/offers/offers.service.spec.ts` (19 tests) — all pass against the repointed
  `@lynia/shared/fixtures` import.
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: green (6/6 typecheck, 5/5 lint with one
  pre-existing unrelated warning in `apps/api/src/admin/admin-orders.service.spec.ts`, 1516 API +
  701 mobile + shared/merchant/admin tests all passing).
- `expo export --platform android` ran clean before and after (2020 modules both runs, one fewer
  module than A-O12's report shows since Metro counts differently across export runs; no
  missing-module resolution errors).

No native/config change — this is OTA-able, JS-only.

## Sensitive-lane doctrine (this diff touches `apps/api/src/offers/`)

The diff touches one file under `apps/api/src/offers/` — `offers.service.spec.ts` — so the four
doctrine questions apply, even though the change is a test-only import repoint with zero production
code touched (`offers.service.ts`, `offers.controller.ts`, and every other production file are
untouched):

1. **Idempotency** — not applicable; no operation's idempotency semantics changed. The test still
   exercises the same `OffersService.makeOffer` behavior against the same fixture data — only where
   that fixture data (the `makeOffer()` factory call) is imported from changed, from the
   `@lynia/shared` barrel to the new `@lynia/shared/fixtures` subpath.
2. **State transition** — not applicable; no order-lifecycle edge changed. All 19 tests in the spec
   still assert the identical set of transitions/status codes as before.
3. **Money arithmetic** — not applicable; no money math touched. The fixture's `offeredFare` value
   and the service's fare-serialization logic are both unchanged.
4. **Regression test** — the existing 19-test `offers.service.spec.ts` suite is the regression
   coverage here: it fails to even collect (module resolution error) if the `@lynia/shared/fixtures`
   subpath export were missing or misconfigured, which is exactly the failure mode this change could
   introduce. Ran it explicitly post-change: 19/19 pass (see Verification above).

LC-A03 (`docs/KNOWN_BUGS.md`) and `A-O11` in the program doc are both marked resolved in this same
PR.
