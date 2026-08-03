# LC-A report — 2026-08-03c (size & data diet)

Lane A moved into OPTIMIZE MODE at `A-T5` (2026-08-03b); this firing takes the first unchecked
optimization item, **A-O12** (LC-A04 ledger row: zod v4's locale-tables barrel riding into the
Hermes bundle unconditionally).

## What shipped

`apps/mobile/metro.config.js`'s custom resolver already had precedent for redirecting an
unresolvable-without-`exports` deep import (the `@posthog/core` subpath fix). This PR adds a
second, narrowly-scoped redirect: zod v4's `export * as locales from "../locales/index.js"` —
reached from **two** separate call sites inside zod itself, `v4/classic/external.{js,cjs}` (what
`import { z } from "zod"` resolves to via zod's `main`/`module` entry chain) **and**
`v4/core/index.{js,cjs}` (re-exports the same barrel independently) — now resolves to an empty
stub module (`apps/mobile/metro-shims/zod-locales-stub.js`) instead of the real 50-language,
~872 KB-raw-source locales directory. The redirect matches on the importer's resolved path
(`.../zod/v4/(classic/external|core/index).{js,cjs}`), so it cannot affect any other package's
identically-shaped relative import. The direct `en.js`/`en.cjs` import (the actual default-locale
error messages the app uses) is untouched — it isn't the barrel, just the one English module.

The matching logic lives in its own pure module, `metro-shims/zod-locales-redirect.js`
(`shouldRedirect(moduleName, originModulePath)` + `stubPath`), split out from `metro.config.js`
so it's unit-testable without instantiating the full Sentry/Expo Metro config chain (attempting to
`require("../metro.config.js")` directly from a Jest test throws — `getSentryExpoConfig` calls
into `@sentry/react-native`'s own `expo/metro-config` loader, which doesn't resolve cleanly under
jest-expo's test runtime; the pure-module split sidesteps that entirely).

**Why two importers, not one:** the first cut of this fix only matched
`v4/classic/external.{js,cjs}` and measured *zero* byte improvement (6,439,957 → 6,440,084 bytes,
actually 127 B larger from a different content hash) — instrumenting the resolver with a temporary
debug log showed `v4/core/index.cjs` making its own independent `require("../locales/index.cjs")`
call that the narrower pattern missed entirely. Widening the importer pattern to cover both call
sites is what actually produced the measured drop below.

## Evidence (before/after, `expo export --platform android`)

| | Before | After | Delta |
|---|---|---|---|
| Hermes JS bundle | 6,439,957 B (6.14 MiB) | 6,189,900 B (5.90 MiB) | **−250,057 B (−3.9%)** |
| Hermes budget headroom | 15,043 B (0.2%) | 265,100 B (4.1%) | +250,057 B |
| Android export total | 7,484,657 B (7.14 MiB) | 7,234,600 B (6.90 MiB) | −250,057 B (−3.3%) |
| Export-total headroom | 365,343 B (4.7%) | 615,400 B (7.8%) | +250,057 B |

Both runs used the same `apps/mobile/scripts/check-bundle-size.mjs` measurement against a real
`expo export --platform android` output tree (not an estimate) — module count went from 2068 to
2069 (the one new stub module), everything else in the export (26 assets, font weights) unchanged.
`size-budget.json` is left untouched this run: ratcheting budgets down after a measured
improvement is the weekly steer's job (`docs/ROUTINES.md`), not an individual optimize-mode
firing's; this PR only guarantees the guardrail number never regresses, which it doesn't.

## Verification

- `packages/shared` test suite (157 tests, including `pricing.test.ts`/`restaurant-hours.test.ts`/
  others that exercise `contracts.ts`'s zod schemas via `.parse()`) — all pass, confirming the
  redirect doesn't touch anything the app's actual zod usage depends on.
- New regression coverage: `apps/mobile/__tests__/metro-config.test.ts` (6 cases against
  `zod-locales-redirect.js` — cjs and esm classic-external importer paths, the core/index importer
  path, a passthrough check for the still-needed `en.js`/`en.cjs` import, a negative check that an
  unrelated package's identically-shaped relative import is NOT redirected, and a stub-path
  sanity check).
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: green (6/6 typecheck, 5/5 lint with one
  pre-existing unrelated warning in `apps/api/src/admin/admin-orders.service.spec.ts`, 1516 API +
  690 mobile + shared/merchant/admin tests all passing — mobile went 684→690 with the new suite).
- `expo export --platform android` ran clean both before and after (no missing-module resolution
  errors), confirming the redirect target is a valid ES module Metro can bundle.

No native/config change — this is OTA-able, JS/Metro-config only. No sensitive-lane doctrine
questions apply (no diff under `apps/api/src/{wallet,settlements,offers,orders,matching,kyc,
riders}/` or `packages/shared/src/{policy,pricing,money}.ts`). LC-A04 (`docs/KNOWN_BUGS.md`) and
`A-O12` in the program doc are both marked resolved in this same PR.
