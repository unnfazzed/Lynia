# Lynia — Pilot-Readiness Checkpoint

> Current-state status for a CEO/eng review. **Supersedes the verdict in
> `docs/CEO-REVIEW-CHECKPOINT.md`** (2026-06-26), which predates the build work below — its top findings
> ("core loop can't complete a delivery", "mobile not recommended next") are now **closed**.
> Date: 2026-06-27. Branch: `claude/ceo-review-prep-975vdb`.

## Verdict (read this first)

The product is now **functionally complete and end-to-end demoable in code**: a full delivery runs
phone-to-phone — customer posts → riders bid → customer selects → rider drives the lifecycle → OTP
hand-off → both reach completion → rate. Both app sides are built and the backend lifecycle is whole and
tested. **What remains is no longer buildable-now engineering — it is three external unlocks:** a cloud
(T0/Azure), a device build (Phase 3 / `/qa`), and the revenue decision (§6). Everything that does *not*
depend on those is done.

This flips the prior checkpoint: the two things it gated on — the **delivery-lifecycle hole** and **no
visible surface** — are both resolved. The remaining gates are the same *external* ones it also named
(revenue, T0 spikes), now isolated as the only blockers.

---

## What changed since the 2026-06-26 checkpoint

The prior checkpoint's blocking finding was that the loop stopped at `assigned`. Since then, merged to
`main` (CI-gated throughout):

- **Delivery lifecycle completed** — status progression `assigned → confirmed → en_route_pickup →
  picked_up → en_route_dropoff → delivered → completed`, the **delivery-OTP hand-off** (writes/verifies
  `otp_hash`, 5-attempt lockout, FOR UPDATE row-lock), **rating** (T3), and **cancellation / no-show
  cooldown** (T4). BullMQ auto-close + a DB reconciler close stale trips.
- **Mobile app, both sides** — customer journey (auth → create → offers → §5c tracking → rate) and rider
  role (KYC → online board → bid → drive → OTP) on Expo + the typed contract-driven client.
- **Two first-principles eng reviews** with P0 fixes — auth `x-user-id` spoof holes guarded, a
  concurrent-refresh race fixed, a pre-assignment PII leak sealed, the rider online-invariant enforced.
- **Design consultation + mockups** — `docs/DESIGN.md` extended to the full two-sided journey;
  `docs/design/` all-flows PNG boards.
- **DT12/DT10/DT11 flows** — the §5c 7-step stepper, empty-states, profile, trip **history**, full
  `/auth/me`, the **not-verified rider gate**, and a **payment-agnostic earnings ledger**.
- **Test count** 21 → 72 → **112** API tests; mobile typecheck in the CI gate.

## Updated eng-plan scorecard (T0–T13)

| ID | Task | Was (06-26) | Now (06-27) |
|----|------|-------------|-------------|
| T0 | Vendor + billing spikes (Azure/GCP, WhatsApp BSP, real ZIM-ID KYC) | ⏳ pending | ⏳ **pending — external** |
| T1 | Atomic offer-selection (guarded CAS + liveness) | ✅ proven | ✅ proven |
| T2 | Server-side offer-expiry (BullMQ) | ✅ | ✅ |
| T3 | Order auto-close on rating deadlock | ❌ not built | ✅ **done** (rating + auto-close + reconciler) |
| T4 | No-show / cancellation reputation + cooldown | ❌ not built | ✅ **done** |
| T5 | API authorization (JWT-claim scoping) | ✅ | ✅ **hardened** (spoof holes closed) |
| T6 | OTP auth (mint → send → verify → JWT) | ◐ partial | ◐ partial — **WhatsApp/SMS still stubbed (external)** |
| T7 | KYC + manual-review backstop | ✅ | ✅ |
| T8 | Error/rescue for external calls | ◐ partial | ◐ partial |
| T9 | Metrics instrumentation | ◐ partial | ◐ partial — **OTEL needs a collector (external)** |
| T10 | PostGIS nearby-rider + indexes | ✅ proven | ✅ proven (+ Tier-2 geo int test) |
| T11 | GPS-drop / permission-revoked handling | ❌ not built | ◐ **partial** (stream gating + stale handling; full degradation device-gated) |
| T12 | Empty-state UX (no offers / no riders) | ❌ not built | ✅ **done** (`EmptyState`, gates, expired/no-orders) |
| T13 | Cloud portability adapters + exit-test | ◐ partial | ◐ partial — **GCP exit-test needs cloud (external)** |

Every ❌ from the prior checkpoint is now ✅. Every remaining ◐/⏳ is gated on an external unlock, not on
more code we can write today.

## Decision gates (the only things blocking pilot)

| Gate | Unlocks | Type |
|------|---------|------|
| **Pick a cloud** (Azure eligibility, or GCP) — T0 | `/ship` + release, FCM push, real object storage/signed URLs, OTEL export, production OTP path | Vendor/billing decision |
| **Greenlight a dev build** (not Expo Go) | Phase 3 native map + tap-to-pin, `/qa` device pass, on-device verification of the stepper/earnings/gate | Go-ahead + device |
| **Decide the revenue model** (§6) | The monetization story, profile/settlement UI, the "how we make money" slide | Product/founder decision |

Until a gate opens, the work behind it is correctly parked in `docs/BACKLOG.md` with its trigger.

## Ship / cloud-provisioning checklist (ready the moment a cloud is chosen)

Pre-staged so T0 → ship is execution, not discovery. Each maps to a `BACKLOG.md` item with its seam
already in place:

- [ ] **Cloud chosen + provisioned** (Azure billing/eligibility cleared, or GCP) — the blocking T0 spike.
- [ ] **Object storage adapter** wired to real Blob/GCS + signed URLs (stubs in `apps/api/src/adapters/storage/`).
- [ ] **Secrets** moved to the cloud secret store (adapter seam exists).
- [ ] **FCM push** — `firebase-admin` behind the existing stub; mobile consumes pushes (unblocks the
      notifications center).
- [ ] **Production OTP** — WhatsApp BSP onboarding + SMS gateway behind the `otp-sender.ts` seam (console
      is dev-only today).
- [ ] **HTTPS for device builds** — Android 9+/iOS ATS block cleartext; required for a standalone build.
- [ ] **OpenTelemetry** — NodeSDK + OTLP exporter pointed at the collector endpoint (T9).
- [ ] **Real ZIM-ID KYC run** through Didit (measure the false-reject rate — gates rider onboarding).
- [ ] **GCP exit-test** (T13) — prove the portability claim by standing the stack up on the second cloud.
- [ ] **CI release job** (`/ship`) — the two CI gates are green today; add the deploy/release step.

## Recommended sequence

1. **Decide the revenue model (§6)** — a decision, not a build; unblocks the economics story and any
   settlement UI. Cheapest high-leverage move.
2. **Pick the cloud (T0)** — unblocks ship, push, storage, OTEL, and production OTP in one stroke; run the
   checklist above.
3. **Greenlight a dev build** — then Phase 3 native map + `/qa` on a real device, and finally `/ship`.
4. Mobile profile-edit + notifications fold in once (1)/(2) land (they need a profile-update endpoint and
   the FCM feed respectively).

**Bottom line:** the engineering spine and both app surfaces are built and CI-green; the product can
complete a delivery end to end in code. The path to a real pilot now runs through **decisions and
vendor unlocks**, not through more feature code.
