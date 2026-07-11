# Lynia — Fraud Loophole Review (Customer & Rider Flows)

_Adversarial review of the customer and rider user journeys for **fraud** loopholes — money
leakage, reputation gaming, identity abuse, and collusion — with a phased plan to close them._
_Method: risk-domain fan-out across the five value-at-risk surfaces, then line-level verification
of every headline finding against source (`file:line`, exploit path, fix)._

> **Framing.** Lynia is a **matchmaker, not a payment processor** (CONCEPT §1). The rider transports
> the item and collects the *delivery fare* in **cash** directly from the customer; goods money is
> settled off-app. Lynia earns a **15% weekly commission on the in-app agreed fare** (`policy.ts`
> `SETTLEMENT`). That single fact shapes the whole threat model: **the platform's revenue depends on
> numbers (the agreed fare, the completion event) that are entirely controlled by the two parties and
> never reconciled against the physical cash.** Most fraud here is not a crypto break — the OTP/token
> core is sound — it is *economic*: making the platform's numbers lie about what really happened.

**Severity:** **P0** = revenue/integrity loss exploitable now by an ordinary user, no admin needed ·
**P1** = high-impact with a plausible trigger · **P2** = real abuse, bounded trigger · **P3** =
defense-in-depth / latent.

---

## The one-line summary

Three structural holes let an ordinary user quietly defraud the platform today, and they **compound**:

1. **A single account (or a colluding pair) can bid on and win its own order** — no guard that the
   rider ≠ the customer. This is a wash-trade engine: it farms 5★ ratings, `tripsCount`, and
   reliability recovery, and lets the attacker set any fare they like.
2. **Commission is billed on a rider-proposed number with no floor and no cash reconciliation** — a
   rider and customer agree a real $5 fare off-app, bid **$0.01** in-app, and Lynia collects ~$0.
3. **`markUndelivered(refused)` is a penalty-free, unaudited, off-books escape hatch** — the rider
   physically delivers, collects the cash, taps "recipient refused", and the trip vanishes from the
   commission base with **zero** reliability hit.

Around those sit identity holes (bans reset with a new SIM; KYC face-match is brute-forceable) and a
reputation system that can be weaponised (report/issue spam, one-sided rating sabotage).

---

## P0 — structural fraud, fix before real money moves

### P0-1 · A user can bid on and win their own order (self-dealing / wash trades)
**`apps/api/src/offers/offers.service.ts:22-84` (`makeOffer`), `apps/api/src/matching/matching.service.ts:41-132` (`selectOffer`)**

A `Profile` can be both a customer and a rider (`becomeRider` just flips role + adds a `Rider` row),
and **nothing compares the offer's `riderId` to the order's `customerId`.** `makeOffer` fetches
`order.customerId` (`offers.service.ts:26`) but uses it only for the notification (`:67`).
`selectOffer` checks `offer.order.customerId === customerId` (`matching.service.ts:71`) — which
*passes* when actor is both parties — and the block predicate `blockedPairWhere(customerId, riderId)`
(`:76-80`) compares the account to itself, so it never matches.

**Exploit (one verified+online account A, or two colluding accounts):** A posts an order → A bids as
rider → A selects A → A holds the OTP (returned to the selecting customer, `matching.service.ts:130`)
and confirms delivery → A rates A 5★. Every loop grants `tripsCount++`, `ratingAvg`/`ratingCount`
inflation, and `+2` reliability recovery — the exact fields shown to real customers in the offer list
and used by the ranker. ~20 loops laundders a bad/on-hold reputation to a fake 5.0. No cash moves, so
it runs free at scale, and it composes with P0-2/P0-3.

**Fix:** Reject in `makeOffer` when `order.customerId === riderId`; re-assert inside the `selectOffer`
CAS. Defense-in-depth: forbid the same `profileId` from being both customer and assigned rider at the
DB layer, and down-weight repeat same-pair trips in reputation aggregation (see P1-6).

---

### P0-2 · Commission basis is decoupled from real cash; no fare floor
**`apps/api/src/matching/matching.service.ts:111` (`agreedFare ← offer.offeredFare`), `contracts.ts:80` (`offeredFare: z.number().positive().max(100_000)`), `settlements.service.ts:106,113`**

Commission = `15% × Σ agreedFare` over completed orders. `agreedFare` is copied verbatim from the
rider's `offeredFare`, whose only bound is "positive, ≤ 100000, 2dp." There is **no floor tying it to
`suggestedFare`/distance**, and **nothing reconciles it against the cash the rider physically
collects.**

