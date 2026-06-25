# Lynia — Concept & One-Month Execution Plan

> **Vision:** a Zimbabwean **superapp** — order groceries, medicals, and food online.
> **Now (MVP):** a fully-formed on-demand **motorbike courier / Express** — pick an item up here,
> deliver it there, by bike. The Express *is* the superapp's spine; verticals layer on later.
> References: Grab Express (point-to-point parcel), Chowdeck Relay (buy-for-me).
> Output of a gstack-style **Office Hours** session. Status: **conceptualisation locked, ready for build.**

---

## 1. What Lynia is (MVP)

A two-sided, on-demand logistics marketplace:

- **Customers** request a delivery: set a pickup pin + a dropoff pin, describe the item, get an instant price quote, pay, and track the rider live.
- **Riders** (motorbike) receive jobs, accept, pick up, and deliver, updating status along the way.
- **Dispatch (us)** monitors and assigns via a simple web dashboard.

**Launch model: A — point-to-point parcel courier.** The sender already has the item; the rider only transports it. No rider cash float, no purchasing risk. (The "buy-for-me" relay model is an explicit **fast-follow**, not in the one-month MVP.)

---

## 1b. Superapp vision & sequencing

Lynia's endgame is a **superapp** (groceries + medicals + food). Every successful superapp
(Grab, Gojek, WeChat, Careem) started as **one thing done exceptionally**, then layered verticals
onto a shared **spine**. Lynia's spine, built by a fully-formed Express:

> **① one identity · ② one wallet/payments · ③ one logistics & rider fleet · ④ one location/address book.**

**The ladder (each rung reuses the one below):**
1. **Express / parcel** (month 1 MVP) — rider *transports* an item. Builds the entire spine.
2. **"Buy-for-me" relay** (fast-follow) — rider *purchases* on the customer's behalf. The bridge to
   commerce: adds in-app purchasing + wallet/float, *no merchant integration yet*.
3. **Merchant-integrated verticals** — **pharmacy → grocery → food** (proposed order; settle in Plan
   stage). Each adds a catalog on top of relay's purchasing rails.

**Discipline:** month one ships **only Express**. The superapp vision changes how we *name and shape
the data*, not *what we ship now*. Design the seams, don't build the rooms (see §5b).

---

## 2. Decisions locked (Office Hours)

