# Lynia — CEO Review (Build checkpoint)

> ⚠️ **Superseded (2026-06-27) by `docs/PILOT-READINESS.md`.** This snapshot predates the delivery-lifecycle
> completion, both mobile app sides, and the design/history/profile/earnings work — its blocking findings
> ("core loop can't complete a delivery", "mobile not recommended next") are now closed. Kept for history.

> A gstack `/plan-ceo-review` run, re-aimed at **work already built** rather than a plan. Three
> lenses: path-to-demo, strategy/economics, investor readiness. Pairs with the plan-stage
> `docs/CEO-REVIEW.md` (which reviewed the concept) and `docs/ENG-REVIEW.md`.
> Date: 2026-06-26. Branch: `claude/ceo-review-prep-975vdb`.

## Verdict (read this first)

The backend foundations are real and well-tested, but **the build is not yet ready to demo, pilot,
or raise on, and it should not move to the mobile app next.** Two things gate that:

1. **A functional hole in the core loop.** The offer loop works up to `assigned`, then stops. There is
   no code to advance a trip through pickup → delivery-OTP handover → completion, no rating, no
   no-show/cancellation. A customer can post, riders can bid, the customer can pick a rider, and then
   nothing happens. **You cannot complete a single delivery end to end.** (Detail in Lens 1.)
2. **Two unresolved gating decisions** the build has run ahead of: the **revenue model** (deferred §6,
   still undecided) and the **T0 vendor/billing spikes** (Azure eligibility, WhatsApp BSP, real-ID KYC),
   none of which have cleared.

Recommended next step is **close the delivery-lifecycle hole** (the missing half of the core loop, fully
cloud-agnostic and testable), settle the revenue model, then decide demo-vs-pilot. Mobile comes after,
not before. Reasoning throughout.

---

## Lens 1 — Path to demo / build-vs-plan

### The eng-plan scorecard (T0–T13 from `docs/CEO-REVIEW.md`)

| ID | Task | State | Note |
|----|------|-------|------|
| T0 | Vendor + billing spikes (Azure/GCP, WhatsApp BSP, real ZIM-ID KYC) | ⏳ **pending** | Azure blocked; KYC vendor chosen (Didit) but no real ID run; WhatsApp deferred |
| T1 | Atomic offer-selection (guarded CAS + liveness) | ✅ **done, proven** | concurrency test green in CI (ET1) |
| T2 | Server-side offer-expiry job (BullMQ) | ✅ done | |
| T3 | Order auto-close on rating deadlock | ❌ **not built** | no rating flow exists |
| T4 | No-show / cancellation reputation + cooldown | ❌ **not built** | no cancellation path exists |
| T5 | API authorization (JWT-claim scoping) | ✅ done | access predicates unit-tested |
| T6 | OTP auth (mint → send → verify → JWT) | ◐ **partial** | works on console/dev channel; **WhatsApp/SMS senders are stubs** |
| T7 | KYC + manual-review backstop | ✅ done | Didit webhook (HMAC) + admin override |
| T8 | Error/rescue for the 6 external calls | ◐ partial | KYC/OTP covered; Maps/GPS not wired |
| T9 | Metrics instrumentation | ◐ partial | admin funnel view exists; **OpenTelemetry not wired** |
| T10 | PostGIS nearby-rider + indexes | ✅ **done, proven** | integration-tested in CI |
| T11 | GPS-drop / permission-revoked handling | ❌ not built | tracking gateway streams; no degradation path |
| T12 | Empty-state UX (no offers / no riders) | ❌ not built | no UI at all |
| T13 | Cloud portability adapters + exit-test | ◐ partial | storage/secrets adapters exist; GCP exit-test not run |

Plus this session's additions (not in the original plan): Didit KYC, dev/console OTP, local-run
docker-compose + seed, a distance-based pricing engine, a 21→72 unit-test jump, and geo integration tests.

### The hole: the delivery lifecycle is unbuilt

`OrderStatus` defines the full 11-state lifecycle (CONCEPT §5), but only the first transition is
implemented:

```
requested ─▶ open_for_offers ─▶ assigned ─▶ ??? (nothing past here)
   confirmed ─ en_route_pickup ─ picked_up ─ en_route_dropoff ─ delivered ─ completed
   └──────────────── no service advances any of these ───────────────────┘
```

What is missing on the backend:
- Status progression past `assigned` (rider confirms, marks pickup, en route, delivered).
- **Delivery-OTP handover** (the `otp_hash` column exists; nothing writes or verifies it).
- **Rating** after completion (the `Rating` model and `ratingAvg` exist; no service writes them) → T3.
- **Cancellation / no-show** by either side, with the cooldown penalty → T4.

This is the half of the core loop that makes a delivery a *delivery*. Without it there is no completable
trip to put in front of a customer, a rider, a pilot user, or an investor.

### Demo readiness

Nothing is demoable to a non-technical person today. The mobile app is a static shell; the admin is a
read-only metrics page. Even with a UI bolted on, the demo would dead-end at "rider assigned" because of
the hole above. **The cheapest path to "watch a delivery happen end to end" is to finish the lifecycle
on the backend first, then put the thinnest possible UI on it.** For that thin UI, an interactive web
view (extend the existing Next.js admin, driven by the seed data) is far faster to a watchable demo than
the native Expo app, and needs no devices or app-store friction. Native mobile is required for a *real*
pilot on the street, but it is the wrong tool for a checkpoint demo.

---

## Lens 2 — Strategy & economics

### Pricing is real; monetization is absent (and undecided)

