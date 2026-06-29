# Lynia — CEO / Product Review Log

> **Living log of the product/strategy ("CEO") reviews** across the gstack sprint, oldest stage first:
> **Plan** (pre-build concept pressure-test) → **Build checkpoint** → **Ship** (post-launch triage).
> Each pass is a gstack `/plan-ceo-review`-style run — strategy, economics, and investor/demo readiness.
>
> This is decision history and rationale. **It is not the status board** — for where the build actually
> stands (the T0–T13 scorecard, the live deployment, the remaining gates) see **`docs/PILOT-READINESS.md`**,
> which is the single source of truth for status. Companions: `docs/ENG-REVIEW.md` (engineering),
> `docs/DESIGN-REVIEW.md` (design), `docs/CONCEPT.md` (the product north star this log pressure-tests).

| # | Stage | Date | Posture | Verdict (one line) |
|---|-------|------|---------|--------------------|
| 1 | **Plan** — concept pressure-test | 2026-06 (pre-build) | HOLD SCOPE | Scope held; own NestJS backend on a portable cloud. No unresolved decisions. |
| 2 | **Build checkpoint** | 2026-06-26 | Mid-build audit | Foundations solid; **core loop incomplete**; mobile not next. *(Findings since closed — see PILOT-READINESS.)* |
| 3 | **Ship** — post-launch follow-ups | 2026-06-29 | Three-lens triage | Only the live-API cutover cleared all gates; the rest founder/vendor-gated or deferred. |

---

## 1. Plan stage — concept pressure-test (pre-build)

> Output of the gstack `/plan-ceo-review` stage, pressure-testing `docs/CONCEPT.md` before any code.
> Posture: **HOLD SCOPE** — accept the locked scope, make it bulletproof. Status: review complete.

### Context

Office Hours locked the concept in `docs/CONCEPT.md`: Lynia, a Zimbabwean on-demand motorbike courier on
an inDrive-style customer-priced "offer loop", shipping to one Harare corridor. Two architecture decisions
changed during this review:

1. **Drop the managed BaaS.** Replace Supabase with an **own NestJS/TypeScript backend on plain
   PostgreSQL** — full control, data sovereignty, no vendor lock-in.
2. **Host on Azure** via **Microsoft for Startups Founders Hub** (up to $150k credits, Zimbabwe-eligible,
   Johannesburg region closest to Harare). *(Superseded at Ship: the cloud is now Google Cloud — see §10 of
   CONCEPT and the Ship-stage engineering review. The portability work below is exactly what made that a
   config switch rather than a rewrite.)*

### Decisions locked in this review

| # | Decision | Choice | Note |
|---|----------|--------|------|
| Approach | Build the full locked concept | **Yes** | automated KYC, WhatsApp-only OTP, 7-step tracker, two-sided marketplace |
| Mode | Review posture | **HOLD SCOPE** | maximum rigor, no scope change |
| Backend | Managed vs own | **Own NestJS API on PostgreSQL** | replaces Supabase; portable, self-owned |
| Cloud | Provider | **Azure (Founders Hub)** primary | $150k credits, ZW-eligible, Joburg region *(later → GCP)* |
| D3 | Timeline | **Keep 1 month, accept slip risk** | founder's call; review reads it as ~3 months realistically |
| D4 | Cold-start | **Rely on inDrive liquidity model** (supply-only) | founder's call; first-week rider-retention risk tracked |
| D5 | Offer selection | **Customer always selects** (no instant-match auto-assign) | preserves locked rule |
| D6 | Trust holes | **Rating auto-close + no-show penalty = P1 build tasks** | |
| D7 | Cloud strategy | **Primary cloud + documented fallback; portability is a hard constraint** | switchable in days, not a rewrite |

### Revised architecture (own backend, portable cloud)

