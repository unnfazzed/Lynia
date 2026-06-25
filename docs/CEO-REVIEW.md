# Lynia — CEO Review (Plan stage)

> Output of the gstack `/plan-ceo-review` stage, pressure-testing `docs/CONCEPT.md`
> before build. Posture: **HOLD SCOPE** — accept the locked scope, make it bulletproof.
> Status: **review complete, ready for `/plan-eng-review`.**

## Context

Office Hours locked the concept in `docs/CONCEPT.md`: Lynia, a Zimbabwean on-demand
motorbike courier on an inDrive-style customer-priced "offer loop", shipping to one
Harare corridor. Two architecture decisions changed during this review:

1. **Drop the managed BaaS.** Replace Supabase with an **own NestJS/TypeScript backend on
   plain PostgreSQL** — full control, data sovereignty, no vendor lock-in.
2. **Host on Azure** via **Microsoft for Startups Founders Hub** (up to $150k credits, open
   to bootstrapped startups, Zimbabwe-eligible, Johannesburg region closest to Harare).

## Decisions locked in this review

| # | Decision | Choice | Note |
|---|----------|--------|------|
| Approach | Build the full locked concept | **Yes** | automated KYC, WhatsApp-only OTP, 7-step tracker, two-sided marketplace |
| Mode | Review posture | **HOLD SCOPE** | maximum rigor, no scope change |
| Backend | Managed vs own | **Own NestJS API on PostgreSQL** | replaces Supabase; portable, self-owned |
| Cloud | Provider | **Azure (Founders Hub)** | $150k credits, ZW-eligible, Joburg region |
| D3 | Timeline | **Keep 1 month, accept slip risk** | founder's call; review reads it as ~3 months realistically |
| D4 | Cold-start | **Rely on inDrive liquidity model** (supply-only) | founder's call; residual first-week rider-retention risk tracked |
| D5 | Offer selection | **Customer always selects** (no instant-match auto-assign) | preserves locked rule |
| D6 | Trust holes | **Rating auto-close + no-show penalty = P1 build tasks** | |

## Revised architecture (own backend on Azure)

```
        ┌──────── Expo app (role toggle) ────────┐
        │ Customer · Rider · Tracking window (§5c)│
        └──────┬───────────────┬──────────────────┘
               │ HTTPS/REST     │ WebSocket
        ┌──────▼────────────────▼──────────────────────────┐
        │  Azure Container Apps  (NestJS API + WS gateway)   │  ◀ scale-to-low, HTTPS ingress
        │  Auth(JWT+OTP)·Orders·Offers·Matching·Jobs(BullMQ) │
        └───┬─────────────┬─────────────┬──────────┬────────┘
            │             │             │          │
  Azure DB for       Azure Cache    Azure Blob   Azure Key
  PostgreSQL         for Redis      Storage      Vault
  (+PostGIS)         (jobs+WS pub)  (photos)     (secrets)
            │
  external: Google Maps · KYC vendor · WhatsApp BSP
  Azure Notification Hubs → FCM/APNs · SMS gateway
  Application Insights (logs/metrics/traces) · GitHub Actions (CI/CD)
  Next.js admin → Azure Static Web Apps
```

**Supabase → Azure / own-stack mapping**

| Supabase feature | Own-stack replacement | Azure service |
|---|---|---|
| Postgres DB | own schema | Azure Database for PostgreSQL Flexible Server (+PostGIS) |
| Auth (GoTrue) | own JWT + WhatsApp OTP | NestJS auth + Azure Key Vault |
| Realtime | own WS gateway + Redis pub/sub | Container Apps (websockets) + Azure Cache for Redis |
| Storage | blob | Azure Blob Storage |
| Edge Functions / cron | API + BullMQ jobs | Container Apps + Container Apps Jobs |
| Auto REST + RLS | explicit REST API + JWT authorization in middleware | (built in app — the "full control" part) |

Decision: **Container Apps, not AKS** — Kubernetes ops are overkill for a pilot.

## Review findings (HOLD SCOPE — 11 sections)

- **S1 Architecture** — the own backend cleanly resolves two prior gaps: offer-expiry is now owned
  by a server-side job (BullMQ on Redis), and authorization moves to explicit API middleware.
  **WARNING:** WhatsApp-only OTP is a custom auth subsystem, not a config toggle. SPOF: single Azure
  project for the pilot (acceptable).
- **S2 Error & rescue** — **CRITICAL GAPs:** every external call (KYC, OTP, Maps, GPS, delivery OTP)
  is currently a silent-failure candidate. See registry.
- **S3 Security** — **WARNING:** API-layer authorization (replaces Supabase RLS) must scope every
  endpoint by JWT claims (IDOR risk on orders/offers/live location). PII (national ID + selfies + GPS)
  needs encryption + retention. Phone reveal (§5d) = disintermediation vector (accepted pilot trade, D6).
- **S4 Data flow / offer loop** — **CRITICAL:** assignment must be one atomic guarded transition
  (double-tap / select-at-expiry → two assigns); offer-liveness check at selection (ghost/offline rider);
  rating-to-close deadlock (fixed via D6 auto-close).
- **S5 Code quality** — N/A (no code). Build rule: one WS channel, generic `orders`/line-items (§5b seams).
- **S6 Tests** — **GAP:** the "2am Friday" test is the offer-loop concurrency test (two selects → one assign).
- **S7 Performance** — OK for pilot. Index `offers(order_id,status)`, `orders(status)`; PostGIS for
  nearby-rider. Denormalized rating/trips already avoid an N+1 in the offer list.
