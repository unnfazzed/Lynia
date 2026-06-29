# Lynia — Design Review Log

> **Living log of the design reviews** across the gstack sprint, oldest stage first: **Plan/Design** (the
> design system + customer-side review) → **Build** (the two-sided design consultation + post-build static
> pass) → **Ship** (the ship-prep visual QA + post-launch design lens). Each pass is a gstack
> `/plan-design-review` / `/design-review`-style run.
>
> This is the **review** record — verdicts, scores, findings, and their resolutions. The **spec it
> calibrates against is `docs/DESIGN.md`** (tokens, components, IA, the §5c stepper, the two-sided journey,
> the `DT1`–`DT13` build-task table). Companions: `docs/CEO-REVIEW.md`
> (product), `docs/ENG-REVIEW.md` (engineering), `docs/CONCEPT.md` (§5c/§5d/§6 the design realises). For
> live build status see `docs/PILOT-READINESS.md`.

| # | Stage | Date | Score / verdict |
|---|-------|------|-----------------|
| 1 | **Plan/Design** — system + customer side | 2026-06 (pre/early build) | System locked; empty-states flagged as the highest-leverage screens. |
| 2 | **Build** — two-sided consultation + post-build pass | 2026-06-27 | Full journey specced (DT8–DT13); error-state-honesty P1 fixed. |
| 3 | **Ship** — ship-prep QA + post-launch lens | 2026-06-29 | onAccent **8/10**, skeletons **5→improved**; cutover UX catch shipped. **Design score 9/10.** |

> **Direction (constant across every pass):** *clean utility + a warm accent* — trust through clarity, tuned
> for a low-trust cash market on cheap Android phones and expensive data. No pass has reinvented the tokens or
> components; each calibrates against the same locked system in `docs/DESIGN.md`.

---

## 1. Plan/Design stage — design system + customer-side review

> Seeded by the gstack `/plan-design-review` stage, after the plan-stage CEO review flagged UI scope as a
> WARNING (S11: "empty states are the most important screens and aren't designed"). Output: the living design
> system (`docs/DESIGN.md`) + the customer-journey review.

### What this pass locked

- **The design system** — tokens (color/type/spacing/radius), the **Manrope** typeface (deliberately not a
  system font), tabular numerals for fares/ETAs/ratings, the 8pt grid, and the component set (Primary CTA,
  Input-with-visible-label, Offer/Rider cards, Status stepper, Map bottom-sheet, Skeleton). All in
  `docs/DESIGN.md` — **the calibration baseline for every later pass.**