The new pricing engine gives a fair fare anchor: `$1.50 base + $0.60/km`, floored at `$1.50`. A 3 km
Harare-corridor hop quotes ~`$3.30`; a 5 km hop ~`$4.50`. Sane pilot numbers.

But note what that money does: **nothing flows to Lynia.** The pilot takes no commission and settles no
payment (deferred §6, "pilot moves no money"). Fares are rider-direct cash. So in the pilot, **Lynia's
revenue is $0 by design** and the unit economics of the *business* are undefined because the **revenue
model is still the single biggest unresolved decision** (commission % vs subscription vs flat-fee vs
cash-float, and the settlement rails behind it). That was flagged as a TODO at plan stage and has not
been touched. It is a decision, not a build, and it should be made before more product gets built on top
of a model that does not exist yet.

### Cold-start and supply

The plan bet on inDrive's supply-only liquidity model (D4) with residual first-week rider-retention risk.
Nothing built changes that bet; the seed data fakes 5 online riders, which is fine for a demo but is not
evidence of real supply. The KYC false-reject rate on real Zimbabwean IDs (the thing that gates rider
onboarding) is still unmeasured because the Didit sandbox has not been run against a real ID (part of T0).

### Strategic read

The engineering has run ahead of the business. The concurrency-correct offer loop, PostGIS matching, KYC
seam, and portability adapters are the *hard, defensible* parts and they are done well. But two cheap,
non-engineering gates (the revenue decision and the T0 vendor/billing spikes) remain open, and the core
product loop is half-built. Building mobile now would add a large, hard-to-verify surface on top of an
incomplete spine and two undecided premises.

---

## Lens 3 — Investor / board readiness

**What is credible today:** a serious engineering signal. A correctly-concurrent marketplace core,
proven under a real "two customers select at once" test in CI; PostGIS geomatching; a real KYC
integration that works for Zimbabwean IDs; cloud-portability so an Azure failure is a config switch, not
a rewrite; 72 passing tests. For a technical diligence call, this reads as a team that builds the hard
things properly.

**What is not there:** anything a non-technical audience can see, any traction, a completable user
journey, and a revenue thesis. The fundable narrative for a marketplace is "here is a transaction
happening, here is why supply shows up, here is how we make money." Today we have the rails for the
transaction but not a completed one, no live supply, and no monetization.

**Path to a credible raise/demo:** finish the loop (so a real delivery completes), put a thin watchable
UI on it, run the T0 spikes (so "it works for real ZIM IDs / we can onboard riders" is evidenced), and
decide the revenue model (so the "how we make money" slide exists). None of that is mobile-app work.

---

## Risk register (checkpoint)

| Risk | Severity | State |
|------|----------|-------|
| Core loop can't complete a delivery (no lifecycle past `assigned`) | **High** | open — top finding |
| Revenue model undecided (§6) | **High** | open — decision, not build |
| T0 spikes not run (Azure billing, WhatsApp BSP, real-ID KYC) | **High** | pending/blocked |
| Production OTP delivery unsolved (WhatsApp deferred, console is dev-only) | Med | open |
| KYC false-reject rate on real ZIM IDs unmeasured | Med | open (part of T0) |
| No empty-state / GPS-drop UX (T11/T12) | Med | open |
| OpenTelemetry not wired (T9) — limited prod visibility | Low | open |
| Real rider supply unproven (seed data is fake) | Med | inherent to pre-pilot |

## What already exists (reuse, don't rebuild)

Offer loop + matching (`matching/`, `offers/`), auth + OTP seam (`auth/`), KYC + Didit (`kyc/`,
`riders/`), tracking gateway + PostGIS (`tracking/`), pricing (`@lynia/shared/pricing`), admin funnel
(`admin/`), cloud adapters (`adapters/`), seed + local stack. The lifecycle work extends `orders/` and
`matching/`; it does not start from scratch.

## NOT in scope / deferred

See `docs/BACKLOG.md` for the full deferred list with triggers. The two items this review promotes from
"deferred" to "decide now": the **revenue model** and the **delivery-lifecycle completion**.

## Dream-state delta

12-month ideal: a customer posts, real riders bid, one is picked, the trip runs through a live 7-step
tracker, an OTP handover confirms delivery, both sides rate, and Lynia clips a commission it can see in a
dashboard. Today we have steps 1–3 of that, proven correct, on a portable, tested backend. The gap is
steps 4–7 (the lifecycle), the money (revenue model), and the surface (UI). The foundations are the
expensive part and they are sound; the remaining work is mostly well-understood and cloud-agnostic.

## Recommendation (ordered)

1. **Close the delivery-lifecycle hole** (status progression + delivery-OTP handover + rating T3 +
   cancellation/no-show T4). This is the missing half of the core loop, fully testable in CI, no Azure.
   *Highest value: it makes a complete trip possible, which everything else (demo, pilot, raise) needs.*
2. **Decide the revenue model** (§6). A decision, not a build. Unblocks the economics story.
3. **Run the T0 spikes** as Azure/GCP access allows (real ZIM-ID through Didit, WhatsApp BSP start,
   billing eligibility). Evidences onboarding and unblocks production OTP.
4. **Then choose the surface:** thin interactive web demo (fast, for review/raise) vs native mobile
   (required for a street pilot). Decide by near-term goal, not by default.

**On mobile specifically:** it is the right *eventual* next big build, but doing it now means building a
large client against a backend that can't finish a trip and a business model that isn't decided. Finish
the spine first.

**Verdict:** Build checkpoint complete (full lens: demo-path + strategy + investor). Foundations CLEARED
as solid; **core loop INCOMPLETE**; mobile **not recommended next**. Close the lifecycle, decide revenue,
run T0, then pick the surface.
