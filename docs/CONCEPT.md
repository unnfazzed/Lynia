# Lynia — Concept

> **Vision:** a Zimbabwean **superapp** — send anything, and order food, shop goods and medicine, all
> delivered by motorbike.
> **Today:** two products on one fleet. **Send** is an on-demand motorbike courier: pick an item up here,
> deliver it there. **Restaurants, Shops and Pharmacy** let a customer order from a venue and have it
> delivered, cash on delivery. Both run everywhere in Zimbabwe.
> **Payments reality:** Zimbabwe is **cash-based and low-trust**. Lynia is a **matchmaker, not a payment
> processor**. Customers pay in cash; Lynia's revenue is a prepaid commission on what the biker earns.
> **Matching for parcels is the inDrive model:** the **customer names the price** (system-suggested,
> adjustable), bikers **accept or counter**, and the **customer picks the biker**.
> References: Grab Express (point-to-point parcel), **inDrive** (customer-priced, cash-economy marketplace).

This is the product north star: what Lynia is and the decisions that shape it. *How* it is built is in
[ARCHITECTURE](ARCHITECTURE.md); prices in [PRICING](PRICING.md); security in [SECURITY](SECURITY.md).
Section numbers are cited from code, so keep them.

**Wording.** User-facing copy says **"biker"**; code, routes and data say `rider` (ledger D-101). This doc
uses "biker" for the person and `rider` for code names.

---

## 1. What Lynia is

A two-sided, on-demand delivery marketplace.

**Send (parcels) — the core flow, on the inDrive model:**
1. **Customer** sets pickup and drop-off pins (+ item description/photo) and sees a **system-suggested
   price**.
2. The customer can **change the price** (the suggestion is a guide, not a floor) and **broadcasts**.
3. **Every online biker in Zimbabwe** sees the request and either **accepts the price** or **counters** with
   their own (one round each — no haggling back and forth). The board lists open orders nearest first.
4. **All interested bikers** are shown to the customer with price, rating and ETA.
5. The **customer selects the biker** → the job is assigned and they track the biker live.

- **No manual dispatch.** A broadcast with no interested bikers in the window **expires**, and the
  customer is prompted to **raise the price and re-broadcast**. Admin only **monitors and supports**.
- **Reach is nationwide** (ledger D-99): "Bikers can get any order despite their location… It's up to the
  user to decide who they want." The customer chooses; a biker far away shows a longer ETA.

**Restaurants, Shops and Pharmacy (merchant orders):** the customer orders from a venue's menu, the venue
accepts and prepares it, and a biker delivers it. The delivery fee is fixed by distance, and the job goes
first-accept-wins to bikers within 15 km of the venue — food can't wait for a biker from another city.
Payment is **cash on delivery**. See §1b.

Customers and bikers use **one mobile app**. Merchants use a separate phone-first web app.

> **Core rule:** the biker never **buys** anything with their own money. On a parcel, the biker only
> transports the item; if the receiver is the buyer, they settle with the sender **offline**. On a merchant
> order, the customer pays cash at the door, and either the biker returns the venue's share or the venue
> was paid up front — the venue chooses (`MerchantCashRule`). "Buy-for-me" relay stays **off the roadmap**.

---

## 1b. Superapp vision & sequencing

Every successful superapp (Grab, Gojek, Careem) started as **one thing done exceptionally**, then layered
verticals onto a shared **spine**. Lynia's spine:

> **① one identity · ② one logistics & biker fleet · ③ one location/address book · ④ one transaction & reputation record.**

**The ladder (cash-economy version — each rung reuses the one below):**
1. **Send / parcel** — the biker *transports* an item. Built the spine.
2. **Merchant verticals via cash on delivery** — **restaurants, shops and pharmacy** are built. The
   merchant holds and packs the goods, the biker only delivers, the customer pays cash at the door. Cash
   on delivery is the bridge to commerce.
3. **Next rungs** (not built): more verticals and, when digital payments mature, a real payment rail
   ([PAYMENT-RAIL-OUTSTANDING](PAYMENT-RAIL-OUTSTANDING.md)).

