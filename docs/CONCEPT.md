# Lynia — Concept & One-Month Execution Plan

> **Vision:** a Zimbabwean **superapp** — order groceries, medicals, and food online.
> **Now (MVP):** a fully-formed on-demand **motorbike courier / Express** — pick an item up here,
> deliver it there, by bike. The Express *is* the superapp's spine; verticals layer on later.
> **Payments reality:** Zimbabwe is **cash-based and low-trust**. Lynia is a **matchmaker, not a payment
> processor** (the **inDrive** model) — the rider transports the item and never handles money for the goods.
> References: Grab Express (point-to-point parcel), inDrive (cash-economy marketplace in Zimbabwe).
> Output of a gstack-style **Office Hours** session. Status: **conceptualisation locked, ready for build.**

---

## 1. What Lynia is (MVP)

A two-sided, on-demand logistics marketplace:

- **Customers** request a delivery: set a pickup pin + a dropoff pin, describe the item, get an instant price quote, pay, and track the rider live.
- **Riders** (motorbike) receive jobs, accept, pick up, and deliver, updating status along the way.
- **Dispatch (us)** monitors and assigns via a simple web dashboard.

**Launch model: A — point-to-point parcel courier.** The sender already has the item; the rider only transports it. No rider cash float, no purchasing risk.

> **Core rule:** the rider handles the **item**, never the **money for the goods**. If the receiver is the
> buyer, they settle payment for the goods with the sender **offline, outside the app** — Lynia is not
> involved. This kills the "buy-for-me" relay model: in a cash, low-trust market riders don't carry float,
> so rider-purchasing is **off the roadmap** until digital payments mature.

---

## 1b. Superapp vision & sequencing

Lynia's endgame is a **superapp** (groceries + medicals + food). Every successful superapp
(Grab, Gojek, WeChat, Careem) started as **one thing done exceptionally**, then layered verticals
onto a shared **spine**. Lynia's spine, built by a fully-formed Express:

> **① one identity · ② one logistics & rider fleet · ③ one location/address book · ④ one commission/cash backbone.**

**The ladder (cash-economy version — each rung reuses the one below):**
1. **Express / parcel** (month 1 MVP) — rider *transports* an item; goods money settled offline. Builds the spine.
2. **Merchant verticals via Cash-on-Delivery** — **pharmacy → grocery → food** (proposed order; settle in Plan
   stage). The **merchant** holds & packs the goods, the **rider only delivers**, the **customer pays
   cash-on-delivery** (to merchant or rider) or Paynow if they choose. **COD is the bridge to commerce** —
   the rider still never buys anything.

> ❌ **"Buy-for-me" relay is removed** — it requires rider float and trust the market doesn't have.
> COD replaces it entirely.

**Discipline:** month one ships **only Express**. The superapp vision changes how we *name and shape
the data*, not *what we ship now*. Design the seams, don't build the rooms (see §5b).

---

## 2. Decisions locked (Office Hours)