```
        ┌──────── Expo app (role toggle) ────────┐
        │ Customer · Rider · Tracking window (§5c)│
        └──────┬───────────────┬──────────────────┘
               │ HTTPS/REST     │ WebSocket
        ┌──────▼────────────────▼──────────────────────────┐
        │  Container host  (NestJS API + WS gateway)         │  ◀ scale-to-low, HTTPS ingress
        │  Auth(JWT+OTP)·Orders·Offers·Matching·Jobs(BullMQ) │
        └───┬─────────────┬─────────────┬──────────┬────────┘
            │             │             │          │
       Postgres        Redis         Object      Secret
       (+PostGIS)      (jobs+WS)     storage     store
            │
  external: Google Maps · KYC vendor · WhatsApp BSP · FCM/APNs · SMS gateway
  OpenTelemetry → cloud monitor · GitHub Actions (CI/CD)
```

> Portability note: push uses **FCM directly** (not a cloud-specific hub) and observability uses
> **OpenTelemetry** (not a vendor SDK), so monitoring/push are not cloud-locked. This is what made D7 real.

**Supabase → own-stack mapping** (the "full control" trade the review locked):

| Supabase feature | Own-stack replacement |
|---|---|
| Postgres DB | own schema (PostgreSQL + PostGIS) |
| Auth (GoTrue) | own JWT + WhatsApp OTP (NestJS auth + a secret store) |
| Realtime | own WS gateway + Redis pub/sub |
| Storage | object storage behind a storage adapter |
| Edge Functions / cron | API + BullMQ jobs |
| Auto REST + RLS | explicit REST API + JWT authorization in middleware |

Decision: a **managed container host, not Kubernetes** — k8s ops are overkill for a pilot.

### Cloud strategy — primary + portable fallback (D7)

The own-backend choice already makes the stack portable; this review made it explicit so a cloud failure
(billing/eligibility from Zimbabwe, credits not landing, a region issue) is a **switch, not a rewrite**.
The few cloud-only pieces are pushed out to portable equivalents: **FCM direct**, **OpenTelemetry**,
storage/secrets/push behind thin app-level adapters, one Docker image, and standard PostgreSQL + PostGIS +
Redis on the critical path (no proprietary extensions).

**Switch trigger (decision gate at T0):** if the primary cloud's eligibility/billing from Zimbabwe fails or
credits don't land, switch. The decision is made at the spike, before any build commits to one cloud. *(At
Ship this gate fired toward Google Cloud — the Azure adapter is kept green in CI as the live portability
proof. Detail in the Ship-stage engineering review.)*

**Carried into the engineering review:** treat portability as an architecture constraint (cloud adapters,
single Docker image, standard Postgres/PostGIS/Redis) and wire the portability exit-test (T13) as a CI
check — see `docs/ENG-REVIEW.md` (ET8/ET9).

### Review findings (HOLD SCOPE — 11 sections)

- **S1 Architecture** — the own backend cleanly resolves two prior gaps: offer-expiry is now owned by a
  server-side job (BullMQ on Redis), and authorization moves to explicit API middleware. **WARNING:**
  WhatsApp-only OTP is a custom auth subsystem, not a config toggle.
- **S2 Error & rescue** — **CRITICAL GAPs:** every external call (KYC, OTP, Maps, GPS, delivery OTP) is a
  silent-failure candidate. See the registry below.
- **S3 Security** — **WARNING:** API-layer authorization (replaces Supabase RLS) must scope every endpoint
  by JWT claims (IDOR risk on orders/offers/live location). PII (national ID + selfies + GPS) needs
  encryption + retention. Phone reveal (§5d) = disintermediation vector (accepted pilot trade, D6).
- **S4 Data flow / offer loop** — **CRITICAL:** assignment must be one atomic guarded transition (double-tap
  / select-at-expiry → two assigns); offer-liveness check at selection (ghost/offline rider); rating-to-close
  deadlock (fixed via D6 auto-close).