- **Four locked design decisions** — D-a clean-utility + warm accent; D-b map-anchored home + scannable LIST
  for offer compare; D-c light/sunlight-contrast/data-light (dark mode deferred); D-d blended best-match
  default sort + a sparing 'recommended' marker (resists a race-to-the-bottom while keeping "customer always
  selects", CEO D5).

### The high-leverage finding — empty states

The review's central call, echoing CEO S11: **the empty states are the most important screens**, and a
dead-end must become an action.

- **No offers / window expired** — calm card, *"No riders took this price yet."* Primary: **Nudge price &
  re-broadcast**. (Turns the offer-loop dead-end into the re-broadcast prompt the concept needs.)
- **No riders online** — *"No riders online in [corridor] right now."* Primary: **Notify me**.

Plus full **interaction-state coverage** (loading / empty / error / success / partial) specced for broadcast,
offers, tracking, offer-select, and signup/OTP — so no screen ships with an undesigned failure state.

**Verdict:** design system CLEARED and locked; empty-states and interaction-states specced as P1 build tasks
(DT1–DT7). → Build.

---

## 2. Build stage — two-sided consultation + post-build static pass (2026-06-27)

> Two passes during Build: a **design consultation** that extended the spec to the full two-sided journey
> once the rider side shipped (Phase 2), and the **static-design lens of the comprehensive post-build
> review**.

### 2a. Two-sided design consultation

The customer-side review (§1) covered one half of a two-sided product. This pass specced the **rider side**
(calibrated against the as-built `app/rider/*`) and the **cross-cutting flows** every two-sided courier needs
— once, on paper, reusing the locked tokens/components (nothing new invented):

- **Rider IA + screens** — become/KYC, online board, offer compose (accept-at-asking vs counter), active-job
  stepper (rider view), delivery-OTP hand-off — the rider scanning *orders* as the customer scans *offers*.
- **§5c stepper, rider view** — the customer and rider steppers are **one timeline seen from two sides**;
  step labels kept paired so a support agent reading either screen sees the same journey.
- **Two rider empty-states** — *"No open orders near you — you're online and first in line"* (don't make
  idleness feel like a dead-end) and a *"Finish verification to start bidding"* gate (no silent empty board).
- **Cross-cutting flows** — order/trip history, profile/settings, the public rider rating profile,
  notifications center, support/help.
- **Earnings — payment-agnostic** — a record of **agreed fares on completed deliveries** (work done, *not* a
  payout balance): no withdraw, no settlement state, no commission line, matching CONCEPT §6's matchmaker
  stance. Built to **absorb a future settlement mechanism without a redesign** when §6's revenue model lands.

Drift between built and designed logged as a checklist (DT8–DT13 in `docs/DESIGN.md`) so the post-Phase-3
visual review has a list instead of rediscovering it — chiefly the §5c stepper (both sides), the designed
empty-states, and contract-only fields with no UI (`itemPhotoUrl`, `note`, `comment`, `reason`).

### 2b. Static-design lens of the post-build review

Part of the comprehensive post-build review (eng + adversarial + static-design). The design-relevant finding:

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Error-state honesty** — failures were rendering as success-looking or ambiguous states across screens. | ✅ **Fixed in the same pass** — honest error states landed (this is what made DT3's interaction-state coverage real). |
| **P1** | **Rider-gate staleness** — a pre-KYC rider could see a stale board state instead of the verification gate. | ✅ **Fixed** — the not-verified gate is enforced, no silent empty board. |

Most newly-specced screens were then built (§5c stepper, empty-states, history, profile, earnings, the
not-verified rider gate — DT8/DT9/DT11/DT12), and **DT4** (offer best-match sort + RECOMMENDED marker,
design D-d) shipped — the last buildable-now design gap.

**Verdict:** Build design CLEARED — full journey specced and largely built, error-states made honest. The
remaining lift is device-gated visual QA. → Ship.

---

## 3. Ship stage — ship-prep visual QA + post-launch design lens (2026-06-29)

> The design lens of two ship-stage passes: the **ship-prep increment** visual QA, and the design column of
> the post-launch follow-up triage (product lens in `docs/CEO-REVIEW.md` §3, eng lens in `docs/ENG-REVIEW.md`
> §3). Calibrated against `docs/DESIGN.md` (clean utility + warm accent, data-light, 8pt).

### 3a. Ship-prep increment — onAccent token + skeletons

Designer's-eye QA of the ship-prep commits. Confirmed well-done: complete `onAccent` adoption; the cream
tip-card (`#FFFCF2`) correctly left alone (not on-accent); skeletons use tokens (no magic numbers),
native-driver pulse, `busy` a11y state.

| Sev | Finding | Resolution |
|-----|---------|------------|
| NIT | `onAccent` undocumented in `DESIGN.md` | ✅ **Fixed** — added to the colour table + a Skeleton row in Components. |
| **P1** | Generic card skeleton doesn't mirror row/stepper/summary shapes → reflow when data lands (history, earnings summary, §5c stepper). | ◐ **Partly fixed** — `SkeletonRow`/`SkeletonRows` added (mirrors the right-aligned-value row) and history wired to it. Bespoke **stepper** + **earnings-summary** skeletons **deferred to on-device `/qa`** — reflow can only be judged on a real device. |
| P2 | White-on-accent contrast ~5.2:1 vs the spec's "≥7:1 for primary actions (sunlight)". | **Deferred / out of scope** — the diff is a *pure token refactor*; contrast is **unchanged** from the prior hardcoded `#fff`, and the 7:1 line is about the green primary CTA, not the admin tabs/logo touched here. Re-tuning the brand accent luminance is a founder-level design call. |

**Scores this pass:** onAccent adoption **8/10**, skeletons **5/10 → improved** with the fixes. Carried to
`/qa`: per-screen skeleton fidelity (`SkeletonStepper` for the §5c screens, a tall accent summary skeleton for
earnings) — tune against real reflow on a device.

### 3b. Post-launch follow-ups (design lens)

The design column of the three-lens ship triage. Design's biggest contribution was catching the **#1 cutover
risk** on Task A (point the app at the live HTTPS API):

- **The unbounded-request hang (shipped).** `apiFetch` used raw `fetch` with no timeout, so on a weak Zimbabwe
  link the first-touch screens (`phone`, `verify`, `home`) would hang on an in-button spinner with no upper
  bound. The fix — a 15s `AbortController` request timeout (`apps/mobile/src/api/client.ts`) so a stalled
  request fails into the existing friendly-error path within seconds — is the design lens made concrete (the
  eng lens wired the matching LB/Cloud Run WS timeouts; see ENG-REVIEW §3c).

Reviewed design follow-ups **not executed** (captured so nothing is lost; each with a trigger):

- **Pre-auth loading discipline** — `phone`/`verify`/`home` have no skeleton/interim affordance and there's no
  global offline banner (no NetInfo). Lower-risk than the shipped timeout. _Trigger:_ on-device `/qa`.
- **Declined-KYC state** (Task E) — `rider/become.tsx` branches verified-vs-not only; a `failed`/declined
  `kycStatus` is mislabeled "pending". A real Didit run *will* produce declines — add an honest declined
  screen + redo route. _Trigger:_ pairs with the Didit run.
- **OTP channel copy** (Task B) — `verify.tsx` should read `channel` from `requestOtp` and tell the user to
  check WhatsApp. _Trigger:_ when the BSP channel goes live.

**Verdict:** Ship design CLEARED. The cutover UX risk is shipped; the rest are honest, trigger-tagged UX
follow-ons (mostly device-gated `/qa` work). **Design score: 9/10** — the full two-sided journey is specced
and built and review-hardened; the remaining lift is the device-gated visual QA (DT5 map / DT7 `/design-review`
/ DT13). **Current build status → `docs/PILOT-READINESS.md`.**
