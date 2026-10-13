# Lynia load harness (k6)

The performance-track (LR10–LR15) scenarios and the load they model. Standalone [k6](https://k6.io)
JavaScript, **not** part of the TS build.

> **Never point this at production** (`api.lyniago.com`): it would load real users, and production
> refuses the QA sign-in the harness needs (console OTP + `OTP_TEST_PHONES`). Staging is retired, so run
> it against a **local stack** (`CONTRIBUTING.md` §2, `NODE_ENV=development`) with
> `OTP_CHANNEL=console`, `OTP_TEST_PHONES=<the numbers below>` and `KYC_PROVIDER=stub`
> (`docs/AZURE-OWNER-RUNBOOK.md` §8). A local run proves correctness under contention and the throttle;
> it does not measure production latency.

## The load envelope

A starting envelope for the founder to ratify. `×5` is the stress multiple the harness also runs.

| Parameter | 1× (steady) | ×5 (stress) |
|---|---|---|
| Riders online (concurrent) | 100 | 500 |
| Customers active (concurrent) | 200 | 1,000 |
| Orders created / peak hour | 300 | 1,500 |
| Concurrent live deliveries | 40 | 200 |
| GPS fixes / rider | 1 per 3 s | 1 per 3 s |
| Offers per order | 5 | 15 |
| WebSocket connections | ~350 | ~1,700 |
| OTP sends / hour | 150 | 750 |

**Derived rates (1×):** order-create ≈ 0.08 rps (300/hr) but bursty, so model peaks at ~1 rps.
Offer-make ≈ order rate × offers per order ≈ 0.4 rps. WS position emits ≈ 40 deliveries × 1 fix / 3 s ≈
13/s (the server coalesces to ≤ 1/s per room).

**Nationwide board (D-99).** Every online rider in Zimbabwe is pushed every new order and sees it on the
board (`BROADCAST` in `packages/shared/src/policy.ts`). So each order fans out to **all** online riders,
not a 5 km disc: the push and board cost per order grows with the number of riders online. Size the
fan-out at the riders-online row above. The harness's coordinates (`lib.js`) sit around central Harare,
which is inside the service area.

## SLO thresholds

`offer-loop.js`'s `thresholds` assert client-side p95 for 3 of the 6 server SLOs in
`docs/OBSERVABILITY.md`. The server metrics are the truth; k6 round-trip time is the ceiling.

| Flow | Server metric | p95 target | Asserted by k6? |
|---|---|---|---|
| Offer make | `offer_received_latency_ms` | < 2000 ms | ✅ `{name:offer}` |
| Offer select (guarded CAS) | `match_select_duration_ms` | < 300 ms | ✅ `{name:select}` |
| Nearby-rider broadcast | `broadcast_nearby_duration_ms` | < 400 ms | ⬜ server metric only |
| OTP verify | `otp_verify_duration_ms` | < 800 ms | ⬜ server metric only |
| Any HTTP request | `http_request_duration_ms` | < 1000 ms | ✅ overall `http_req_duration` |
| Position emit | `position_emit_latency_ms` | < 500 ms | ⬜ server metric only |

## Files

| Script | What it proves |
|---|---|
| `lib.js` | Shared helpers: QA OTP sign-in, coordinates, order/offer/select calls (shapes mirror `packages/shared/src/contracts.ts`). |
| `smoke.js` | 1 VU, one full loop. **Run this first** to validate the harness and the target. |
| `offer-loop.js` | The core loop under ramping VUs: create → broadcast → offer storm → **atomic select** (exactly one winner) → lifecycle → WS tracking. LR11, LR12. |
| `abuse.js` | One token hammering write endpoints gets **429, not 5xx** (LR3). |

## Run

```bash
# 1. validate the harness
BASE_URL=http://localhost:3000 \
  CUSTOMER_PHONE=+263771234567 RIDER_PHONE=+263770000002 \
  k6 run apps/api/load/smoke.js

# 2. steady (1×) — the SLO thresholds must pass
BASE_URL=http://localhost:3000 PHONES=+263771234567,+263770000002,+263770000003 \
  k6 run apps/api/load/offer-loop.js

# 3. stress (×5) — triage any breach into an LR14 capacity ceiling
BASE_URL=http://localhost:3000 STRESS=5 PHONES=... k6 run apps/api/load/offer-loop.js

# 4. throttle proof
BASE_URL=http://localhost:3000 k6 run apps/api/load/abuse.js
```

`BASE_URL` defaults to `http://localhost:3000`. Install k6 with `brew install k6` or
`docker run grafana/k6`.

## Reading results

- `http_req_duration` p95 must clear the thresholds in `offer-loop.js`.
- `offer_select_assigned` vs `offer_select_conflict`: conflicts are **expected** (the losers of a
  contended select); a *double* assign on one order is the bug. Cross-check `match_select_total{outcome}`.
- `abuse.js`: `throttled_429 > 0` and `server_5xx < 0.01` mean the throttle and the exception filter hold.
- Watch the Prisma pool against Postgres connections at ×5. Production allows 5 API replicas ×
  `DATABASE_CONNECTION_LIMIT` 5 = 25 connections on the B1ms server (`infra/azure/variables.tf`).

Record p95s and breaches in the PR that runs them. A breach becomes a fix, or an LR14 ceiling with a
lever and a metric trigger.

## Still open (LR13–LR15)

- **Soak** (2 h at 1×): memory (coalesce timers, socket rooms), Redis key growth, p95 drift.
- **Reconnect storm** (kill all sockets at once): the REST-snapshot self-heal absorbs the burst with no
  duplicate emits.
- **Capacity ceilings** (LR14): the `take` caps on lists, the presence scan, and the nationwide
  broadcast fan-out, each with a measured break point, a lever and a trigger.