**Discipline:** design the seams, don't build the rooms (§5b). A new vertical should be an additive order
type on the same spine, not a new system.

---

## 2. Decisions locked

| Decision | Choice | Notes |
|---|---|---|
| Courier model | **Point-to-point parcel** + **merchant cash on delivery** | The biker never fronts money for goods |
| Biker & money | **Biker handles the item; customer pays cash** | Parcel goods money settled offline; merchant goods paid at the door |
| Revenue | **Biker commission, prepaid** | 10% of what the biker earns per job, after their first 10 jobs. See §6 |
| Payments | **No payment processing** | No card or mobile-money rail is wired. See §6 |
| Matching (parcels) | **inDrive: customer-priced bidding** | Suggest → adjust → broadcast → accept/counter → customer selects |
| Matching (merchant orders) | **Fixed fee, first-accept-wins** | The venue's own bikers first, then the nearest, within 15 km |
| Pricing | **Customer names the parcel price** | Suggestion = base + per-km; soft, no hard floor. See [PRICING](PRICING.md) |
| Biker response | **Accept or counter — one round** | No back-and-forth |
| Selection | **Customer always selects** (parcels) | Every interested biker is shown; exact-accepts go to the list too |
| No-offers fallback | **Expire + re-broadcast** | No manual dispatch |
| Geography | **All of Zimbabwe** | One border rule for every location check (`packages/shared/src/service-area.ts`, D-99) |
| App packaging | **One mobile app** (customer + biker), **one merchant web app** | Expo app; merchant app at `merchant.lyniago.com` |
| Platforms | **Android app**; **iPhone users on the web** (`app.lyniago.com`) | Zimbabwe is mostly Android |
| Live tracking | **One order screen follows the order** | Live biker location from assignment to delivery. See §5c |
| Account creation | **Phone + name** | Verified by a one-time code; national ID optional for customers. See §5d |
| One account | **Customer → upgrade to biker** | Biker requirements added on top |
| Identity verification | **Bikers: fully automatic KYC** | Didit decides; no human review step. See §5d |
| Profiles & privacy | **Phone hidden except during an active order** | Public name = first name + last initial |

---

## 3. Risk register

1. **Cold start (highest risk).** A marketplace needs bikers and customers at the same time.
   **Mitigation:** recruit bikers ahead of demand; nationwide reach means any online biker can bid on any
   parcel, which helps while supply is thin.
2. **Monetisation.** Commission is live at 10% after a biker's first 10 jobs. **Risk:** bikers must pre-fund
   a wallet, and the only top-up path today is a support call and an admin credit — there is no payment
   rail (§6, [PAYMENT-RAIL-OUTSTANDING](PAYMENT-RAIL-OUTSTANDING.md)). **Mitigation:** no minimum balance;
   a biker is only stopped from a job whose commission exceeds their balance.
3. **Addressing.** No reliable street addresses → rely on **GPS pin + landmark text + phone number**.
4. **Data cost.** Mobile data is expensive → keep the app light, cache maps, throttle background location.
5. **Trust & safety.** **Automated KYC** for bikers (ID check + selfie), bike registration (stored) and a
   **required biker photo**; **photo at pickup**; **6-digit handover codes** (pickup and delivery);
   two-way ratings; a **declared-value cap** (US$150 per parcel, `packages/shared/src/contracts.ts`);
   a **prohibited-items list** (cash, weapons, drugs, prescription medicine, stolen goods…); a
   **per-device signup throttle**; SOS on a live trip. Prescription medicine goes through the pharmacy
   flow with a pharmacist check, never as a parcel. Liability for safe handling sits with the biker;
   platform liability is capped in the terms.