**Exploit (rider + customer, no admin):** agree off-app the real fare is $5; customer posts, rider
bids `offeredFare = $0.01`, customer selects. Order completes normally, rider pockets $5 cash,
commission owed ≈ `15% × $0.01 ≈ $0`. Repeat every trip. The ranker *prefers* cheap offers, so a
colluding pair even looks legitimate. This is systemic commission evasion available to every rider.

**Fix:** Bill commission on `max(agreedFare, floor(suggestedFare))` and/or reject `offeredFare` below
a policy band derived from `suggestedFare`. Longer term the cash needs a verification signal
(customer-confirmed amount at hand-off) rather than trusting a rider-proposed number. Pair with
anomaly detection on persistently-far-below-suggested fares between the same two parties.

---

### P0-3 · `markUndelivered(refused|wrong_address)` — penalty-free off-books escape hatch
**`apps/api/src/orders/order-lifecycle.service.ts:273-326` (`markUndelivered`), `apps/api/src/riders/reliability.ts:36-40` (`undeliveredPenalty`), `settlements.service.ts:106`**

`grossFares` only sums `status = "completed"` orders, so any other terminal state — notably
`undelivered` — contributes **nothing** to commission. And `undeliveredPenalty` returns **0** for
`refused` and `wrong_address` (`reliability.ts:39`), which are entirely **rider-self-attested with no
evidence**.

**Exploit:** rider advances to `picked_up` (parcel on the bike), rides to the recipient, hands over
the goods and collects the cash **in person**, then instead of entering the OTP calls
`POST /orders/:id/undelivered` with `reason:"refused"`. Order goes terminal `undelivered` → excluded
from `grossFares` (no commission) → **no reliability penalty**. This is the exact hole the post-pickup
rider-cancel block (`RIDER_CANCELLABLE_STATUSES`) was designed to close, reopened via `undelivered`.

**Fix:** Treat post-pickup `undelivered` as a **disputed** event, not a self-service terminal: require
photo + geofence evidence, hold in a `delivered_disputed`/`undelivered_pending` state for
customer/ops confirmation before it goes terminal, and apply a reliability penalty to **all**
post-pickup undelivered reasons. Flag per-rider `undelivered(refused)` rates for anomaly review.

---

## P1 — high-impact, plausible trigger

### P1-1 · Refunds net against the rider's *whole* week and aren't capped to the order fare
**`apps/api/src/issues/issues.service.ts:212-219`, `contracts.ts:163` (`refundAmount: positive().max(1000)`), `settlements.service.ts:128-134` (`amountDue = max(0, commission − refundsNetted)`)**

A refund is bounded only to "positive, ≤ $1000" — **not to the order's fare** — and every un-netted
refund in the window is subtracted from the rider's **total** weekly commission, floored at 0.
`Issue`/`Refund` have no per-order uniqueness, so refunds can stack.

**Exploit:** after a $40-commission week, a rider raises a trivial issue on one throwaway $1 order; ops
(socially engineered, or colluding) resolves `refund` = $1000 → `refundsNetted = 1000`,
`amountDue = max(0, 40 − 1000) = 0`. The entire week's commission is wiped.

**Fix:** Cap `refundAmount ≤ order.agreedFare`; net a refund only against its **originating order's**
commission, not the rider's whole book; require dual-control + evidence for refunds above a threshold.

### P1-2 · KYC attempt-lock is bypassable — vendor auto-declines never count → unlimited face/ID retries
**`apps/api/src/riders/rider.service.ts:205-224` (`applyKycResult`) vs `:248-266` (`adminSetKyc`), retry lock at `:142-144`**

The "locked after two attempts → support" control only increments `kycAttempts` on **admin** declines.
The Didit webhook path (`applyKycResult`) **deliberately does not** touch `kycAttempts`
(comment `:218-219`). A vendor auto-decline (`score < needsReview`) leaves the counter at 0.

**Exploit:** submit a borderline/fraudulent face or document → auto-`failed`, counter stays 0 →
`POST /riders/kyc/retry` (passes `kycAttempts < 2`) → repeat indefinitely, varying the document/face,
until one submission scores ≥ 0.85 and auto-approves. The face-match/ID check becomes brute-forceable.

**Fix:** Increment `kycAttempts` on vendor `failed` in `applyKycResult` too (or cap total failed
attempts regardless of source); count needs-review resubmits toward a session-mint budget.