- **S5 Code quality** — N/A (no code). Build rule: one WS channel, generic `orders`/line-items (§5b seams).
- **S6 Tests** — **GAP:** the "2am Friday" test is the offer-loop concurrency test (two selects → one assign).
- **S7 Performance** — OK for pilot. Index `offers(order_id,status)`, `orders(status)`; PostGIS for
  nearby-rider. Denormalized rating/trips already avoid an N+1 in the offer list.
- **S8 Observability** — **GAP:** the §8 success metrics (offers/broadcast, time-to-first-offer, %broadcasts
  with ≥1 offer, selection time, expiry rate) must be instrumented.
- **S9 Deployment** — staging/prod split, authorization tested before real PII, feature-flag KYC + OTP so a
  vendor failure doesn't block the app. Submit a Play Store skeleton early.
- **S10 Trajectory** — §5b seams genuinely set up the superapp spine. Reversibility 4/5. Debt risk: a custom
  WhatsApp-OTP auth layer maintained forever.
- **S11 Design/UX** — **WARNING:** heavy UI scope; empty states (no offers / no riders online) are the most
  important screens and aren't designed. **Recommend a design review before build** (done — see
  `docs/DESIGN-REVIEW.md`).

**Outside voice (independent reviewer):** converged on the premise — "the plan optimizes for a trustworthy
at-scale marketplace while running a demand-validation pilot." Its ~3-month timeline read is recorded against
D3 per the founder's decision to hold the one-month target.

### Error & Rescue Registry

| Codepath | Failure mode | Rescue action (target) | User sees |
|---|---|---|---|
| WhatsApp OTP send | BSP timeout / template rejected / no WhatsApp | retry, then surface "code couldn't be sent" + retry/alt path | clear error, not a hang |
| KYC verify | vendor down / ZIM ID unsupported / false reject | queue + manual-review backstop | "verification pending" |
| Offer select | double-tap / select-at-expiry / offline rider | atomic guarded transition + liveness check | "rider no longer available, pick another" |
| GPS stream | rider offline / permission revoked | last-known + "location paused" badge | stale-but-labelled map |
| Delivery OTP | receiver absent / repeated wrong code | lock after N tries + support path | "handover not verified" |
| Maps API | quota / timeout | cached distance + retry; degrade suggested price | "price estimate unavailable, set manually" |

### State machine (offer loop, with the fixes)

```
requested ─▶ open_for_offers ─┬─(customer selects, ATOMIC guarded UPDATE)─▶ assigned ─▶ confirmed
                              │     ▲ liveness-check the offer before commit (T1)
                              └─(window lapses, server job)─▶ expired ─▶ (prompt re-broadcast)   (T2)
 ... ─▶ en_route_pickup ─▶ picked_up ─▶ en_route_dropoff ─▶ delivered(OTP) ─▶ completed
                                                                              ▲ auto-close timeout if
                                                                                customer never rates (T3)
```

### NOT in scope (deferred, with rationale)

- In-app payments / fare settlement / commission — revenue model decided since (§6 CONCEPT: rider
  commission, 0% for ~6–8 months, infra later); the pilot moves no money.
- Instant-match auto-assign — D5 kept "customer always selects."
- COD merchant verticals, multi-city, scheduled delivery, in-app chat — fast-follows (§5b seams reserve them).
- Kubernetes — a managed container host is sufficient for the pilot.
- SMS fallback for the signup OTP — WhatsApp-only stands; revisit if corridor reach is poor.

### Implementation tasks defined here (T0–T13)

These P1/P2 build tasks were defined at this stage and engineered against the eng review (`docs/ENG-REVIEW.md`
maps each to ET1–ET10). **Their live status lives in the T0–T13 scorecard in `docs/PILOT-READINESS.md`** —
not repeated here, to keep one source of truth.

