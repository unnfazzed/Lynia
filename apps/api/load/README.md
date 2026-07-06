# Lynia load harness (k6)

The performance-track (LR11/LR12) scenarios. Standalone [k6](https://k6.io) JavaScript — **not** part
of the TS build. Full plan + the launch envelope: [`docs/LOAD-MODEL.md`](../../../docs/LOAD-MODEL.md).

> **Target a STAGING deploy, never the live pilot** (`lyniago.lyniafinance.com`). Load-testing prod
> would DoS real users. Deploy staging in **QA mode** so the harness can sign in without vendors:
> `OTP_CHANNEL=console`, `OTP_TEST_PHONES=<the numbers below>`, `KYC_PROVIDER=stub`.

## Files
- `lib.js` — shared: QA OTP sign-in, corridor-valid coords, order/offer/select helpers (shapes mirror
  `packages/shared/src/contracts.ts`).
- `smoke.js` — 1 VU, one full loop. **Run this first** to validate the harness + target.
- `offer-loop.js` — the core load scenario (ramping VUs) + SLO thresholds + the atomic-select tally.
- `abuse.js` — throttle proof: hammering write endpoints must yield 429, not 5xx (LR3).

## Run
```bash
# 1. validate the harness
BASE_URL=https://<staging-host> \
  CUSTOMER_PHONE=+263771234567 RIDER_PHONE=+263770000002 \
  k6 run apps/api/load/smoke.js

# 2. steady (1×) — the SLO thresholds must pass
BASE_URL=https://<staging-host> PHONES=+263771234567,+263770000002,+263770000003 \
  k6 run apps/api/load/offer-loop.js

# 3. stress (×5) — triage any breach into an LR14 capacity ceiling
BASE_URL=https://<staging-host> STRESS=5 PHONES=... k6 run apps/api/load/offer-loop.js

# 4. throttle proof
BASE_URL=https://<staging-host> k6 run apps/api/load/abuse.js
```

## Reading results
- `http_req_duration` p95 must clear the thresholds in `offer-loop.js` (mirrors `docs/OBSERVABILITY.md`).
  The **true** server SLOs come from the OTEL pipeline (LR9) — k6 RTT is the ceiling, OTEL is truth.
- `offer_select_assigned` vs `offer_select_conflict`: conflicts are **expected** (losers of a contended
  select); a *double* assign on one order would be the bug — cross-check against
  `match_select_total{outcome}` on the dashboard.
- `abuse.js`: `throttled_429 > 0` and `server_5xx < 0.01` = the throttle + exception filter hold.

Record p95s + breaches into `docs/ENG-REVIEW.md`; breaches become LR14 ceilings or fixes.