### P1-3 · Banned/suspended rider re-registers with a new SIM — identity is never deduped
**`schema.prisma:121` (`idNumber String?`, no `@unique`), `rider.service.ts:78-125` (`becomeRider`), `didit-kyc-vendor.ts:22-30`**

Account identity is purely the phone (`Profile.phone @unique`); a ban is a per-`Rider`-row flag with
nothing tying it to the human. There is no uniqueness/dedup on national ID, face, or device, and the
typed `idNumber` is never sent to or reconciled with Didit (`vendor_data` carries only `riderId`), so
it is cosmetic.

**Exploit:** banned rider gets a second SIM → verifies OTP → fresh profile → `becomeRider` → submits
the **same real face + ID** to Didit → legitimately approved → active again. Bans, suspensions, and
reliability holds all reset. Combined with P0-1 this also re-launders reputation on a clean account.

**Fix:** Persist and dedup a **verified** identity signal from Didit (document number / face vector /
Didit identity id) across riders; block onboarding when it matches a banned/suspended identity. At
minimum make verified national-ID unique and cross-check it against what Didit verified.

### P1-4 · OTP verify — attempt cap is a TOCTOU race + the endpoint is unthrottled → account takeover
**`apps/api/src/auth/auth.service.ts:168-185` (`verifyOtp`), `auth.controller.ts:26-29` (no `@Throttle` on `/auth/otp/verify`), `otp-store.ts:39-44,74-76`**

`verifyOtp` does read → check (`attempts >= MAX_OTP_ATTEMPTS`) → **separate** increment, so the
`MAX_OTP_ATTEMPTS = 5` cap only holds for **sequential** requests. Under concurrency, N requests all
read `attempts = 0`, all pass the gate, all compare a guess. `/auth/otp/verify` has **no route
throttle** (unlike `/auth/refresh`).

**Exploit:** trigger one OTP send, then fire a large concurrent burst of `/auth/otp/verify` for that
phone with different 6-digit guesses. Because increments lag the reads, far more than 5 guesses land
per live code; against a 10⁶ space a big enough burst per issued code gives a real hit rate →
takeover of the victim's account (and its role/reputation).

**Fix:** Make check-and-increment atomic (Redis `INCR`-then-compare / Lua); add a per-IP `@Throttle`
to `/auth/otp/verify`; add a per-phone verify-window independent of the per-code counter.

### P1-5 · Report / issue spam — no status gate, per-order dedup only → sabotage, ops DoS, manufactured strikes
**`apps/api/src/reports/reports.service.ts:22-86`, `apps/api/src/issues/issues.service.ts:44-76`, ops surfacing at `admin.service.ts:771-786`**

Neither `report()` nor `issue.raise()` checks order status — both fire the instant a rider is
`assigned`, before any delivery, and dedup only per `(orderId, reporter, subject)`. Across N orders you
get N rows against the same subject.

**Exploit:** to sabotage rider X, a customer repeatedly creates orders, gets X assigned, files a
`fraud` report / `no_show` issue, cancels, repeats. Each new `orderId` is a fresh row;
`reportsFor`/`listForAdmin` surface an inflated fault count to ops (the signal designed to prompt a
suspend/ban), and any one issue resolved as `rider_strike` pushes X toward `RIDER_STRIKE_LIMIT`.

**Fix:** Gate reports/issues to post-`delivered`/terminal orders; rate-limit per reporter per subject
per window; weight the ops-facing count by **distinct completed trips**, not raw rows; flag reporters
whose reports cluster on one subject.

### P1-6 · Reputation is farmable and one-sidedly weaponisable
**`order-lifecycle.service.ts:353-365` (`rate`), `:379-403` (`rateSender`), `reliability.ts`**

There is no distinct-counterparty / velocity control on ratings or reliability recovery. Customer
`rate()` drives **both** `ratingAvg` and a **−10** reliability hit; rider `rateSender()` is recorded
only (customers have no score). So (a) via P0-1 a colluding pair farms 5★ + recovery without limit,
and (b) a customer who repeatedly orders from a target rider can grind them below the `ON_HOLD_BELOW =
60` gate purely to sabotage, with no reciprocal exposure and no per-relationship cap.

**Fix:** Down-weight / cap repeat same-pair contributions to `ratingAvg` and reliability; exclude
same-`profileId` (self-dealt) trips entirely; consider requiring corroboration (low rating **+**
report) before a reliability penalty lands.

---

## P2 — real abuse, bounded trigger

