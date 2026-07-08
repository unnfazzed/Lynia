## What & why

<!-- What changes, and the reason. Link the doc/review/issue that motivated it. -->

## Risk & rollout

- **User-facing?** <!-- yes/no — which surface (customer / rider / admin) -->
- **DB migration?** <!-- yes/no — if yes: confirm it is expand-only / online-safe (CONTRIBUTING §3) -->
- **Wire-contract change?** <!-- yes/no — if yes: additive-only, or versioned endpoint? Old installed apps must keep working (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c) -->
- **Mobile:** <!-- n/a / OTA-able (JS-only) / needs a new binary (native change) -->

## Rollback plan

<!-- How this is undone if it misbehaves in prod. API: previous-revision traffic re-point
     (rollback.yml). Mobile OTA: republish previous update. Binary: halt staged rollout. -->

## Checklist

- [ ] `pnpm typecheck && pnpm build && pnpm test` green locally
- [ ] New behavior has a test that would have caught its absence
- [ ] Migration (if any) passes the online-safe guard; enums stay in lockstep with `@lynia/shared`
- [ ] Docs updated where behavior/status changed (`docs/`, runbooks)