6. **Bidding-model complexity.** The offer loop is the core build. **Mitigation:** strictly one round; every
   contended write is a guarded compare-and-swap ([ARCHITECTURE §13](ARCHITECTURE.md#13-concurrency-safety-model)).
7. **Lowball / no-offers.** With no hard floor, customers may underprice. **Mitigation:** an honest suggested
   price, autofilled into the field; an acceptance-band hint ("bikers usually accept around $X–$Y"); an
   empty-broadcast screen that prompts a price raise and re-broadcast.
8. **Scope.** Many surfaces (customer, biker, merchant, admin, web). **Mitigation:** each surface aligns to
   its design handoff; anything not drawn is not built.
9. **Superapp scope creep.** New verticals tempt new systems. **Mitigation:** additive order types on the
   same spine only (§5b).
10. **Comms cost / reach.** Data is expensive and not everyone stays online. The sign-in code goes by
    WhatsApp or SMS (§5d). **Push is the primary channel for new-order alerts to bikers** — fast alerts are
    critical. Push and the in-app notifications feed carry the rest.
11. **OTP delivery.** Code delivery depends on a messaging vendor (template approval, per-message cost,
    reach). **Mitigation:** the channel is set per deployment (`OTP_CHANNEL` in
    `apps/api/src/config/env.ts`: WhatsApp Cloud API, Bird SMS, Bird Verify — WhatsApp first with SMS
    fallback — or a local A2P SMS gateway).
12. **Automated KYC coverage for Zimbabwean IDs.** The vendor may false-reject genuine IDs, and with no
    human review band a false reject stands until the biker retries. **Mitigation:** measure the
    false-reject rate on real IDs; support can apply an audited admin override.

---

## 4. Product scope

**In scope:**
- **Onboarding:** phone + one-time code, name; one account, **upgradeable to biker** (automated KYC, bike
  registration, required photo; jobs only after verification). See §5d.
- **Profiles:** biker (photo, first name + last initial, trips, date joined, rating) and customer (first
  name + last initial, orders, date joined); **phone hidden except during an active order**.
- **Customer — Send:** pickup/drop-off pins, items, **suggested price**, adjust, **broadcast**, compare
  offers, **select a biker**, live tracking, rating.
- **Customer — Restaurants, Shops, Pharmacy:** browse and search venues, order, follow the order on the
  same order screen, pay cash at the door. A pharmacy order can carry a prescription for the pharmacist.
- **Biker:** go online/offline, see every open parcel on one board and **accept or counter (one round)**,
  take merchant jobs, step through the trip, share live location, job history, and the **prepaid
  commission wallet** (balance, ledger, top-up).
- **Merchant (web app):** menu and hours, an order board (accept → cook/pack → hand over → on the way →
  cash back), team members, preferred bikers, and "book a biker" for the venue's own parcels.
- **Admin console:** monitor orders, bikers, customers, KYC, SOS and disputes; support stuck orders;
  credit biker wallets. No manual dispatch in the normal flow.
- **Notifications:** sign-in code by WhatsApp/SMS; push for order events and new-order alerts; an in-app
  notifications feed.

**Out of scope:**
- ❌ **Back-and-forth haggling.**
- ❌ **Hard price floor / customer-side price caps.**
- ❌ **Manual / admin dispatch as a product path.**
- ❌ **Buy-for-me relay / biker float.**
- ❌ **In-app payment processing** — no card or mobile-money rail is wired; merchant checkout is cash only.
- Scheduled parcel deliveries, in-app chat, promotions/referrals.

---

## 5. Tech architecture

An own **NestJS / TypeScript API on PostgreSQL + PostGIS** (no BaaS), with Redis for OTP, rate limits,
BullMQ jobs and Socket.IO fan-out. It runs on **Azure** in South Africa North (Container Apps,
PostgreSQL Flexible Server, Azure Managed Redis, Blob Storage, Key Vault), behind cloud adapters
([ARCHITECTURE §3 and §12](ARCHITECTURE.md)).

| Layer | Choice | Why |
|---|---|---|
| Mobile app (customer + biker) | **React Native + Expo (EAS)** | One codebase; the Android build, and the same app exported for the web at `app.lyniago.com` |
| Merchant app | **Next.js** static export on Cloudflare Workers | Phone-first web app; no store install for venues |
| Admin console | **Next.js** on Azure Container Apps, behind Microsoft Entra sign-in | Monitoring and support tool |
| Backend | **Own NestJS API on PostgreSQL** | Full control; own OTP + JWT auth, Prisma, BullMQ |
| Offer loop | **Socket.IO + Redis + Postgres** | One nationwide board room; server-side expiry |
| Maps | **Google Maps Platform** | Best coverage in Zimbabwe; geocoding, places |
| Payments | **None** — cash on delivery; commission wallet credited by admin | See §6 |
| Notifications | **WhatsApp / SMS** (sign-in code) + **FCM / APNs** (push) | Push is primary for new-order alerts |
| Identity | **Didit** (automated KYC) | Zimbabwean national IDs |

### Data model (sketch)
The authority is `apps/api/prisma/schema.prisma`. The main shapes:
- `profiles` — one identity; role `customer | rider | merchant | admin`; name, phone, optional email,
  optional national ID (encrypted, with a one-way hash).
- `riders` — bike registration, photo, KYC status and reference, online state and position (PostGIS),
  trip and rating aggregates, strikes and holds.
- `orders` — `order_type` `parcel | merchant`; pickup/drop-off waypoints, line items (`items` JSON), the
  parcel fares (`suggested_fare`, `proposed_fare`, `agreed_fare`), merchant money fields (goods total,
  delivery fee, venue's delivery share), hashed and sealed handover codes, status, timestamps.
- `offers` — one per biker per parcel order (`accept | counter`).
- `order_events` — the append-only status history the tracking timeline renders from.
- `ratings`, `issues`, `reports`, `sos_events`, `audit_logs`.
- `merchants`, `merchant_dishes`, `merchant_order_items`, `order_prescriptions`, `merchant_debt_ledger`
  — the merchant verticals.
- `commission_accounts`, `commission_ledger`, `top_ups` — the prepaid commission wallet (§6).

### Order status flow
Parcels: `open_for_offers → assigned → confirmed → en_route_pickup → picked_up → en_route_dropoff →
delivered (code verified) → completed`, plus `cancelled`, `expired` and `undelivered`. The customer's
`proposed_fare` is broadcast; bikers submit `offers`; the selected offer's fare becomes `agreed_fare`.

Merchant orders start in `requested` while the venue accepts and prepares them (a `merchant_phase`
sub-state), then join the same delivery states once a biker accepts the job. Details:
[ARCHITECTURE §7](ARCHITECTURE.md#7-order-lifecycle-state-machine).

---

## 5b. Superapp "seams" (cheap now, saves a rewrite)

Low-cost data decisions so new verticals plug in as **additive order types**, not migrations:

1. **Generic `orders`** with an `order_type` enum — `parcel` and `merchant` today — and **line items**,
   not a single item field (`Order.items`).
2. **`merchants`** with `merchant_id` on orders — now used by restaurants, shops and pharmacy.
3. **Saved `addresses`** per user.
4. **One identity, expandable roles** — customer / rider / merchant / admin.

Payments stay a seam, not a feature: the payment-rail interface exists with a stub behind it
(`apps/api/src/adapters/payments/`), and the wallet ledger is ready for a rail to credit it.

---

## 5c. Live tracking & the order screen

> Once a biker is selected, the customer gets **one order screen** that follows the order through every
> stage — a full-bleed live map and a sheet that changes with the stage. It is the customer's home for an
> active order. Parcel and merchant orders use the same screen.

### Why it matters
In a cash, low-trust market the customer has handed a stranger their parcel, or is waiting for food they
will pay for at the door. A clear "where is my biker" view is the biggest **trust and anxiety reducer**,
and it is what makes the rating at the end feel earned.

### The journey (parcel)

| # | Customer sees | Order status | What happened |
|---|---|---|---|
| 1 | **Biker on the way** | `assigned` | Customer selected this biker; `agreed_fare` locked. **Live location starts streaming.** |
| 2 | **Details confirmed** | `confirmed` | The biker read the items and note and confirmed them. |
| 3 | **Heading to pickup** | `en_route_pickup` | The biker is travelling to the sender; ETA to pickup. |
| 4 | **Collected** | `picked_up` | Parcel in hand; **photo at pickup** captured. |
| 5 | **On the way** | `en_route_dropoff` | Riding to the receiver; live location continues. |
| 6 | **Delivered** | `delivered` | The receiver gives the **6-digit delivery code**; the biker enters it. |
| 7 | **Rate your biker** | `completed` | Two-way rating. If the customer never rates, the order closes on its own after the rating window. |

> At step 2 the biker can **only confirm**. If something is wrong (item larger than described), the path
> is to **cancel** (a biker cancel counts as a strike), not to renegotiate — the offer loop stays one round.

### How it works
- **State machine.** Each transition writes an `order_events` row; the timeline renders from that
  append-only feed.
- **Live position.** From `assigned` through `delivered`, the biker app sends its GPS on a throttled
  interval (data is expensive — §3.4). The customer subscribes over the WebSocket gateway. Streaming is
  scoped to the active order and stops at `delivered`.
- **Notifications.** Each step also fires a push, so the customer doesn't need the screen open (§3.10).
- **Rating.** Unlocked only after a verified delivery.

---

## 5d. Identity, onboarding & profiles

> Account creation is **low-friction** — phone number + name, verified by a one-time code — while identity
> is made **trustworthy where it matters** (bikers carry strangers' goods) via **automated KYC**. Users can
> view each other's profiles, but a **phone number is never shown except during an active order**.

### Signup (one account)
1. Enter a **phone number** → receive a **6-digit code** and enter it. The verify screen is built for a
   WhatsApp-first send with a per-number SMS fallback, and names the channel the code actually went by
   (`apps/mobile/app/verify.tsx`). The deployment picks the channel (`OTP_CHANNEL`, §3.11).
2. Enter **first and last name**. A national ID is optional for customers and stored **unverified**.
3. You now have a **customer** account — one per person, role-expandable.

### Becoming a biker
"**Become a biker**" adds, on top of the customer account:
- **ID verification by Didit** (ID document + selfie). **Fully automatic, no human in the loop:** Didit's
  verdict decides, and our face-match threshold (`KYC_THRESHOLDS` in `packages/shared/src/policy.ts`)
  can only tighten it. Didit's "In Review" counts as a decline (`apps/api/src/kyc/didit-decision.ts`).
  `kyc_status` moves `pending → verified | failed`, and to `expired` when the ID lapses. Admin only
  **monitors and supports**, with an audited override as a backstop.
- **Bike registration** — stored as entered, not live-checked.
- **Profile photo — required.**
- **Gating:** a biker can go online and take jobs **only once verified**.

### Viewable profiles
**Public name everywhere = first name + last initial** (e.g. "Tendai M."). **Phone never on a profile.**

| Profile | Shows |
|---|---|
| **Biker** | photo · first name + last initial · trips · date joined · rating (avg ★ + count) |
| **Customer** | first name + last initial · optional photo · orders · date joined |

Ratings on profiles are **score + count only**.

### Phone privacy
The **real phone number** is revealed to the counterparty **only while the order is active**, then hidden
again. No proxy/masking layer; the number is gated by order state.

### Editing
- **Name, photo, email** — editable anytime.
- **Phone number** — change requires re-verifying with a code.
- **Verified ID / bike registration** — locked; changing them needs re-verification.

---

## 6. Pricing guide & revenue

**Parcel pricing drives matching, not payment.**
- **Suggested price** = base + per-km × distance, in **USD**, as a guide. The **customer sets the proposed
  price**; bikers **accept it or counter**; the **agreed fare** is the selected offer's amount. The customer
  pays the biker in cash. See [PRICING](PRICING.md).

**Merchant orders** have a fixed delivery fee by distance (`deliveryFeeForDistance`). The customer pays for
the goods and the fee in cash at the door. A venue can choose to fund delivery itself.

**Revenue model: biker commission, prepaid.**
- Lynia takes a **percentage of what the biker earns** on each completed job — a parcel's agreed fare, or a
  merchant job's delivery fee. It comes off the biker's side, never added to the customer's price.
- **Rate: 10%** (`COMMISSION.ratePct`; a deployment can override it with `COMMISSION_RATE_PCT`). A
  biker's **first 10 completed jobs are free**. Every job type counts toward the 10, and every job type is
  charged after.
- **Collection: prepaid per job.** The biker pre-funds a commission wallet; each completed job debits the
  commission. There is **no minimum balance**: a biker is only stopped from taking a job whose commission
  is more than their balance (`canCoverJobCommission`, `packages/shared/src/policy.ts`). No credit risk,
  no collection, no negative balances.
- **Top-ups today are an admin manual credit** after the biker calls support. The in-app top-up screen is
  a real client of the wallet API, but no payment rail can confirm a top-up yet
  ([PAYMENT-RAIL-OUTSTANDING](PAYMENT-RAIL-OUTSTANDING.md)).
- Lynia remains a **matchmaker, not a payment processor**: the fare and the goods money move in cash,
  outside the app.

**Still to calibrate on real data:** the parcel suggested-price curve, the merchant delivery fee, and the
take rate.

---

## 7. How we build

Each surface is built against its design handoff (`packages/design/handoff/`), and every owner decision is
recorded in `docs/DESIGN-DEVIATIONS.md`. Every PR goes through CI (typecheck, lint, tests, schema
constraints, design guardrails). A merge reaches no device on its own: mobile builds are dispatched by hand
(`docs/PLAY-STORE-SUBMISSION.md`), the API releases to Azure through `release-azure.yml`, and the web apps
deploy to Cloudflare Workers. Ops commands: [AZURE-OWNER-RUNBOOK](AZURE-OWNER-RUNBOOK.md).

---

## 8. Success metrics

- Orders per day and week-over-week growth, by order type.
- Delivery completion rate (target ≥ 90%).
- **Offer-loop health:** offers per broadcast, time to first offer, share of broadcasts with ≥ 1 offer,
  customer selection time, re-broadcast rate.
- **Merchant health:** accept rate and time, prep time against the promise, time to find a biker, no-biker
  cancels.
- Median pickup ETA and total delivery time.
- Biker utilisation (jobs per online hour) and wallet top-up rate.
- Repeat-customer rate.
- Commission revenue per completed job.

---

## 9. Open decisions

- **Offer-loop tuning.** The offer window is **90 s** (`OFFER_WINDOW_MS` in `@lynia/shared`). Parcel
  broadcast reach is **nationwide** (`BROADCAST` in `packages/shared/src/policy.ts`, D-99); the old
  5 → 8 → 12 km widening is retired, but the hook remains. Merchant dispatch reaches 15 km, offers the
  first round to 10 bikers, and runs six 60-second rounds (`RESTAURANTS_DISPATCH` in
  `packages/shared/src/restaurants-order.ts`). Calibrate all of these on real data.
- **Penalties.** Automatic behaviour penalties are **suspended** (owner, 2026-10-12). Strikes and
  reliability are still recorded, but no hold, cooldown or cash ban applies while `PENALTIES_SUSPENDED`
  is not `"false"` (`apps/api/src/common/penalties.ts`). The mechanism (every 3rd biker cancel → a 2-hour
  offline cooldown) is built; when to switch it back on is open.
- **Payment rail.** Which mobile-money rail (EcoCash, InnBucks, O'mari) to wire first, and when.
- **Legal / regulatory:** business registration, ZIMRA tax, motorbike commercial-use rules, biker
  licensing and insurance, goods and biker liability, data privacy, pharmacy rules. Verify with a local
  advisor.
- **Brand & language:** English first; Shona/Ndebele later?
- **KYC coverage:** the false-reject rate on genuine Zimbabwean IDs, now that there is no human review band.

---

## 10. Where to look next

- [ARCHITECTURE](ARCHITECTURE.md) — how it is wired.
- [PRICING](PRICING.md) — the fare model and offer ranking.
- [SECURITY](SECURITY.md) and [DATA-RETENTION](DATA-RETENTION.md) — threat model and privacy.
- [PAYMENT-RAIL-OUTSTANDING](PAYMENT-RAIL-OUTSTANDING.md) — the money plumbing still missing.
- `docs/DESIGN-DEVIATIONS.md` — the ledger of owner decisions (the D-numbers cited above).