- **P2-1 · Admin `adjustFare` can rewrite `agreedFare` downward with no floor before settlement.**
  `admin.service.ts:455-483` — the only guard blocks editing an order whose week is already `PAID`; an
  order in the open week can be set to any positive value, and regeneration lowers commission before
  billing. A rogue/gamed admin zeroes commission (audited, but no lower bound). **Fix:** forbid
  downward fare edits on completed orders inside a settlement window; treat corrections as explicit,
  capped, audited credits.
- **P2-2 · `recordPayment` clears a settlement with no proof cash moved.**
  `settlements.service.ts:219-235` — a single admin action, free-choice `method` (incl. `"netted"` =
  no cash), no receipt/reference, no amount reconciliation. (Overlaps BUG-HUNT **P2-4**.) **Fix:**
  require a payment reference for cash/EcoCash, dual-control for large amounts, recorded-vs-deposited
  reconciliation report.
- **P2-3 · Banned/suspended-at-runtime rider keeps acting until token expiry; ban revokes no sessions.**
  `jwt-auth.guard.ts:13-25` never re-reads `accountStatus`; only the go-online gate does. (Overlaps
  BUG-HUNT **P2-1**.) **Fix:** revoke the profile's sessions on ban/suspend; consult account standing
  for sensitive actions.
- **P2-4 · Strike counter is shared between cancels and dispute strikes, and resets to 0 at the limit.**
  `order-lifecycle.service.ts:463-469` resets `cancelStrikes: 0` on hitting the limit; `issues.resolve`
  (`:220-225`) increments the same field but never enforces the limit. A serial bailer never escalates;
  an unrelated cancel silently wipes admin-issued strikes. **Fix:** separate columns; enforce
  `RIDER_STRIKE_LIMIT` at increment; monotonic/escalating cooldown.
- **P2-5 · Multi-accounting.** Only the phone binds an account; cheap SIMs → unlimited customer/rider
  identities for promo abuse, review-bombing, and sock-puppet reports (feeds P1-5). **Fix:** device
  attestation / risk scoring at signup, per-device/IP velocity limits, identity-level aggregation.
- **P2-6 · Recipient can take the goods then withhold the OTP.** `order-lifecycle.service.ts:221-263` —
  delivery is provable *only* by the recipient-held OTP; a dishonest recipient strands the rider (no
  credit, no rating) with only a *false* `undelivered` as an exit. **Fix:** rider-side
  proof-of-delivery dispute (photo + geofence) opening an admin-reviewable state.
- **P2-7 · Didit webhook signature enforcement is conditional on `KYC_PROVIDER === "didit"`.**
  `kyc.controller.ts:60-82` — verification runs only inside `if (secret)`; under provider/secret config
  drift an unsigned forged webhook could be processed. **Fix:** verify the signature unconditionally
  whenever the callback is mounted.
- **P2-8 · Phone-number recycling = account takeover.** `auth.service.ts:188-197` upserts on phone; a
  recycled SIM hands the new holder the previous owner's account and reputation. **Fix:** identity
  step-up on login from a new device after inactivity; re-KYC riders on device change.

---

## P3 — defense-in-depth / latent

- **No absolute fare floor beyond `> 0`** — `offeredFare` accepts `$0.01` (folded into P0-2).
- **ETA is an unaccountable promise** — `etaMinutes` feeds the ranker (weight 0.2) but is never checked
  against the rider's live distance or actual arrival (`offer-ranking.ts:79`). Sanity-check vs `geog`.
- **TOCTOU stale offer** — `makeOffer`'s status read and `offer.create` aren't in one tx, so an offer
  can be inserted onto a just-closed order (`offers.service.ts:24-65`); un-selectable but pollutes.
- **`on_hold` self-clear is impossible** — the only way to raise reliability requires being assigned,
  which requires being online, which `on_hold` blocks (`reliability.ts`); a rider can never earn their
  way out on their own. **Fixed (admin side):** `POST /admin/riders/:id/clear-hold`
  (`admin.controller.ts:188`, `admin-riders.service.ts` `clearHold`) now gives an admin an explicit
  escape hatch — previously an `on_hold` rider had no admin action at all (only `suspended` riders got
  Lift/Ban). Self-service recovery is still absent, so the P0-1 interaction (self-dealing as the only
  *self*-service recovery) still applies.
- **Throttle keyed by IP, not subject** — the guard runs before `JwtAuthGuard` so authenticated limits
  fall back to IP (`throttle.guard.ts:41-63`); per-account offer/verify limits aren't really per
  account.
