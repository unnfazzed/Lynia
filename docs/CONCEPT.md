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

A two-sided, on-demand logistics marketplace with a **rider-offer (bidding) model**:

- **Customers** request a delivery: set pickup + dropoff pins, describe the item (+ photo), and see a **suggested fare** they can adjust. Nearby riders respond with their **own offered fares**; the customer **picks a rider** from the list (name, rating, ETA, fare), then tracks them live.
- **Riders** (motorbike) see open jobs nearby, **submit a fare offer**, and once chosen pick up and deliver, updating status along the way.
- **Dispatch (us)** monitors all orders and can **manually assign as a fallback** when no rider offers (thin supply) or to override.

Both customer and rider live in **one app with a role toggle** (fastest to ship).

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
| Pricing model | **Suggested fare + rider offers; customer picks rider** | App suggests base+per-km; riders counter with their fare (inDrive "offers"); customer selects |
| Matching / dispatch | **Rider-offer marketplace; manual admin dispatch as fallback** | Customer selection IS the match; admin assigns only when no offers / to override |
| Commission (pilot) | **Zero / near-zero to seed supply** | Turn on commission once riders earn daily; avoids choking recruitment |
| App packaging | **One app, role toggle** (customer ↔ rider) | Fastest to ship in a month; single Expo codebase |
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
5. **Trust & safety.** Rider verification (ID + bike reg), item **photo at pickup**, **delivery OTP** at handover, two-way ratings, a **declared-value cap** (pilot: max ~US$100–150/item), and a **prohibited-items list** (cash, illegal/hazardous goods, live animals, anything above cap). Liability for safe handling sits with the rider; platform liability capped in T&Cs.
6. **Bidding-model complexity (new).** The rider-offer/customer-selects flow is the **biggest build item** (offers table, open-for-offers state, rider bid screen, customer selection screen). **Mitigation:** build the offer loop first and lean on manual dispatch as the safety net while it stabilizes.
7. **Timeline.** A polished marketplace is a 3–6 month build. One month = a **brutally scoped** Android MVP in one corridor. Scope discipline is the whole game.
8. **Superapp scope creep.** The "superapp" vision will tempt catalogs/merchant onboarding/multi-vertical UI into month one. **Mitigation:** ship only Express now; capture the future solely as cheap data "seams" (§5b), never as features.
9. **Comms cost / reach (new).** Data is expensive and not all users stay online → **SMS fallback** for OTP and critical notifications (push when online, SMS otherwise); offline-tolerant order creation.

---

## 4. MVP scope

**In scope (must ship):**
- Phone-number auth (OTP); **one app with customer ↔ rider role toggle**.
- Customer: create delivery (pickup pin, dropoff pin, item description + photo, size category), see **suggested fare (base + per-km)**, receive **rider offers**, **pick a rider**, pay **delivery fee in cash to rider** (Paynow optional), live tracking, rating.
- Rider: go online/offline, **see open jobs nearby & submit a fare offer**, status transitions, share live location, daily earnings, **prepaid commission balance + top-up** (commission off during pilot).
- Dispatch web dashboard: see orders, **manually assign as fallback**, monitor status.
- Pricing engine: base + per-km (Google distance) as the suggested fare; rider offers on top.
- Trust: rider verification (ID + bike reg), **item photo at pickup**, **delivery OTP** at handover, two-way ratings, **declared-value cap + prohibited-items list**.
- Notifications: **push when online, SMS fallback** for OTP & critical updates.

**Out of scope (removed or fast-follow):**
- ❌ **Buy-for-me relay / rider float** — removed (cash, low-trust market).
- ❌ **Goods payment between sender & receiver** — settled offline, never in the app.
- Merchant verticals + Cash-on-Delivery (the commerce fast-follow), multi-city, scheduled deliveries, in-app chat, promotions/referrals, advanced fraud tooling, full iOS launch.

---

## 5. Tech architecture

| Layer | Choice | Why |
|---|---|---|
| App (one app, role toggle) | **React Native + Expo (EAS)** | Single codebase + single build, customer ↔ rider toggle, Android now + iOS later |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime = live tracking; fastest path to MVP |
| Maps / routing | **Google Maps Platform** | Best data coverage in Zimbabwe; geocoding, distance, ETA |
| Payments | **Cash-first** + **Paynow** (optional, for rider top-ups & opt-in fee payment) | inDrive model: cash to rider, commission from rider balance; Paynow covers EcoCash/OneMoney/InnBucks/Zipit/Visa |
| Dispatch dashboard | **Next.js** on the same Supabase backend | Fast internal web tool |
| Notifications | **Expo Notifications / FCM** + **SMS gateway** (fallback) | Push when online; SMS for OTP & critical updates |

