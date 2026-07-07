# Load model & performance test plan (LR10–LR15)

> The numbers the launch must survive, and how the k6 harness (`apps/api/load/`) exercises them. This
> is the **authorship** half of the performance track — the scenarios + targets. Running them needs a
> **staging stack** + the **OTEL collector live** (LR9), both founder/infra steps (see the end).

## The launch envelope (one Harare corridor)

Proposed starting envelope — **founder to ratify**. `×5` is the stress multiple the harness also runs.

| Parameter | 1× (steady) | ×5 (stress) |
|---|---|---|
| Riders online (concurrent) | 100 | 500 |
| Customers active (concurrent) | 200 | 1,000 |
| Orders created / peak hour | 300 | 1,500 |
| Concurrent live deliveries | 40 | 200 |
| GPS fixes / rider / sec | 1 per 3 s | 1 per 3 s |
| Offers per broadcast | 5 | 15 |
| WebSocket connections | ~350 | ~1,700 |
| OTP sends / hour | 150 | 750 |

**Derived rates (1×):** order-create ≈ **0.08 rps** (300/hr) but **bursty** — model peaks at ~1 rps;
offer-make ≈ order-rate × offers-per-broadcast ≈ **0.4 rps**; WS position emits ≈ 40 deliveries ×
(1 rider fix / 3 s) ≈ **13 emits/s** (server-coalesced to ≤1/s per room); nearby-broadcast geo-queries
fire once per order-create.

## SLO thresholds (from `docs/OBSERVABILITY.md`)

`offer-loop.js`'s `thresholds` block (client-side RTT) directly asserts p95 for **3** of the 6 server
SLOs; the true server SLOs for all 6 come from the LR9 OTEL pipeline once live — treat k6 timings as
the ceiling, OTEL as truth:

| Flow | Metric | p95 target | Asserted by k6? |
|---|---|---|---|
| Offer make (server handling) | `offer_received_latency_ms` | < 2000 ms | ✅ `{name:offer}` |
| Offer select (guarded CAS) | `match_select_duration_ms` | < 300 ms | ✅ `{name:select}` |
| Nearby-rider broadcast | `broadcast_nearby_duration_ms` | < 400 ms | ⬜ OTEL only — no isolable k6 request |
| OTP verify | `otp_verify_duration_ms` | < 800 ms | ⬜ OTEL only — no isolable k6 request |
| Any HTTP request | `http_request_duration_ms` | < 1000 ms | ✅ overall `http_req_duration` |
| Position emit (in-process) | `position_emit_latency_ms` | < 500 ms | ⬜ OTEL only — no isolable k6 request |

## Scenarios (`apps/api/load/`)

| Script | k6 scenario | What it proves | Maps to |
|---|---|---|---|
| `smoke.js` | 1 VU, 1 iter | the harness + a full offer-loop works end to end against the target | sanity |
| `offer-loop.js` | ramping VUs to the envelope | the core loop under load: create → broadcast → offer storm → **atomic select** (exactly one winner) → lifecycle drive → WS tracking | LR11, LR12 |
| `abuse.js` | a single token hammering write endpoints | throttling returns **429, not 5xx** (LR3 abuse hardening), and the exception filter holds | LR3, LR11 |

`offer-loop.js` carries the **contention** assertions (LR12): N riders bid on one order and exactly one
`select` returns `assigned` — the losers get a clean `taken`/`conflict`, never a double-assign. Run it at
`×5` for the stress pass; watch the Prisma pool vs Cloud SQL `max_connections` (LR12 connection math).

## How to run (founder / staging)

1. **Stand up a staging stack** (LR9/LR11) — a second Cloud Run + Cloud SQL + Redis, or any deploy that
   is NOT the live pilot (`lyniago.lyniafinance.com` is off-limits during the pilot). Deploy it in
   **QA mode** (`OTP_CHANNEL=console`, `OTP_TEST_PHONES=<the harness numbers>`, `KYC_PROVIDER=stub`) so
   the harness can authenticate without the WhatsApp/Didit vendors.
2. **Make the OTEL collector live** (LR9) so the real server-side SLOs are measured, not just k6 RTT.
3. Install k6 (`brew install k6` / `docker run grafana/k6`), then:
   ```bash
   BASE_URL=https://<staging-host> \
   k6 run apps/api/load/smoke.js          # validate the harness first
   k6 run apps/api/load/offer-loop.js     # 1× steady — SLO thresholds must pass
   STRESS=5 k6 run apps/api/load/offer-loop.js   # ×5 — triage breaches into LR14 ceilings
   k6 run apps/api/load/abuse.js          # throttle proof (429s, no 5xx)
   ```
4. **Record** the p95s + any breach into `docs/ENG-REVIEW.md`; breaches become LR14 capacity ceilings
   (with a lever + a metric trigger) or fixes.

## What stays open (LR13–LR15, need the runs above)

- **Soak** (2 h at 1×): watch memory (coalesce timers, socket rooms), Redis key growth (TTLs expiring),
  p95 drift.
- **Reconnect storm** (kill all sockets at once): REST-snapshot self-heal absorbs the burst, no dup emits.
- **Capacity ceilings** (LR14): the `take`-cap lists (50/100/500), the presence scan, the city-wide
  broadcast fallback — each priced with a measured break point + lever + trigger.
- **Cost model** (LR15): the GCP bill at 1× / 5× / 20× (baseline ≈ $95–110/mo per `ENG-REVIEW.md` §3b).
