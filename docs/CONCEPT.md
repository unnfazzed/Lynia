# Lynia — Concept & One-Month Execution Plan

> **Vision:** a Zimbabwean **superapp** — order groceries, medicals, and food online.
> **Now (MVP):** a fully-formed on-demand **motorbike courier / Express** — pick an item up here,
> deliver it there, by bike. The Express *is* the superapp's spine; verticals layer on later.
> **Payments reality:** Zimbabwe is **cash-based and low-trust**. Lynia is a **matchmaker, not a payment
> processor** — the rider transports the item and never handles money for the goods.
> **Matching is the inDrive model**: the **customer names the price** (system-suggested, adjustable), riders
> **accept or counter**, and the **customer picks the rider** — a price-negotiated bidding marketplace.
> References: Grab Express (point-to-point parcel), **inDrive** (customer-priced, cash-economy marketplace),
> **Relay** (send/receive parcel UX — dual-party contacts, item details, delivery notes).
> Output of a gstack-style **Office Hours** session. Status: **conceptualisation locked, ready for build.**

---

## 1. What Lynia is (MVP)

A two-sided, on-demand logistics marketplace on the **inDrive (customer-priced bidding) model**:

**The core flow:**
1. **Customer** enters pickup + dropoff pins (+ item details) and sees a **system-suggested price**.
2. Customer can **notch the price up or down** (the suggestion is a guide, not a floor) and **broadcasts the request**.
3. **Nearby riders** receive the broadcast and either **accept the offered price** or **counter-offer** their own (one round each — no haggling back and forth).
4. **All interested riders** (those who accepted *and* those who countered) are **displayed to the customer** with price, rating, and ETA.
5. The **customer selects the rider** they want → the job is assigned and they track the rider live.

### Parties, items & payment (Relay-inspired)
- **Send or Receive a package toggle.** The person booking can be **either the sender or the receiver**. Either way, the app captures **both parties' name + phone** (Sender Information *and* Receiver Information) — these are **mandatory** and shown to the rider so they can coordinate pickup and handover.
- **Receiver pays cash on delivery.** The delivery fee is **paid in cash to the rider by the receiver at drop-off** (regardless of who booked). Paynow prepay (by either party) is optional. This keeps Lynia out of the money path and fits the cash economy.
- **Item details pane.** The customer describes what's being shipped via **both** a **structured itemized list** (each item: description + quantity, optional photo) **and** a **free-text note for the rider** (delivery instructions / landmarks), with a **save-note-for-reuse** option.
- **Confirm-details checkout** before broadcast: pickup, drop-off, sender/receiver contacts, items, rider note, and the price summary.

**Other flow facts:**
- **Riders** go online, see open broadcasts nearby, **accept or counter**, and once selected pick up and deliver, updating status along the way; they see **both parties' contacts and the item list/note**.
- **No manual dispatch.** If a broadcast draws **no interested riders** in the time window, it **expires** and the customer is prompted to **nudge the price up and re-broadcast** — fully automatic. Admin only **monitors & supports**.

Both customer and rider live in **one app with a role toggle** (fastest to ship).

**Launch model: A — point-to-point parcel courier.** The sender already has the item; the rider only transports it. No rider cash float, no purchasing risk.

> **Core rule:** the rider handles the **item**, never the **money for the goods**. If the receiver is the
> buyer, they settle payment for the goods with the sender **offline, outside the app** — Lynia is not
> involved. (The **delivery fee** is separate and is paid to the rider on delivery.) This kills the
> "buy-for-me" relay model: in a cash, low-trust market riders don't carry float, so rider-purchasing is
> **off the roadmap** until digital payments mature.

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

> The **structured item list** built for the MVP (above) *is* the line-items seam — it powers COD
> merchant carts later with no rebuild.

---

## 2. Decisions locked (Office Hours)