| Decision | Choice | Notes |
|---|---|---|
| Courier model | **A: point-to-point parcel** | No rider float; simplest trustworthy MVP |
| Rider & money | **Rider handles the item, never goods money** | Goods $ settled sender↔receiver offline; buy-for-me removed |
| Monetization | **Cash-first, inDrive-style commission** | Customer pays delivery fee in cash to rider; Lynia takes commission from rider's prepaid balance; Paynow optional |
| Build approach | **Straight to cross-platform app** | Skipping the WhatsApp ops MVP (founder's call) |
| Demand wedge | **General "send anything"** | Broad use case, but launch confined to one corridor |
| Platforms | **Android-first**, iOS from same codebase later | Zimbabwe is ~85–90% Android |
| Launch geography | **One Harare corridor** (e.g. CBD + Avenues + Borrowdale/Msasa) | Concentrate supply & ETAs |
| Timeline | **≤ 1 month** to pilot + Play Store | iOS TestFlight only if time allows |

---

## 3. Honest risk register (from Office Hours)

1. **Cold-start (highest risk).** Straight-to-app + general wedge means no demand validation before build. **Mitigation:** recruit 5–15 riders in the launch corridor from day 1 (parallel to the build); keep a WhatsApp + spreadsheet dispatch as a fallback channel.
2. **Payments (cash-first).** The economy is cash and low-trust. Lynia does **not** process the delivery transaction — **cash is paid directly to the rider** (inDrive model). Lynia earns by deducting commission from each rider's **prepaid balance**, topped up via **Paynow/EcoCash**. Paynow delivery-fee payment is **optional** for customers who can, never required. The rider never touches money for the goods.
3. **Addressing.** No reliable street addresses → rely on **GPS pin + landmark text + phone number**, never typed addresses.
4. **Data cost.** Mobile data is expensive → keep the app light, cache maps, throttle background location.
5. **Trust & safety.** Rider vetting, item photos, ratings, and a cancellation/no-show policy from day 1.
6. **Timeline.** A polished two-app marketplace is a 3–6 month build. One month = a **brutally scoped** Android MVP in one corridor. Scope discipline is the whole game.
7. **Superapp scope creep (new).** The "superapp" vision will tempt catalogs/merchant onboarding/multi-vertical UI into month one. **Mitigation:** ship only Express now; capture the future solely as cheap data "seams" (§5b), never as features.

---

## 4. MVP scope

**In scope (must ship):**
- Phone-number auth (OTP).
- Customer: create delivery (pickup pin, dropoff pin, item description + photo, size category), instant quote, **delivery fee paid in cash to rider** (Paynow optional), live tracking, rating.
- Rider mode: go online/offline, receive & accept jobs, status transitions, share live location, daily earnings, **prepaid commission balance + top-up**.
- Dispatch web dashboard: see orders, assign/reassign riders, monitor status.
- Pricing engine: base fare + per-km (Google distance); commission deducted from rider balance per completed job.
- Trust: rider verification (ID + bike reg), item photo at pickup, **delivery OTP** for handover, two-way ratings.
- Push notifications (order updates).

**Out of scope (removed or fast-follow):**
- ❌ **Buy-for-me relay / rider float** — removed (cash, low-trust market).
- ❌ **Goods payment between sender & receiver** — settled offline, never in the app.
- Merchant verticals + Cash-on-Delivery (the commerce fast-follow), multi-city, scheduled deliveries, in-app chat, promotions/referrals, advanced fraud tooling, full iOS launch.

---

## 5. Tech architecture

| Layer | Choice | Why |
|---|---|---|
| App (customer + rider modes) | **React Native + Expo (EAS)** | One codebase, Android now + iOS later, maps/push/OTA updates |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime = live tracking; fastest path to MVP |
| Maps / routing | **Google Maps Platform** | Best data coverage in Zimbabwe; geocoding, distance, ETA |
| Payments | **Cash-first** + **Paynow** (optional, for rider top-ups & opt-in fee payment) | inDrive model: cash to rider, commission from rider balance; Paynow covers EcoCash/OneMoney/InnBucks/Zipit/Visa |
| Dispatch dashboard | **Next.js** on the same Supabase backend | Fast internal web tool |
| Push | **Expo Notifications / FCM** | Order status updates |

### Data model (sketch)
- `profiles` (id, role: customer/rider/merchant/admin, name, phone)
- `riders` (profile_id, vehicle_info, id_verified, is_online, current_lat, current_lng, **commission_balance**, updated_at)
- `orders` (id, order_type[`parcel`], customer_id, rider_id, pickup{lat,lng,landmark,contact}, dropoff{...}, item_desc, item_photo_url, size, distance_km, delivery_fee, currency, fee_method[`cash`|`paynow`], commission, delivery_otp, status, timestamps)
- `order_events` (order_id, status, at) — status history
- `rider_ledger` (rider_id, order_id, type[`commission`|`topup`], amount, currency, paynow_ref, balance_after, at) — the cash/commission backbone
- `ratings` (order_id, by, score, comment)

### Order status flow
`requested → quoted → searching_rider → assigned → picked_up → en_route → delivered (OTP verified) → completed` (plus `cancelled`). Delivery fee is collected **in cash by the rider** at handover (or Paynow if opted in); platform commission is deducted from the rider's balance on `completed`.

---

## 5b. Superapp "seams" baked into the MVP (cheap now, saves a rewrite)

Low-cost data decisions so grocery/pharmacy/food plug in later as **additive order types**, not migrations:

1. **Generic `orders`** with an `order_type` enum — `parcel` at launch; `merchant` reserved (for COD verticals). Use **line-items**, not a single hard-coded item field.
2. **`rider_ledger` from day one** — the commission/cash backbone. Already needed for MVP monetization; later extends to merchant settlements and any wallet, with no rebuild.
3. **Stubbed `merchants`** table + optional `merchant_id` on orders (unused at launch; powers COD verticals later).
4. **Saved `addresses`** (address book) per user — needed for repeat grocery/food anyway.
5. **One identity, expandable roles** — customer / rider / merchant / admin from day one.

> Cost: a few enum columns + one stub table. Benefit: verticals are additive, not a rewrite.

---

## 6. Unit economics (framework — validate with real orders)

- **Price** = base fare + (per-km rate × distance). Display in **USD** (de-facto pricing currency).
- **Cash-first flow:** customer pays the delivery fee **in cash to the rider** at handover. Lynia takes a **commission** per completed delivery, **deducted from the rider's prepaid balance** (`rider_ledger`). When the balance is low/zero, the rider **tops up via Paynow/EcoCash** to keep getting jobs.
- **No platform float to reconcile:** Lynia never holds the delivery transaction or the goods money — it only tracks rider commission balances. This is what makes the cash economy workable.
- **Commission take:** ~**15–20%** of the delivery fee (tune after pilot). Track effective take-rate vs. rider top-up friction.

*Placeholder to test: base $1.50 + $0.50/km, ~18% commission — replace with corridor-validated numbers.*

---

## 7. One-month plan (revised for straight-to-app)

**Week 1 — Foundations + parallel recruitment**
- Scaffold: Expo app shell, Supabase schema, Next.js dispatch app, repo CI.
- Customer happy-path skeleton: auth, set pickup/dropoff pins, price quote.
- Open Paynow merchant account (for **rider top-ups**); register the business; draft rider agreement.
- **Recruit 5–15 riders** in the launch corridor.

**Week 2 — Customer flow end-to-end**
- Create order → quote → **delivery fee = cash to rider** (Paynow optional) → order status → item photo upload.
- Dispatch dashboard: assign riders. Push notifications wired.

**Week 3 — Rider mode + cash backbone + live tracking**
- Rider: accept jobs, status transitions, **live location sharing**, earnings view.
- **`rider_ledger`: commission deducted per completed job + Paynow top-up flow.**
- **Delivery OTP** handover, customer-side realtime tracking, two-way ratings, cancellation/no-show policy.

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