| ID | P | Task |
|----|---|------|
| T0 | P1 | Vendor + billing spikes: real ZIM-ID KYC sandbox, WhatsApp BSP onboarding, cloud billing/eligibility from Zimbabwe (D7) |
| T1 | P1 | Atomic offer-selection transition (guarded UPDATE / `SELECT FOR UPDATE`) + offer-liveness check |
| T2 | P1 | Server-side offer-expiry job (BullMQ on Redis) |
| T3 | P1 | Order auto-close timeout (rating deadlock, D6a) |
| T4 | P1 | Cancellation/no-show reputation + cooldown penalty (D6b) |
| T5 | P1 | API authorization layer (JWT-claim scoping, replaces RLS) |
| T6 | P1 | Custom WhatsApp OTP auth (mint → BSP → verify → JWT) |
| T7 | P1 | KYC integration with failure + manual-review backstop |
| T8 | P1 | Error/rescue handling for all 6 external calls |
| T9 | P2 | Metrics instrumenting offer-loop + KYC/OTP funnel |
| T10 | P2 | PostGIS nearby-rider query + indexes |
| T11 | P2 | GPS-drop / permission-revoked handling on tracking |
| T12 | P1 | Empty-state UX (no offers / no riders online) |
| T13 | P1 | Cloud portability adapters + GCP exit-test (D7) |

**Verdict:** CEO review complete under HOLD SCOPE. Scope held; backend is an own NestJS API on a portable
cloud (D7). No unresolved decisions. → handed to `/plan-eng-review`.

---

## 2. Build checkpoint (2026-06-26)

> A gstack `/plan-ceo-review` run re-aimed at **work already built** rather than a plan. Three lenses:
> path-to-demo, strategy/economics, investor readiness. Branch: `claude/ceo-review-prep-975vdb`.
>
> ⚠️ **Findings since closed.** This snapshot predates the delivery-lifecycle completion, both mobile sides,
> and the design/history/profile/earnings work. Its two blocking findings — "core loop can't complete a
> delivery" and "mobile not recommended next" — are **now resolved** (see `docs/PILOT-READINESS.md`). Kept
> here for the strategic reasoning, which still reads true.

### Verdict at the time

The backend foundations were real and well-tested, but the build was **not yet ready to demo, pilot, or
raise on, and should not move to the mobile app next.** Two things gated that:

1. **A functional hole in the core loop.** The offer loop worked up to `assigned`, then stopped — no code to
   advance pickup → delivery-OTP handover → completion, no rating, no no-show/cancellation. A customer could
   post, riders bid, the customer pick — and then nothing. **No single delivery could complete end to end.**
2. **Two unresolved gating decisions** the build had run ahead of: the **revenue model** (then undecided) and
   the **T0 vendor/billing spikes** (cloud eligibility, WhatsApp BSP, real-ID KYC), none cleared.

Recommended next step: **close the delivery-lifecycle hole** (cloud-agnostic, testable), settle the revenue
model, then decide demo-vs-pilot. Mobile after, not before.

### Lens 1 — path to demo

The eng-plan scorecard at this checkpoint had T1/T2/T5/T7/T10 done-and-proven, T3/T4/T11/T12 not built, and
T0/T6/T8/T9/T13 partial. *(The live scorecard is in `docs/PILOT-READINESS.md`; every ❌ from this checkpoint
is now ✅.)* The **delivery lifecycle was unbuilt** past `assigned`: no status progression, no delivery-OTP
handover (`otp_hash` column existed, nothing wrote it), no rating, no cancellation/no-show. That is the half
of the core loop that makes a delivery a *delivery*. The cheapest path to a watchable demo was judged to be
**finish the lifecycle on the backend, then put the thinnest UI on it** (extend the Next.js admin, driven by
seed data) — native mobile being the wrong tool for a checkpoint demo.

### Lens 2 — strategy & economics

