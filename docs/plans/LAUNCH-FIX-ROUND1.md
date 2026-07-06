# Launch-Readiness Fix — Round 1 execution plan

> Fixes the Round-1 findings in `docs/LAUNCH-READINESS.md` §6. gstack flow: **Plan (this doc) →
> parallel Build lanes → Test → Engineering + Design review → adversarial Verify → Ship**. Each fix
> lands **with the regression test that would have caught it** (the campaign's own rule).
> Branch: `claude/launch-readiness-strategy-3l72q3`.

## Lane ownership (disjoint files — lanes run in parallel, never touch each other's files)

| Lane | Theme | Findings | Files owned |
|------|-------|----------|-------------|
| **L1** | Read authorization / IDOR | R1, R2, rider-enum | `orders/orders.service.ts` (`getSnapshot` membership), `orders/orders.controller.ts`, `offers/offers.controller.ts`, `offers/offers.service.ts` (`listForOrder` scoping), `tracking/tracking.controller.ts` (`/riders/nearby`), + their specs |
| **L2** | Auth session hardening | logout IDOR, verify throttle | `auth/auth.controller.ts`, `auth/auth.service.ts` (+ spec) |
| **L3** | Boot & abuse hardening | R6, R7, exception filter, body limit, global throttle | `config/env.ts` (JWT + launch guard), `main.ts` (body limit), `app.module.ts` (APP_FILTER + Throttler + Schedule), new `common/all-exceptions.filter.ts`, new `common/throttler.config.ts` (+ specs) |
| **L4** | Money + ban enforcement | R3, recordPayment, write-on-read, auto-pause scheduler, confirmItems | `admin/admin.service.ts` (ban/suspend → `isOnline=false`), `settlements/settlements.service.ts` (CAS pay, safe generate-on-read, cron), `orders/order-lifecycle.service.ts` (`confirmItems` CAS), new `settlements/settlements.scheduler.ts` (+ specs) |
| **L5** | Admin UI honesty | R4, R5 | `apps/admin/app/components/ConfirmModal.tsx`, `apps/admin/app/riders/actions.ts`, `orders/actions.ts`, `cash/actions.ts`, action-caller components |
| **L6** | Mobile UI honesty | offers-fetch error, rider-job cold-start | `apps/mobile/app/order/[id].tsx`, `apps/mobile/app/rider/job.tsx` |

**Coordinator (not a lane):** dependency baseline (`@nestjs/throttler`, `@nestjs/schedule`), CI lint
gate + lockfile pin, NestJS version alignment (tested in isolation), integration, review, verify, ship.

## Cross-lane contract
- **L3 registers** `ThrottlerModule.forRoot` (global default limit) and `ScheduleModule.forRoot()` in
  `app.module.ts`. **L4 assumes** `ScheduleModule` is registered and only adds the `@Cron` provider.
- **L1 must update** `orders.service.spec.ts` — the existing test asserting a `"stranger"` still gets a
  snapshot encodes the R1 bug; flip it to assert `ForbiddenException`.
- No lane edits `package.json`, `pnpm-lock.yaml`, `tsconfig*`, or runs install/build/commit — the
  coordinator owns those.

## Exit tests (per finding)
- **R1/R2:** new authz unit tests — a non-party caller → `ForbiddenException` on snapshot and on the
  offers list; a party still succeeds. `orders.service.spec` stranger-assertion flipped.
- **R3:** suspend/ban/auto-pause sets `isOnline=false` (unit test on the service); a banned rider fails
  the online-gate on next `setOnline`.
- **R4:** admin action posts the `{reason,note}` shape the endpoint's `ReasonRequired` binds (contract
  test / typed shape).
- **R5:** `ConfirmModal.confirm()` awaits the mutation and renders an error state on rejection (no
  close-on-failure); unit test on the modal.
- **R6/R7:** boot guard rejects default `JWT_SIGNING_SECRET` and any QA bypass when
  `NODE_ENV=production`; passes in dev/test. `env.spec` cases per combination.
- **recordPayment:** CAS/guard — a second pay call is a no-op/conflict, not a silent overwrite.
- **exception filter / throttle:** unit tests for the filter envelope; global throttle wired.
- **Mobile:** `isError` renders an honest error+retry, not a working/empty state (logic test).

## Deferred by decision (documented, NOT fixed this round — with rationale)
- **Cursor pagination** (take-caps) — LR14 defers this with metric triggers; fixing now contradicts the
  plan and is a broad, risky change at pilot scale.
- **Prisma pool size** — already env-tunable (`DATABASE_CONNECTION_LIMIT`); an ops/LR12 knob, not a bug.
- **Push city-wide fallback** — intentionally deferred (ghost-rider consistency trap; PILOT-READINESS).
- **Admin shared-token non-repudiation** — needs per-admin identity/SSO; architectural, tracked to LR8/LR4.
- **paid-then-regenerate under-collection (open week)** — SUSPECTED; settlements are 0%-commission /
  not live for ~6–8 months (CONCEPT §6). L4 makes generate-on-read safe; the deeper semantics wait for
  the monetization build.
