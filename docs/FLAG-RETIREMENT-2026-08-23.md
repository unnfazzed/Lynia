# Flag retirement — 2026-08-23

Second run of the weekly flag-retirement routine (`docs/routines/flag-retirement.md`,
`docs/ROUTINES.md` §"Four Sunday-night maintenance lanes"). Mission: inventory every feature flag /
kill switch / env-var gate / remote-config branch across the repo, classify each against reality, and
act — inline shipped-and-launched flags, verify unlaunched fail-safe defaults, and ledger forgotten
ones for an owner decision. Ledger prefix `FLAG-`.

## Phase 0 — dedup + baseline

- `docs/KNOWN_BUGS.md` read in full. Respected recorded deliberate keeps: `MOB-BOOT-02-SIB-1`
  (home.tsx ownership handoff to a concurrent restructure), `MOB-BOOT-02-SIB-2` (the still-unlaunched
  dispatch flag), and `FLAG-01` (the 2026-08-16 finding below — a recorded finding awaiting an owner
  call, not something to re-raise or act on unilaterally).
- One open PR at Phase 0: `#879` (`release-please--branches--main--components--lynia`, a release-please
  chore, not a `claude/*` sibling) — out of lane, no overlap.
- `pnpm install`, then `pnpm --filter api run prisma:generate` (the same environment-setup gap
  `FLAG-01`/`DC-01` recorded — a fresh checkout's `pnpm install` doesn't run `prisma generate`, not a
  code defect). `pnpm typecheck` was green immediately (6/6 Turbo tasks). `pnpm test` came back **2
  failing tests, both in `app/rider/(tabs)/__tests__/index.test.tsx`**: a `FlatList` render test that
  exceeded its 5000 ms timeout, and a KYC-pending-state test whose rendered tree showed stale home
  content instead of the "We're checking your ID" copy. Re-running that single file in isolation
  (`npx jest 'app/rider/\(tabs\)/__tests__/index.test.tsx'`) came back **56/56 green**, including the
  slow 16 s TRANSIENT-retry test that shares the suite — confirming this was full-suite worker
  contention/ordering flake (the run itself logs "A worker process has failed to exit gracefully"),
  not a code defect. Confirmed clean baseline before proceeding, consistent with how `FLAG-01` and
  `DC-01` treated their own environment-only red baselines.

## Phase 1 — inventory (re-verified against current code, not re-derived from scratch)

Diffed the full flag/gate surface against the 2026-08-16 table
(`docs/FLAG-RETIREMENT-2026-08-16.md`). No flag-related commits landed in the intervening week:
`git log --since=2026-08-16` on `apps/mobile/src/net/use-feature-flags.ts`, `apps/api/src/config/env.ts`,
`infra/terraform/`, `apps/admin`, `apps/merchant` shows nothing touching flag surface (the two commits
in that window — a release-please chore that only added `infra/terraform/.gitignore` /
`.terraform.lock.hcl`, and the 2026-08-23 crash-fuzz routine's `Array.isArray` guards — are unrelated).
Also re-confirmed directly against source, not just git history:

| Flag / gate | Client default (`use-feature-flags.ts:31-33`) | Server default (`env.ts`) | Unchanged since 08-16? |
|---|---|---|---|
| `restaurantsEnabled` | `true` | `RESTAURANTS_ENABLED` `.default("false")` | Yes |
| `merchantDispatchAutoEnabled` | `false` | `MERCHANT_DISPATCH_AUTO_ENABLED` `.default("false")` | Yes |
| `merchantWalletEnabled` | `false` | `MERCHANT_WALLET_ENABLED` `.default("false")` | Yes |
| `WALLET_REVEAL` → `CommissionConfig.enabled` | n/a (field still unread by mobile) | `.default("true")` | Yes — confirmed no commits touched `TabBar.tsx`, `use-wallet.ts`, `wallet.service.ts`, or `env.ts` since 08-16 |
| `Merchant.pilotEnabled` | n/a | `@default(false)` (`schema.prisma:977`) | Yes |
| `infra/terraform` boolean variables | n/a | see `variables.tf` | Yes — only a `.gitignore`/lockfile addition landed, no `variables.tf` change |
| `NOTIFICATIONS_FEED_ENABLED`, `MICRO_CACHE_*`, `WHATSAPP_OTP_COPY_CODE_BUTTON`, `MIN_SUPPORTED_APP_VERSION`, `COMMISSION_RATE_PCT`, `COMMISSION_SHADOW_RATE_PCT` | n/a | unchanged | Yes |

Screen-inventory allowlist re-checked directly in `tools/parity/parity-status.mjs`:
`LJ.home_flag_off` (:35), `RJM.board_food_off` (:179), `RJM.board_empty_food_off` (:180) are all still
present and `PENDING` — not orphaned, no guardrail gap.

No new flags, kill switches, env-var gates, or remote-config branches found on any face.

## Phase 2 — classify + act

- **`restaurantsEnabled` (shipped & launched).** Re-checked the Piranha-pass trigger
  (`TODOS.md` §"Post-launch flag cleanup" — "Restaurants stable in prod ~4 weeks with the kill switch
  never pulled"). No commit or doc records an exact go-live timestamp, but the tightest possible bound
  still rules the trigger out: `docs/KNOWN_BUGS.md`'s 2026-07-31 X2 rehearsal entry is explicitly
  described as "run **before** the go-live flip," and `MOB-BOOT-02` (2026-08-12) already treats
  Restaurants as launched — so go-live falls somewhere in that 12-day window at the earliest. Even
  taking the earliest bound (2026-07-31), today (2026-08-23) is 23 days out, short of the ~28-day
  (4-week) trigger. **No action** — the recorded decision stands, kill switch stays.
- **`merchantDispatchAutoEnabled`, `merchantWalletEnabled` (unlaunched).** Re-verified fail-safe-OFF
  default on both faces, unchanged from 08-16, and the `MOB-BOOT-02-SIB-2` tripwire (the boot-default
  assertion in `src/net/__tests__/use-feature-flags.test.tsx` pinning `false`) is still in place — it's
  part of the suite that ran green this session. **No action.**
- **`WALLET_REVEAL` / `CommissionConfig.enabled` (forgotten/internal-only, `FLAG-01`).** No owner
  ship-or-delete decision has been recorded anywhere (`TODOS.md`, `SESSION-COORDINATION.md`,
  `KNOWN_BUGS.md` all searched — no follow-up). No file in the finding's evidence list
  (`env.ts`, `wallet.service.ts`, `use-wallet.ts`, `TabBar.tsx`, `money.tsx`, `top-up.tsx`) changed
  since 08-16. Per the routine's conservatism for this class, **still not unilaterally fixed** — the
  `FLAG-01` row stands as-is; this run adds a "re-verified, no owner decision yet" note rather than a
  new finding.

## Phase 3 — outcome

No code changed this run. Every flag's classification matches the 2026-08-16 inventory, re-verified
directly against current source rather than assumed from the prior report. `FLAG-01` remains open,
awaiting an owner ship-or-delete call. `docs/KNOWN_BUGS.md` updated with a `FLAG-01` re-verification
note and this report. Next week's run: re-check `FLAG-01`'s disposition, re-check the
`restaurantsEnabled` kill-switch's 4-week Piranha-pass trigger (now closer — worth finding or recording
an exact go-live date so the trigger can be checked precisely instead of by bound), and treat every
other row above as settled unless the code changes.