- **Lifecycle write routes unthrottled** — `/deliver`, `/cancel`, `/undelivered`, `/status` carry no
  `@Throttle` (`lifecycle.controller.ts`).
- **Global OTP-send hard cap is a shared lockout lever** — `RL.global {max:5000/day}` can be exhausted
  to 429 all users (`auth.service.ts:22-26`). Prefer adaptive challenge over a blanket block.
- **No refresh-token reuse detection; logout revokes one session only** (`auth.service.ts:206-246`).

---

## What is already sound (so we don't regress it)

- Delivery OTP: CSPRNG, HMAC-hashed at rest, `timingSafeEqual` compare, 5-attempt cap under a
  `FOR UPDATE` row lock, never returned in any snapshot — **not brute-forceable, not leaked.**
- No state-skips / double-completion: every forward transition is a from-state-guarded CAS; `delivered
  → completed` CAS grants `tripsCount`/commission exactly once; `one_active_ride` partial-unique index
  prevents double-assignment.
- Rating integrity: score is `int 1..5`; one rating per `(order, rater)`; can't rate before delivery or
  an order you weren't on.
- Didit webhook (when provider=didit + secret set): canonical-body HMAC, timing-safe, replay window,
  monotonic `kycResolvedAt` guard, fail-closed.

---

## Remediation plan

Sequenced so the cheapest, highest-leverage code fixes land first; the structural/economic controls
follow; detection backstops what code can't fully prevent.

### Phase 0 — pre-pilot blockers (small, local code changes)
1. **Self-dealing guard (P0-1):** reject `order.customerId === riderId` in `makeOffer` **and** in the
   `selectOffer` CAS. Add a regression test. _Smallest, highest-leverage fix in the review._
2. **Undelivered becomes a disputed event (P0-3):** apply a reliability penalty to all post-pickup
   undelivered reasons now; gate `refused`/`wrong_address` behind evidence + an admin/customer
   confirmation state (see Phase 1 for the full disputed-state machine).
3. **Fare floor (P0-2, first half):** reject `offeredFare` below a policy band of `suggestedFare`; bill
   commission on `max(agreedFare, floor)`. Ship the floor even before cash-verification exists.
4. **Refund cap (P1-1):** cap `refundAmount ≤ order.agreedFare` and net per originating order.
5. **KYC retry-lock (P1-2):** increment `kycAttempts` on vendor `failed`.
6. **OTP verify hardening (P1-4):** atomic increment + per-IP `@Throttle` on `/auth/otp/verify`.
7. **Report/issue gating (P1-5):** require post-`delivered`/terminal status; rate-limit per
   reporter→subject.

### Phase 1 — identity & enforcement
8. **Identity dedup (P1-3):** persist a verified Didit identity signal; unique + banned-identity block
   at onboarding.
9. **Ban is immediate (P2-3):** revoke sessions on ban/suspend; standing check on sensitive routes.
10. **Disputed-delivery state machine (P0-3 / P2-6):** `delivered_disputed` + rider proof-of-delivery
    (photo + geofence) and recipient-withheld-OTP path; admin resolution.
11. **Money-console controls (P2-1, P2-2):** floor/forbid downward `adjustFare` in an open window;
    require payment reference + dual-control on `recordPayment`; reconciliation report.
12. **Strike model (P2-4):** split cancel vs dispute strikes; enforce the limit at increment; monotonic
    cooldown. **Webhook (P2-7):** verify signature unconditionally.

### Phase 2 — anti-collusion, reputation integrity, detection
13. **Cash verification signal (P0-2, second half):** customer-confirmed hand-off amount vs agreed
    fare; discrepancy → flag/hold.
14. **Reputation weighting (P1-6):** down-weight/cap repeat same-pair ratings & recovery; exclude
    self-dealt trips.
15. **Multi-accounting defenses (P2-5, P2-8):** device attestation, signup velocity limits, identity
    step-up on device change / recycled numbers.
16. **Fraud analytics backstop:** per-rider dashboards + alerts for the residual-risk signals code
    can't fully block — `undelivered(refused)` rate, agreed-fare-vs-suggested gap, repeat-counterparty
    clustering, report clustering, KYC retry velocity, settlements marked `netted`.
17. **P3 hardening sweep:** subject-keyed throttling, lifecycle-route throttles, ETA sanity-check,
    stale-offer tx, `on_hold` self-recovery path, refresh-reuse detection.

---

_Line references are as of this review against the current branch. `file:line` pointers are exact so
remediations are unambiguous; re-verify after any refactor of the cited services._