| Decision | Choice | Notes |
|---|---|---|
| Courier model | **A: point-to-point parcel** | No rider float; simplest trustworthy MVP |
| Rider & money | **Rider handles the item, never goods money** | Goods $ settled sender↔receiver offline; buy-for-me removed |
| Booking initiator | **Send *or* Receive a package** | Initiator can be sender or receiver; **both parties' name + phone mandatory** and rider-visible |
| Who pays the fee | **Receiver pays cash on delivery** | Paid to rider at drop-off regardless of who booked; Paynow prepay optional |
| Monetization | **Cash-first, commission from rider balance** | Fee paid in cash to rider; Lynia takes commission from rider's prepaid balance; Paynow optional |
| Build approach | **Straight to cross-platform app** | Skipping the WhatsApp ops MVP (founder's call) |
| Matching model | **inDrive: customer-priced bidding marketplace** | System suggests → customer adjusts → broadcast → riders accept/counter → customer selects |
| Pricing | **Customer names the price (system-suggested, adjustable)** | Suggestion = base + per-km guide; customer notches up/down; **soft suggestion, no hard floor** |
| Rider response | **Accept or counter — one round each** | Rider accepts the offered price or counters once; **no back-and-forth haggling** |
| Selection | **Customer always selects** | Every interested rider (accept *or* counter) shown with price/rating/ETA; customer picks |
| No-offers fallback | **Expire + customer re-broadcasts (automatic)** | No interested riders → expire, prompt customer to nudge price & re-broadcast; **no manual dispatch** |
| Item details | **Structured item list + free-text rider note** | Itemized (desc + qty, optional photo) *and* a delivery note with save-for-reuse |
| Package protection / insurance | **Out of MVP** | Keep declared-value cap + prohibited-items list only; paid protection is a fast-follow |
| Promos / intro pricing | **Out of MVP** | Promo codes, referrals, intro pricing deferred to a fast-follow |
| Commission (pilot) | **Zero / near-zero to seed supply** | Turn on commission once riders earn daily |
| App packaging | **One app, role toggle** (customer ↔ rider) | Fastest to ship in a month; single Expo codebase |
| Demand wedge | **General "send anything"** | Broad use case, but launch confined to one corridor |
| Platforms | **Android-first**, iOS from same codebase later | Zimbabwe is ~85–90% Android |
| Launch geography | **One Harare corridor** (e.g. CBD + Avenues + Borrowdale/Msasa) | Concentrate supply & ETAs |
| Timeline | **≤ 1 month** to pilot + Play Store | iOS TestFlight only if time allows |

---

## 3. Honest risk register (from Office Hours)

1. **Cold-start (highest risk).** Straight-to-app + general wedge means no demand validation before build. **Mitigation:** recruit 5–15 riders in the launch corridor from day 1 (parallel to the build); keep a WhatsApp + spreadsheet channel as a manual backstop for ops, not as the product's matching path.
2. **Payments (cash-first).** The economy is cash and low-trust. Lynia does **not** process the delivery transaction — the **fee is paid in cash to the rider by the receiver on delivery**. Lynia earns by deducting commission from each rider's **prepaid balance**, topped up via **Paynow/EcoCash**. Paynow fee payment is **optional**, never required. The rider never touches money for the goods.
3. **Receiver-pays-on-delivery friction (new).** The receiver might be absent or refuse to pay at drop-off. **Mitigation:** capture & confirm the receiver's contact at booking; **delivery OTP tied to handover**; rider keeps the item if unpaid; cancellation/no-show policy (§9); allow optional Paynow prepay by the booker for high-trust cases.
4. **Addressing.** No reliable street addresses → rely on **GPS pin + landmark text + phone number**, never typed addresses.
5. **Data cost.** Mobile data is expensive → keep the app light, cache maps, throttle background location.
6. **Trust & safety.** Rider verification (ID + bike reg), item **photo at pickup**, **delivery OTP** at handover, two-way ratings, a **declared-value cap** (pilot: max ~US$100–150/item), and a **prohibited-items list** (cash, illegal/hazardous goods, live animals, anything above cap). Liability for safe handling sits with the rider; platform liability capped in T&Cs. *(Paid insurance is a fast-follow, not MVP.)*
7. **Bidding-model complexity (biggest build item).** The customer-priced offer loop — suggest → adjust → broadcast → accept/counter → display interested riders → select — is the core build. **Mitigation:** build the offer loop first; keep rider response strictly **one round** (no haggle-back).
8. **Lowball / no-offers (pricing risk).** With no hard floor, customers may underprice and get no riders. **Mitigation:** an honest suggested price; an empty-broadcast UX that **prompts a price nudge + re-broadcast**; surface "riders usually accept around $X" hints once there's data.
9. **Timeline.** A polished bidding marketplace is a 3–6 month build. One month = a **brutally scoped** Android MVP in one corridor. Scope discipline is the whole game.
10. **Superapp scope creep.** The "superapp" vision tempts catalogs/merchant onboarding into month one. **Mitigation:** ship only Express now; capture the future solely as cheap data "seams" (§5b).
11. **Comms cost / reach.** Data is expensive and not all users stay online → **SMS fallback** for OTP and critical notifications (push when online, SMS otherwise). Fast rider broadcast alerts are critical — push is primary.

---

## 4. MVP scope

**In scope (must ship):**
- Phone-number auth (OTP); **one app with customer ↔ rider role toggle**.
- Customer: **Send / Receive toggle**; capture **Sender + Receiver info (name + phone, both mandatory)**; set pickup + dropoff pins; **add items (structured list: desc + qty, optional photo)** + a **free-text rider note** (save-for-reuse); see **suggested price**, **adjust it up/down**, **confirm details**, **broadcast**; view **interested riders (accept/counter) with price/rating/ETA**, **select a rider**; **receiver pays delivery fee in cash to rider** (Paynow optional); live tracking, rating.
- Rider: go online/offline, **see open broadcasts nearby & accept or counter (one round)**, see **both parties' contacts + item list/note**, status transitions, share live location, daily earnings, **prepaid commission balance + top-up** (commission off during pilot).
- **Offer loop engine:** order → `open_for_offers` → collect rider accepts/counters within a window → show to customer → **customer selects** → assign; on no offers, **expire + prompt re-broadcast**.
- Admin web dashboard: **monitor orders & riders, support stuck orders** (no manual dispatch in the normal flow).
- Pricing engine: base + per-km (Google distance) as the **suggested** price; customer-adjustable, soft (no hard floor).
- Trust: rider verification (ID + bike reg), **item photo at pickup**, **delivery OTP** at handover, two-way ratings, **declared-value cap + prohibited-items list**.
- Notifications: **push when online, SMS fallback** for OTP & critical updates; **low-latency rider broadcast alerts**.

**Out of scope (removed or fast-follow):**
- ❌ **Package protection / insurance** — declared-value cap only for MVP; paid cover is a fast-follow.
- ❌ **Promo codes / referrals / intro pricing** — fast-follow.
- ❌ **Back-and-forth haggling** — rider response is one round (accept or single counter); customer selects.
- ❌ **Hard price floor / customer-side price caps** — suggestion is soft; market decides.
- ❌ **Manual / admin dispatch as a product path** — no-offers handled by expire + re-broadcast.
- ❌ **Buy-for-me relay / rider float** — removed (cash, low-trust market).
- ❌ **Goods payment between sender & receiver** — settled offline, never in the app.
- Merchant verticals + Cash-on-Delivery, multi-city, scheduled deliveries, in-app chat, advanced fraud tooling, full iOS launch.

---

## 5. Tech architecture

| Layer | Choice | Why |
|---|---|---|
| App (one app, role toggle) | **React Native + Expo (EAS)** | Single codebase + single build, customer ↔ rider toggle, Android now + iOS later |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime = live tracking + offer/broadcast updates; fastest path to MVP |
| Offer loop logic | **Supabase Realtime + Postgres** (broadcast, offers, window/expiry) | Push broadcasts to nearby riders; collect accepts/counters; expire on timeout |
| Maps / routing | **Google Maps Platform** | Best data coverage in Zimbabwe; geocoding, distance, ETA |
| Payments | **Cash-first** + **Paynow** (optional, for rider top-ups & opt-in fee payment) | Receiver pays cash to rider; commission from rider balance; Paynow covers EcoCash/OneMoney/InnBucks/Zipit/Visa |
| Admin dashboard | **Next.js** on the same Supabase backend | Monitoring & support tool (not a dispatch console) |
| Notifications | **Expo Notifications / FCM** + **SMS gateway** (fallback) | Push when online (primary for broadcast alerts); SMS for OTP & critical updates |

### Data model (sketch)
- `profiles` (id, role: customer/rider/merchant/admin, name, phone)
- `riders` (profile_id, vehicle_info, id_verified, is_online, current_lat, current_lng, **commission_balance**, updated_at)
- `orders` (id, order_type[`parcel`], customer_id, rider_id, **initiator_role[`sender`|`receiver`]**, **fee_payer[`receiver`]** (default), **sender_name**, **sender_phone**, **receiver_name**, **receiver_phone**, pickup{lat,lng,landmark}, dropoff{lat,lng,landmark}, **rider_note**, declared_value, size, distance_km, **suggested_fare**, **proposed_fare** (broadcast price), **agreed_fare** (selected offer), currency, fee_method[`cash`|`paynow`], commission, delivery_otp, status, timestamps)
- `order_items` (id, order_id, description, quantity, photo_url) — the structured shipped-items list (also the COD line-items seam)
- `offers` (id, order_id, rider_id, type[`accept`|`counter`], offered_fare, eta_minutes, status[`pending`|`selected`|`declined`|`expired`], at) — the bidding loop
- `saved_notes` (id, user_id, text) — reusable rider notes ("save note to list")
- `order_events` (order_id, status, at) — status history
- `rider_ledger` (rider_id, order_id, type[`commission`|`topup`], amount, currency, paynow_ref, balance_after, at) — the cash/commission backbone
- `ratings` (order_id, by, score, comment)

### Order status flow
`requested → open_for_offers → assigned → picked_up → en_route → delivered (OTP verified) → completed` (plus `cancelled` and `expired`). The customer fills sender/receiver contacts + items + note, sets `proposed_fare` (from the adjustable `suggested_fare`), confirms details and broadcasts → `open_for_offers`. Riders submit `offers` (`accept` at the proposed price or a `counter`); all `pending` offers are shown to the customer, who **selects one** → that offer becomes `selected`, its fare becomes `agreed_fare`, `rider_id` is set, status → `assigned`. If the window lapses with no offers (or no selection), status → `expired` and the customer is prompted to nudge the price and re-broadcast. At drop-off the **receiver pays the agreed fare in cash to the rider** and the **delivery OTP** is verified (or Paynow if prepaid); platform commission (zero during pilot) is deducted from the rider's balance on `completed`.

---

## 5b. Superapp "seams" baked into the MVP (cheap now, saves a rewrite)

Low-cost data decisions so grocery/pharmacy/food plug in later as **additive order types**, not migrations:

1. **Generic `orders`** with an `order_type` enum — `parcel` at launch; `merchant` reserved (for COD verticals).
2. **`order_items` from day one** — the structured item list shipped in the MVP **is** the line-items seam; COD merchant carts reuse it directly.
3. **`rider_ledger` from day one** — the commission/cash backbone; later extends to merchant settlements and any wallet, no rebuild.
4. **Stubbed `merchants`** table + optional `merchant_id` on orders (unused at launch; powers COD verticals later).
5. **Saved `addresses`** (address book) per user — needed for repeat grocery/food anyway.
6. **One identity, expandable roles** — customer / rider / merchant / admin from day one.

> Cost: a few enum columns + one stub table. Benefit: verticals are additive, not a rewrite.

---

## 6. Unit economics (framework — validate with real orders)

- **Suggested price** = base + (per-km rate × distance), shown in **USD** as a guide. The **customer sets the proposed price** (notch up/down, no hard floor); riders **accept or counter**, and the **agreed fare** is the selected offer's amount.
- **Cash-first flow:** the **receiver pays the agreed fare in cash to the rider on delivery**. Lynia's commission per completed delivery is **deducted from the rider's prepaid balance** (`rider_ledger`); riders **top up via Paynow/EcoCash**.
- **Pilot commission = 0% (or token)** to seed supply. Target **~15–20%** once liquidity is proven — track take-rate vs. rider top-up friction.
- **No platform float to reconcile:** Lynia never holds the delivery transaction or the goods money — it only tracks rider commission balances. This is what makes the cash economy workable.

*Placeholder to test: suggested base $1.50 + $0.50/km, commission 0% at pilot → ~18% later — replace with corridor-validated numbers.*

---

## 7. One-month plan (revised for straight-to-app)

**Week 1 — Foundations + parallel recruitment**
- Scaffold: Expo app shell (**role toggle**), Supabase schema (incl. `offers`, `order_items`, `rider_ledger`), Next.js admin app, repo CI.
- Customer happy-path skeleton: auth, **Send/Receive toggle, sender+receiver contacts**, pickup/dropoff pins, **item list + rider note**, **suggested + adjustable price**, confirm-details screen.
- Open Paynow merchant account (for **rider top-ups**); register the business; draft rider agreement + declared-value/prohibited-items policy.
- **Recruit 5–15 riders** in the launch corridor.

**Week 2 — The offer loop (core differentiator)**
- Broadcast → `open_for_offers` → **riders accept/counter (one round)** → **interested riders displayed** → **customer selects** → assigned.
- Rider job view shows **both contacts + item list/note**; no-offers expire + **re-broadcast prompt**; item photo upload; push + **SMS** wired.

**Week 3 — Fulfilment + cash backbone + live tracking**
- Rider: status transitions, **live location sharing**, earnings view.
- **`rider_ledger`** + Paynow top-up flow (commission 0% at pilot but plumbed).
- **Delivery OTP** handover + **receiver cash payment** confirmation, customer-side realtime tracking, two-way ratings, cancellation/no-show policy.

**Week 4 — Pilot, harden, ship**
- Real orders through the app in the corridor; fix top breakages; tune offer-window length & broadcast radius on real supply.
- **Google Play** submission. iOS TestFlight if time allows.

---

## 8. Success metrics (pilot)

- Orders/day and week-over-week growth in the corridor.
- Delivery completion rate (target ≥ 90%).
- **Offer-loop health:** offers per broadcast, time-to-first-offer, share of broadcasts that get ≥1 offer, customer selection time, re-broadcast rate.
- **Payment-on-delivery success rate** (share of completed handovers paid without dispute).
- Median pickup ETA and total delivery time.
- Rider utilization (jobs per online hour).
- Repeat-customer rate.
- Gross margin per order.

---

## 9. Open decisions (pending — to resolve in Plan stage)

- **Offer-loop tuning:** broadcast radius, offer-window length, max offers shown, offer/selection expiry timers — calibrate on real corridor supply.
- **Cancellation / no-show & non-payment policy** in a cash, receiver-pays model (hard to charge fees) — define enforcement.
- **Legal / regulatory:** business registration, ZIMRA tax, motorbike commercial-use rules, rider licensing & insurance, goods/rider liability, data privacy. Verify with a local advisor before *public* launch.
- **Brand & language:** is "Lynia" the final consumer name? English first; Shona/Ndebele later?
- **Launch corridor:** which specific Harare suburbs go first?
- **SMS gateway:** which local aggregator for OTP/notifications?
- **Insurance (fast-follow):** insurer/underwriting model + how a protection fee is collected in a cash flow.

---

## 10. Next steps (gstack flow)

- ✅ **Think → Office Hours** (this doc).
- ⬜ **Plan → `/plan-ceo-review`** — pressure-test the business/economics.
- ⬜ **Plan → `/plan-eng-review`** — validate architecture & data model.
- ⬜ **Build** — scaffold the Expo app + Supabase backend + admin dashboard.

> Note: gstack skills (`/plan-ceo-review`, etc.) require gstack installed locally; until then these can be run manually.