- **S8 Observability** — **GAP:** the §8 success metrics (offers/broadcast, time-to-first-offer,
  %broadcasts with ≥1 offer, selection time, expiry rate) must be instrumented in Application Insights.
- **S9 Deployment** — staging/prod split, authorization tested before real PII, feature-flag KYC + OTP
  so a vendor failure doesn't block the app. Submit a Play Store skeleton early.
- **S10 Trajectory** — §5b seams genuinely set up the superapp spine. Reversibility 4/5. Debt risk: a
  custom WhatsApp-OTP auth layer maintained forever.
- **S11 Design/UX** — **WARNING:** heavy UI scope; empty states (no offers / no riders online) are the
  most important screens and aren't designed. **Recommend `/plan-design-review` before build.**

**Outside voice (independent reviewer):** converged on the premise — "the plan optimizes for a
trustworthy at-scale marketplace while running a demand-validation pilot." Its ~3-month timeline read is
recorded against D3 per the founder's decision to hold the one-month target.

## Error & Rescue Registry

| Codepath | Failure mode | Rescue action (target) | User sees |
|---|---|---|---|
| WhatsApp OTP send | BSP timeout / template rejected / no WhatsApp | retry, then surface "code couldn't be sent" + retry/alt path | clear error, not a hang |
| KYC verify | vendor down / ZIM ID unsupported / false reject | queue + manual-review backstop | "verification pending" |
| Offer select | double-tap / select-at-expiry / offline rider | atomic guarded transition + liveness check | "rider no longer available, pick another" |
| GPS stream | rider offline / permission revoked | last-known + "location paused" badge | stale-but-labelled map |
| Delivery OTP | receiver absent / repeated wrong code | lock after N tries + support path | "handover not verified" |
| Maps API | quota / timeout | cached distance + retry; degrade suggested price | "price estimate unavailable, set manually" |

## State machine (offer loop, with the fixes)

```
requested ─▶ open_for_offers ─┬─(customer selects, ATOMIC guarded UPDATE)─▶ assigned ─▶ confirmed
                              │     ▲ liveness-check the offer before commit (T1)
                              └─(window lapses, server job)─▶ expired ─▶ (prompt re-broadcast)   (T2)
 ... ─▶ en_route_pickup ─▶ picked_up ─▶ en_route_dropoff ─▶ delivered(OTP) ─▶ completed
                                                                              ▲ auto-close timeout if
                                                                                customer never rates (T3)
```

## NOT in scope (deferred, with rationale)

- In-app payments / fare settlement / commission — revenue model undecided (§6), pilot moves no money.
- Instant-match auto-assign — D5 kept "customer always selects."
- COD merchant verticals, multi-city, scheduled delivery, in-app chat — fast-follows (§5b seams reserve them).
- AKS / Kubernetes — Container Apps is sufficient for the pilot.
- SMS fallback for the signup OTP — WhatsApp-only stands; revisit if corridor reach is poor.

## Implementation Tasks

| ID | P | Task | Verify |
|----|---|------|--------|
| T0 | P1 (pre-build spike) | Vendor + billing spikes: real ZIM ID through each KYC sandbox, start WhatsApp BSP onboarding, verify Azure Founders Hub billing from Zimbabwe | one ID verified, one test OTP delivered, Azure credits active |
| T1 | P1 | Atomic offer-selection transition (guarded UPDATE / SELECT FOR UPDATE) + offer-liveness check | concurrent double-select assigns exactly one rider |
| T2 | P1 | Server-side offer-expiry job (BullMQ on Redis) | window lapses → `expired` with no client open |
| T3 | P1 | Order auto-close timeout (rating deadlock, D6a) | unrated order auto-closes; completion metric stays clean |
| T4 | P1 | Cancellation/no-show reputation + cooldown penalty (D6b) | repeated no-shows trigger cooldown |
| T5 | P1 | API authorization layer (JWT-claim scoping, replaces RLS) | user A cannot read user B's order/offer/GPS (403) |
| T6 | P1 | Custom WhatsApp OTP auth (mint → BSP → verify → JWT) | signup completes via WhatsApp code only |
| T7 | P1 | KYC integration with failure + manual-review backstop | failed/unsupported ID routes to backstop; rider gated until verified |
| T8 | P1 | Error/rescue handling for all 6 external calls | each failure path shows a user message + structured log |
| T9 | P2 | Application Insights instrumenting offer-loop + KYC/OTP metrics | dashboard shows time-to-first-offer live |
| T10 | P2 | PostGIS nearby-rider query + indexes | broadcast reaches riders within radius; query uses index |
| T11 | P2 | GPS-drop / permission-revoked handling on tracking | revoking location shows "paused", not a frozen map |
| T12 | P2 | Empty-state UX (no offers / no riders online) | both states render a designed screen; run `/plan-design-review` |

## TODOs (next phase)

- Revenue & settlement model (gateway vs own rails vs cash) + unit economics — the deferred §6 decision.
- Reconsider SMS fallback for signup OTP if WhatsApp reach is poor in the corridor.
- COD merchant verticals (pharmacy → grocery → food) on the reserved `merchant` order type.

## Next steps (gstack flow)

- ✅ **Plan → CEO review** (this doc).
- ⬜ **Plan → `/plan-eng-review`** — required shipping gate: lock backend specifics (NestJS vs Go,
  Container Apps config, Postgres/Redis sizing, CI/CD).
- ⬜ **Plan → `/plan-design-review`** — offer list, tracker, and empty-state screens.
- ⬜ **Build** — scaffold the Expo app + own NestJS/Azure backend + admin dashboard.

**Verdict:** CEO review complete under HOLD SCOPE. Scope held; backend changed to an own NestJS API on
Azure (Founders Hub). No unresolved decisions.