| Decision | Choice | Notes |
|---|---|---|
| Courier model | **A: point-to-point parcel** | No rider float; simplest trustworthy MVP |
| Build approach | **Straight to cross-platform app** | Skipping the WhatsApp ops MVP (founder's call) |
| Demand wedge | **General "send anything"** | Broad use case, but launch confined to one corridor |
| Platforms | **Android-first**, iOS from same codebase later | Zimbabwe is ~85–90% Android |
| Launch geography | **One Harare corridor** (e.g. CBD + Avenues + Borrowdale/Msasa) | Concentrate supply & ETAs |
| Timeline | **≤ 1 month** to pilot + Play Store | iOS TestFlight only if time allows |

---

## 3. Honest risk register (from Office Hours)

1. **Cold-start (highest risk).** Straight-to-app + general wedge means no demand validation before build. **Mitigation:** recruit 5–15 riders in the launch corridor from day 1 (parallel to the build); keep a WhatsApp + spreadsheet dispatch as a fallback channel.
2. **Payments.** Global processors don't work in Zimbabwe. Must use **Paynow** (EcoCash/OneMoney/InnBucks/Zipit/Visa) + **cash-on-delivery**.
3. **Addressing.** No reliable street addresses → rely on **GPS pin + landmark text + phone number**, never typed addresses.
4. **Data cost.** Mobile data is expensive → keep the app light, cache maps, throttle background location.
5. **Trust & safety.** Rider vetting, item photos, ratings, and a cancellation/no-show policy from day 1.
6. **Timeline.** A polished two-app marketplace is a 3–6 month build. One month = a **brutally scoped** Android MVP in one corridor. Scope discipline is the whole game.
7. **Superapp scope creep (new).** The "superapp" vision will tempt catalogs/merchant onboarding/multi-vertical UI into month one. **Mitigation:** ship only Express now; capture the future solely as cheap data "seams" (§5b), never as features.

---

## 4. MVP scope

**In scope (must ship):**
- Phone-number auth (OTP).
- Customer: create delivery (pickup pin, dropoff pin, item description + photo, size category), instant quote, pay (Paynow + COD), live tracking, rating.
- Rider mode: go online/offline, receive & accept jobs, status transitions, share live location, daily earnings.
- Dispatch web dashboard: see orders, assign/reassign riders, monitor status.
- Pricing engine: base fare + per-km (Google distance).
- Push notifications (order updates).

**Out of scope (fast-follow):**
- Buy-for-me relay + rider wallets/float.
- Multi-city, scheduled deliveries, in-app chat, promotions/referrals, advanced fraud tooling, full iOS launch.

---

## 5. Tech architecture

| Layer | Choice | Why |
|---|---|---|
| App (customer + rider modes) | **React Native + Expo (EAS)** | One codebase, Android now + iOS later, maps/push/OTA updates |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime = live tracking; fastest path to MVP |
| Maps / routing | **Google Maps Platform** | Best data coverage in Zimbabwe; geocoding, distance, ETA |
| Payments | **Paynow Zimbabwe API** + cash-on-delivery | Covers EcoCash/OneMoney/InnBucks/Zipit/Visa |
| Dispatch dashboard | **Next.js** on the same Supabase backend | Fast internal web tool |
| Push | **Expo Notifications / FCM** | Order status updates |

### Data model (sketch)
- `profiles` (id, role: customer/rider/admin, name, phone)
- `riders` (profile_id, vehicle_info, is_online, current_lat, current_lng, updated_at)
- `orders` (id, customer_id, rider_id, pickup{lat,lng,landmark,contact}, dropoff{...}, item_desc, item_photo_url, size, distance_km, price, currency, payment_method, payment_status, status, timestamps)
- `order_events` (order_id, status, at) — status history
- `payments` (order_id, paynow_ref, amount, currency, status)
- `ratings` (order_id, by, score, comment)

### Order status flow
`requested → quoted → paid|awaiting_cod → searching_rider → assigned → picked_up → en_route → delivered → completed` (plus `cancelled`).

---

## 5b. Superapp "seams" baked into the MVP (cheap now, saves a rewrite)

Low-cost data decisions so grocery/pharmacy/food plug in later as **additive order types**, not migrations:

1. **Generic `orders`** with an `order_type` enum — `parcel` at launch; `relay`, `merchant` reserved. Use **line-items**, not a single hard-coded item field.
2. **Ledger-friendly `payments`** — design so it can become a wallet/ledger later; don't build the wallet now.
3. **Stubbed `merchants`** table + optional `merchant_id` on orders (unused at launch).
4. **Saved `addresses`** (address book) per user — needed for repeat grocery/food anyway.
5. **One identity, expandable roles** — customer / rider / merchant / admin from day one.

> Cost: a few enum columns + one stub table. Benefit: verticals are additive, not a rewrite.

---

## 6. Unit economics (framework — validate with real orders)

- **Price** = base fare + (per-km rate × distance). Display in **USD** (de-facto pricing currency); settle via EcoCash in USD/ZiG.
- **Rider split:** ~**80%** to rider / **20%** platform take (tune after pilot).
- **Payouts:** batched EcoCash transfers (daily/weekly). Model A means we only owe riders their earnings — no float to reconcile.
- Track gross margin per order after payment-processing fees.

*Placeholder to test: base $1.50 + $0.50/km — replace with corridor-validated numbers.*

---

## 7. One-month plan (revised for straight-to-app)

**Week 1 — Foundations + parallel recruitment**
- Scaffold: Expo app shell, Supabase schema, Next.js dispatch app, repo CI.
- Customer happy-path skeleton: auth, set pickup/dropoff pins, price quote.
- Open Paynow merchant account; register the business; draft rider agreement.
- **Recruit 5–15 riders** in the launch corridor.

**Week 2 — Customer flow end-to-end**
- Create order → quote → **Paynow payment + COD** → order status → item photo upload.
- Dispatch dashboard: assign riders. Push notifications wired.

**Week 3 — Rider mode + live tracking**
- Rider: accept jobs, status transitions, **live location sharing**, earnings view.
- Customer-side realtime tracking. Ratings. Cancellation/no-show policy.

**Week 4 — Pilot, harden, ship**
- Real orders through the app in the corridor; fix top breakages.
- **Google Play** submission. iOS TestFlight if time allows.

---

## 8. Success metrics (pilot)

- Orders/day and week-over-week growth in the corridor.
- Delivery completion rate (target ≥ 90%).
- Median pickup ETA and total delivery time.
- Rider utilization (jobs per online hour).
- Repeat-customer rate.
- Gross margin per order.

---

## 9. Next steps (gstack flow)

- ✅ **Think → Office Hours** (this doc).
- ⬜ **Plan → `/plan-ceo-review`** — pressure-test the business/economics.
- ⬜ **Plan → `/plan-eng-review`** — validate architecture & data model.
- ⬜ **Build** — scaffold the Expo app + Supabase backend + dispatch dashboard.

> Note: gstack skills (`/plan-ceo-review`, etc.) require gstack installed locally; until then these can be run manually.