Pricing was real (`$1.50 base + $0.60/km`, floored at `$1.50` — sane pilot numbers), but **nothing flowed to
Lynia**: the pilot takes no commission and settles no payment, so revenue was **$0 by design** and the
**revenue model was the single biggest unresolved decision**. The engineering had run ahead of the business:
the concurrency-correct offer loop, PostGIS matching, KYC seam, and portability adapters are the hard,
defensible parts and were done well — but two cheap non-engineering gates (the revenue decision and the T0
spikes) remained open, and the core product loop was half-built.

### Lens 3 — investor / board readiness

**Credible:** a serious engineering signal — a correctly-concurrent marketplace core proven under a real "two
customers select at once" test in CI, PostGIS geomatching, a real KYC integration, cloud portability, 72
passing tests. **Not there:** anything a non-technical audience can see, traction, a completable user journey,
or a revenue thesis. Path to a credible raise: finish the loop, put a thin watchable UI on it, run the T0
spikes, decide the revenue model — none of it mobile-app work.

### Promoted from "deferred" to "decide now"

The **revenue model** and the **delivery-lifecycle completion**. *(Both since resolved: lifecycle shipped;
revenue decided — rider commission, 0% for ~6–8 months, CONCEPT §6.)*

**Verdict:** Foundations CLEARED as solid; **core loop INCOMPLETE**; mobile **not recommended next**. Close
the lifecycle, decide revenue, run T0, then pick the surface. → all three actioned; see PILOT-READINESS.

---

## 3. Ship stage — post-launch follow-ups (CEO / product lens, 2026-06-29)

> The product/economics lens of the three-lens ship-stage triage (the engineering and design lenses live in
> `docs/ENG-REVIEW.md` §Ship and `docs/DESIGN-REVIEW.md` §Ship). Posture: triage the post-launch follow-up
> tasks before execution. The API is live on GCP at `https://lyniago.lyniafinance.com`.

| Task | CEO / product verdict | Decision |
|------|-----------------------|----------|
| **A. Point mobile app at the live HTTPS API** | **DO-NOW** — highest leverage; turns a code-only product into a thing a real device hits | **✅ EXECUTED** |
| B. Production OTP via WhatsApp BSP | BLOCKED-EXTERNAL — gates real signups; long vendor lead time | Blocked — founder (BSP onboarding) |
| C. FCM push (live send) | DEFER — no app push dependency yet | Blocked — founder (Firebase project) |
| D. OTEL traces → collector | DEFER — cost vs pilot volume; not worth it yet | Defer — endpoint decision |
| E. Real Didit ZIM-ID KYC run | BLOCKED-EXTERNAL — gates rider supply (false-reject rate unmeasured) | Blocked — founder (Didit account) |
| F1–F4. Infra hardening (drop public IP, Redis HA, SQL REGIONAL, tighten CORS) | DEFER — F2/F3 would **contradict the documented lean-pilot decision** (BASIC Redis / ZONAL SQL until pre-launch) | Defer — pre-launch |

**Product read:** only **Task A** cleared all three lenses — the single highest-leverage move (cut the app
over to the live API, executed). Everything else is either an **external unlock** the founder must start now
because of lead time (WhatsApp BSP, a real Didit run — these gate demand and supply respectively) or a
**deliberate deferral** consistent with the lean-pilot economics. The economics story now exists (revenue
model decided, §6); the pilot's job remains proving **demand/liquidity**, not willingness-to-pay-commission.

**Founder actions to start now (long lead time):** WhatsApp BSP onboarding (gates signups), a real-ID Didit
run (measures the false-reject rate gating rider onboarding), a Firebase project (unlocks FCM) — each an
account/key/org decision, not code. Status tracked in `docs/PILOT-READINESS.md`.

**Verdict:** Ship-stage product triage complete. The live-API cutover is the win; the rest is correctly
sequenced behind founder/vendor unlocks or the lean-pilot decision. **Current status → `docs/PILOT-READINESS.md`.**
