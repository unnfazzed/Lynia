# Flag retirement — 2026-08-16

First run of the weekly flag-retirement routine (`docs/ROUTINES.md` §"Four Sunday-night maintenance
lanes"). Mission: inventory every feature flag / kill switch / env-var gate / remote-config branch
across the repo, classify each against reality, and act — inline shipped-and-launched flags, verify
unlaunched fail-safe defaults, and ledger forgotten ones for an owner decision. Ledger prefix `FLAG-`.

## Phase 0 — baseline

- `docs/KNOWN_BUGS.md` read in full. Respected recorded deliberate keeps: `MOB-BOOT-02-SIB-1` (home.tsx
  ownership handoff to a concurrent restructure) and `MOB-BOOT-02-SIB-2` (the still-unlaunched dispatch
  flag). No open `claude/*` sibling PRs at Phase 0 (`unnfazzed/lynia`, `state: open` → empty).
- `pnpm install`, then `pnpm typecheck && pnpm test` on clean `main`. **Typecheck was green
  immediately.** `pnpm test` initially failed 21/100 API test files with `Cannot find module
  '.prisma/client/default'` — an environment-setup gap (this fresh checkout's `pnpm install` doesn't
  run `prisma generate`), not a code defect: running `pnpm --filter api run prisma:generate` and
  re-running `pnpm test` came back fully green (6/6 Turbo tasks, 1113 API tests + 1201 mobile tests, all
  passing). Proceeded from a confirmed-clean baseline.

## Phase 1 — inventory

The full flag/gate surface found across all four faces + `packages/shared` + `infra/terraform`:

| Flag / gate | Defined | Consumers | Client default | Server default | Fail direction | Launch status | Flag-off mock? |
|---|---|---|---|---|---|---|---|
| `restaurantsEnabled` | `apps/mobile/src/net/use-feature-flags.ts:27` (`DEFAULT_FEATURE_FLAGS`) | `app/(tabs)/home.tsx`, `app/(tabs)/orders.tsx`, `app/onboarding.tsx`, `app/role.tsx`, `app/food/index.tsx`, `app/food/search.tsx`, `app/rider/food-offer.tsx`, `src/ui/shell/ServiceTiles.tsx` | `true` (fails open) | `RESTAURANTS_ENABLED` env, `.default("false")` (`apps/api/src/config/env.ts:320`) | Client: open. Server env default: closed (prod value set separately, `true` per the launch runbook) | **LAUNCHED** — live in prod (`docs/LAUNCH-EXECUTION-RUNBOOK.md:544`); server kill switch (`RestaurantsEnabledGuard`) intentionally retained | Yes — `LJ.onboard_flag_off`, `LJ.role_select_flag_off` (wired in `app-targets.mjs`), `LJ.home_flag_off` (PENDING, allowlisted) |
| `merchantDispatchAutoEnabled` | `use-feature-flags.ts:28` | `app/rider/(tabs)/index.tsx` (board copy, food-offer route wiring) | `false` (fails closed) | `MERCHANT_DISPATCH_AUTO_ENABLED` env, `.default("false")` | Closed both sides | **UNLAUNCHED** — deliberate keep, `docs/LAUNCH-EXECUTION-RUNBOOK.md:545` | Yes — `RJM.board_food_off`, `RJM.board_empty_food_off` (PENDING, allowlisted) |
| `merchantWalletEnabled` | `use-feature-flags.ts:29` | none in app code (test fixtures only) | `false` | `MERCHANT_WALLET_ENABLED` env, `.default("false")` | Closed both sides | **UNLAUNCHED, inert** — zero mobile consumers | None (nothing renders on it) |
| `WALLET_REVEAL` → `CommissionConfig.enabled` | `apps/api/src/config/env.ts:305` | Server: `wallet.service.ts:81-95`. Client: fetched (`use-wallet.ts:18-21`) but `.enabled` never read | n/a (field ignored) | `.default("true")` (launched 2026-07-15 product decision) | Server computes correctly; client doesn't branch on it at all | **LAUNCHED, but the kill switch is disconnected** — see `FLAG-01` | n/a |
| `COMMISSION_RATE_PCT` | `env.ts:288-291` | `wallet.service.ts`, `riders/rider.service.ts` | n/a (server-only) | unset → launch default 0% | n/a | Live pricing lever, not a UI flag — out of scope (sensitive money lane, reviewed not acted on) | n/a |
| `COMMISSION_SHADOW_RATE_PCT` | `env.ts:295-298` | shadow-accrual logging only | n/a | `10` | n/a | Ops calibration input, not a UI gate | n/a |
| `NOTIFICATIONS_FEED_ENABLED` | `env.ts:313` | `notifications.controller.ts:34` | n/a | `.default("true")` | Fails soft (empty feed) — documented non-core kill switch, `docs/ARCHITECTURE.md` §Core vs non-core | Live, standing kill switch by design | Client already renders empty feed as its normal empty state — no first-frame risk |
| `MICRO_CACHE_DISABLED` / `MICRO_CACHE_REDIS_L2` | `env.ts:60,63` | `orders.service.ts` | n/a | `false` both | n/a | Ops/perf toggles, not user-facing | n/a |
| `WHATSAPP_OTP_COPY_CODE_BUTTON` | `env.ts:167` | `auth/otp-sender.ts` | n/a | `.default("true")` | n/a | Cosmetic messaging toggle, not a UI gate | n/a |
| `MIN_SUPPORTED_APP_VERSION` / `/app/version-gate` | `env.ts:250-253` | `apps/mobile/src/net/use-server-version-gate.ts` → `app/_layout.tsx` | n/a | `.default("0.0.0")` (inert) | Fails **open** deliberately (comment: "the honest failure mode for a check is to not block") | Standing gate, correctly implemented | n/a (not a feature flag, a version comparator) |
| `Merchant.pilotEnabled` | `apps/api/prisma/schema.prisma:926` | `merchant.service.ts`, `restaurant-reopen.service.ts`, `food-order.service.ts`, admin + merchant-portal UI | n/a (per-row) | `@default(false)` | Fails closed (new merchant invisible until enabled) | Live, correctly-wired per-merchant cohort gate — finer-grained rollback lever under `restaurantsEnabled` (`docs/LAUNCH-EXECUTION-RUNBOOK.md:511-512`) | n/a |
| `infra/terraform` variables (`admin_enabled`, `staging_enabled`, `cloudflare_dns_enabled`, `kyc_cmek_enabled`, `db_public_ip_enabled`, `redis_tls_enabled`, `slo_alerts_enabled`, `queue_alerts_enabled`, `scheduler_jobs_enabled`, `settlement_autopause_enabled`, `ci_provisioner_enabled`, `maps_api_keys_enabled`) | `infra/terraform/variables.tf` | gate whole resource blocks via `count`/`for_each` | n/a | see `variables.tf` | n/a | Infra-level, out of this routine's action scope (read-only doctrine) — inventoried per the routine's Phase 1 ask, no action taken | n/a |

Also inventoried and confirmed **not** stale: `BootstrapResponse.minSupportedVersion`
(`apps/mobile/src/api/bootstrap.ts:12`) is served but unread by the client — it's an explicitly
documented forward-looking placeholder ("for a future client that drops the separate probe"), not a
forgotten flag. No action.

## Phase 2 — classify + act

- **`restaurantsEnabled` (shipped & launched).** Already correctly handled by `MOB-BOOT-02`
  (2026-08-12): client default flipped to fail-open, server kill switch + all flag-off screens
  deliberately retained. Re-verified this run: `TODOS.md` §"Post-launch flag cleanup (the Piranha
  pass)" records the actual removal trigger — delete `RESTAURANTS_ENABLED`/`MERCHANT_*` and their
  dead branches once Restaurants has run **~4 weeks stable in prod with the kill switch never
  pulled**. That window has not elapsed. **No action** — the recorded decision stands.