### Data model (sketch)
- `profiles` (id, role: customer/rider/merchant/admin, name, phone)
- `riders` (profile_id, vehicle_info, id_verified, is_online, current_lat, current_lng, **commission_balance**, updated_at)
- `orders` (id, order_type[`parcel`], customer_id, rider_id, pickup{lat,lng,landmark,contact}, dropoff{...}, item_desc, item_photo_url, declared_value, size, distance_km, suggested_fare, agreed_fare, currency, fee_method[`cash`|`paynow`], commission, delivery_otp, status, timestamps)
- `offers` (id, order_id, rider_id, offered_fare, eta_minutes, status[`pending`|`selected`|`declined`|`expired`], at) — the bidding loop
- `order_events` (order_id, status, at) — status history
- `rider_ledger` (rider_id, order_id, type[`commission`|`topup`], amount, currency, paynow_ref, balance_after, at) — the cash/commission backbone
- `ratings` (order_id, by, score, comment)

### Order status flow
`requested → open_for_offers → offer_selected → assigned → picked_up → en_route → delivered (OTP verified) → completed` (plus `cancelled`; `manually_assigned` is a fallback path into `assigned`). Riders submit `offers` during `open_for_offers`; the customer selects one (`agreed_fare`). Delivery fee is paid **in cash to the rider** at handover (or Paynow if opted in); platform commission (zero during pilot) is deducted from the rider's balance on `completed`.

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

- **Suggested fare** = base + (per-km rate × distance), shown in **USD**. Riders may **offer** above/below; the **agreed fare** is what the customer accepts.
- **Cash-first flow:** customer pays the agreed fee **in cash to the rider** at handover. Lynia's commission per completed delivery is **deducted from the rider's prepaid balance** (`rider_ledger`); riders **top up via Paynow/EcoCash**.
- **Pilot commission = 0% (or token)** to seed supply. Target **~15–20%** once liquidity is proven — track take-rate vs. rider top-up friction.
- **No platform float to reconcile:** Lynia never holds the delivery transaction or the goods money — it only tracks rider commission balances. This is what makes the cash economy workable.

*Placeholder to test: suggested base $1.50 + $0.50/km, commission 0% at pilot → ~18% later — replace with corridor-validated numbers.*

---

## 7. One-month plan (revised for straight-to-app)

**Week 1 — Foundations + parallel recruitment**
- Scaffold: Expo app shell (**role toggle**), Supabase schema (incl. `offers`, `rider_ledger`), Next.js dispatch app, repo CI.
- Customer happy-path skeleton: auth, set pickup/dropoff pins, **suggested fare**.
- Open Paynow merchant account (for **rider top-ups**); register the business; draft rider agreement + declared-value/prohibited-items policy.
- **Recruit 5–15 riders** in the launch corridor.

**Week 2 — The offer loop (core differentiator)**
- Create order → `open_for_offers` → **riders submit fare offers** → customer **picks a rider** → assigned.
- Item photo upload; **manual-assign fallback** in the dispatch dashboard; push + **SMS** wired.

**Week 3 — Fulfilment + cash backbone + live tracking**
- Rider: status transitions, **live location sharing**, earnings view.
- **`rider_ledger`** + Paynow top-up flow (commission 0% at pilot but plumbed).
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

## 9. Open decisions (pending — to resolve in Plan stage)

- **Legal / regulatory:** business registration, ZIMRA tax, motorbike commercial-use rules, rider licensing & insurance, goods/rider liability, data privacy. Verify with a local advisor before *public* launch (not a blocker for a closed pilot).
- **Brand & language:** is "Lynia" the final consumer name? English first; Shona/Ndebele later?
- **Launch corridor:** which specific Harare suburbs go first (drives rider recruitment + demand seeding)?
- **SMS gateway:** which local aggregator for OTP/notifications?
- **Confirm matching reconciliation:** rider-offer marketplace as primary match + manual admin dispatch as fallback (assumed from Office Hours — confirm).
- **Cancellation/no-show enforcement** in a cash model (hard to charge fees) — policy TBD.

---

## 10. Next steps (gstack flow)

- ✅ **Think → Office Hours** (this doc).
- ⬜ **Plan → `/plan-ceo-review`** — pressure-test the business/economics.
- ⬜ **Plan → `/plan-eng-review`** — validate architecture & data model.
- ⬜ **Build** — scaffold the Expo app + Supabase backend + dispatch dashboard.

> Note: gstack skills (`/plan-ceo-review`, etc.) require gstack installed locally; until then these can be run manually.