- **`merchantDispatchAutoEnabled`, `merchantWalletEnabled` (unlaunched).** Verified the fail-safe-OFF
  default is still correct on both faces and no first-frame flash risk exists (dispatch: renders
  unlaunched-vertical copy only if flipped without also flipping the client default — tripwire already
  recorded as `MOB-BOOT-02-SIB-2`; wallet: zero consumers, nothing to flash). **No action — left in
  place**, per Phase 2's instruction for the unlaunched class.
- **`WALLET_REVEAL` / `CommissionConfig.enabled` (forgotten/internal-only).** New finding. The server
  computes and serves a real kill-switch value; no client code reads it, so the documented "set to
  false to hide it" behavior no longer exists — the Money tab is unconditionally shown regardless.
  This is not a MOB-BOOT-02-class defect (no first-frame flash, since nothing branches on the field),
  but the flag's own documentation is now false. Per the routine's conservatism for this class and the
  CLAUDE.md sensitive-lane doctrine (wallet visibility is a money-lane surface), **not unilaterally
  fixed**. Ledgered as `FLAG-01` in `docs/KNOWN_BUGS.md` with a ship-or-delete recommendation for the
  owner (wire `.enabled` into the tab/route, or delete the flag entirely and fold it into the same
  Piranha-pass trigger already scheduled for the merchant flags).
- **Screen-inventory guardrail check.** `LJ.home_flag_off`, `RJM.board_food_off`,
  `RJM.board_empty_food_off` are present in `tools/parity/screens.generated.json` and correctly marked
  `PENDING` in `tools/parity/parity-status.mjs` (verified directly, not just from the inventory pass) —
  they are legitimately allowlisted-pending-wiring, not orphaned targets. No guardrail gap found.

## Phase 3 — outcome

No code changed this run — every flag's classification either matched an already-recorded decision
(re-verified against current code) or landed in the conservative forgotten/internal-only bucket
pending an owner call. `docs/KNOWN_BUGS.md` updated with `FLAG-01` and this report. This inventory is
what keeps next week's run cheap: re-check `FLAG-01`'s disposition, re-check the `restaurantsEnabled`
kill-switch's 4-week Piranha-pass trigger, and treat every other row above as settled unless the code
changes.
