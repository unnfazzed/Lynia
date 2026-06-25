# Lynia — Concept & One-Month Execution Plan

> **Vision:** a Zimbabwean **superapp** — order groceries, medicals, and food online.
> **Now (MVP):** a fully-formed on-demand **motorbike courier / Express** — pick an item up here,
> deliver it there, by bike. The Express *is* the superapp's spine; verticals layer on later.
> **Payments reality:** Zimbabwe is **cash-based and low-trust**. Lynia is a **matchmaker, not a payment
> processor** — the rider transports the item and never handles money for the goods.
> **Matching is the inDrive model**: the **customer names the price** (system-suggested, adjustable), riders
> **accept or counter**, and the **customer picks the rider** — a price-negotiated bidding marketplace.
> References: Grab Express (point-to-point parcel), **inDrive** (customer-priced, cash-economy marketplace).
> Output of a gstack-style **Office Hours** session. Status: **conceptualisation locked, ready for build.**

---

## 1. What Lynia is (MVP)

A two-sided, on-demand logistics marketplace on the **inDrive (customer-priced bidding) model**:

**The core flow:**
1. **Customer** enters pickup + dropoff pins (+ item description/photo) and sees a **system-suggested price**.
2. Customer can **notch the price up or down** (the suggestion is a guide, not a floor) and **broadcasts the request**.
3. **Nearby riders** receive the broadcast and either **accept the offered price** or **counter-offer** their own (one round each — no haggling back and forth).
4. **All interested riders** (those who accepted *and* those who countered) are **displayed to the customer** with price, rating, and ETA.
5. The **customer selects the rider** they want → the job is assigned and they track the rider live.

- **Riders** (motorbike) go online, see open broadcasts nearby, **accept or counter**, and once selected pick up and deliver, updating status along the way.
- **No manual dispatch.** If a broadcast draws **no interested riders** in the time window, it **expires** and the customer is prompted to **nudge the price up and re-broadcast** — fully automatic, no human in the loop. Admin only **monitors & supports**.

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
| Monetization | **Cash-first, commission from rider balance** | Customer pays delivery fee in cash to rider; Lynia takes commission from rider's prepaid balance; Paynow optional |
| Build approach | **Straight to cross-platform app** | Skipping the WhatsApp ops MVP (founder's call) |
| Matching model | **inDrive: customer-priced bidding marketplace** | System suggests → customer adjusts → broadcast → riders accept/counter → customer selects |
| Pricing | **Customer names the price (system-suggested, adjustable)** | Suggestion = base + per-km guide; customer notches up/down; **soft suggestion, no hard floor** — riders simply won't accept lowballs |
| Rider response | **Accept or counter — one round each** | Rider accepts the offered price or counters once; **no back-and-forth haggling** |
| Selection | **Customer always selects** | Every interested rider (accept *or* counter) is shown with price/rating/ETA; customer picks — even exact-accepts go to the list |
| No-offers fallback | **Expire + customer re-broadcasts (automatic)** | No interested riders in the window → expire, prompt customer to nudge price & re-broadcast; **no manual dispatch** |
| Commission (pilot) | **Zero / near-zero to seed supply** | Turn on commission once riders earn daily; avoids choking recruitment |
| App packaging | **One app, role toggle** (customer ↔ rider) | Fastest to ship in a month; single Expo codebase |
| Demand wedge | **General "send anything"** | Broad use case, but launch confined to one corridor |
| Platforms | **Android-first**, iOS from same codebase later | Zimbabwe is ~85–90% Android |
| Launch geography | **One Harare corridor** (e.g. CBD + Avenues + Borrowdale/Msasa) | Concentrate supply & ETAs |
| Timeline | **≤ 1 month** to pilot + Play Store | iOS TestFlight only if time allows |
| Live tracking | **Initiator tracking window, accept → rate** | One window follows the rider: accepted → items/note confirmed → ride started → collected → en route → delivered → rate. **Live location from acceptance**, **rider confirms (confirm-only)**, **rating required to close**. See §5c |
| Account creation | **Low friction: phone + name + ID** | **Phone required, email optional**; verified by **WhatsApp code (WhatsApp-only, no SMS fallback)**; capture **name + national ID**. See §5d |
| One account | **Sign up as customer → upgrade to rider** | Single identity, role-expandable (matches the role toggle & §5b seam); becoming a rider adds the rider-only requirements on top |
| Identity verification | **Customers: ID stored (unverified) · Riders: automated KYC** | Rider **ID verified by an automated KYC service, no admin**; **rides only after verification**; **ZIM bike reg stored (not live-checked)**; **rider photo required**. See §5d |
| Profiles & privacy | **Viewable profiles; phone hidden except active ride** | Public name = **first name + last initial**; **rider** profile = photo + trips + joined + rating(★+count); **customer** profile = orders + joined + name; **real phone revealed only `assigned`→`completed`**. See §5d |

---

## 3. Honest risk register (from Office Hours)

1. **Cold-start (highest risk).** Straight-to-app + general wedge means no demand validation before build. **Mitigation:** recruit 5–15 riders in the launch corridor from day 1 (parallel to the build); keep a WhatsApp + spreadsheet channel as a manual backstop for ops, not as the product's matching path.
2. **Payments (cash-first).** The economy is cash and low-trust. Lynia does **not** process the delivery transaction — **cash is paid directly to the rider**. Lynia earns by deducting commission from each rider's **prepaid balance**, topped up via **Paynow/EcoCash**. Paynow delivery-fee payment is **optional** for customers who can, never required. The rider never touches money for the goods.
3. **Addressing.** No reliable street addresses → rely on **GPS pin + landmark text + phone number**, never typed addresses.
4. **Data cost.** Mobile data is expensive → keep the app light, cache maps, throttle background location.
5. **Trust & safety.** Rider verification via **automated KYC** (ID check + selfie) plus **ZIM bike reg** (stored) and a **required rider photo**, item **photo at pickup**, **delivery OTP** at handover, two-way ratings, a **declared-value cap** (pilot: max ~US$100–150/item), and a **prohibited-items list** (cash, illegal/hazardous goods, live animals, anything above cap). Liability for safe handling sits with the rider; platform liability capped in T&Cs.
6. **Bidding-model complexity (biggest build item).** The customer-priced offer loop — suggest → adjust → broadcast → accept/counter → display interested riders → select — is the core build (offers table, `open_for_offers` state, rider accept/counter screen, customer selection screen). **Mitigation:** build the offer loop first and keep it strictly **one round** (no haggle-back) to bound complexity.
7. **Lowball / no-offers (pricing risk).** With no hard floor, customers may underprice and get no riders. **Mitigation:** a clear, honest suggested price; an empty-broadcast UX that **prompts a price nudge + re-broadcast**; optionally surface "riders usually accept around $X" hints once there's data.
8. **Timeline.** A polished bidding marketplace is a 3–6 month build. One month = a **brutally scoped** Android MVP in one corridor. Scope discipline is the whole game.
9. **Superapp scope creep.** The "superapp" vision will tempt catalogs/merchant onboarding/multi-vertical UI into month one. **Mitigation:** ship only Express now; capture the future solely as cheap data "seams" (§5b), never as features.
10. **Comms cost / reach.** Data is expensive and not all users stay online → the **signup OTP is sent via WhatsApp**, while push (when online) + **SMS fallback** carry other critical notifications; offline-tolerant order creation. Fast rider broadcast alerts are critical — push is the primary channel.
11. **WhatsApp-only OTP (onboarding reach).** Verifying signup by WhatsApp code with **no SMS fallback** is cheap and familiar, but **excludes users without WhatsApp** and depends on **WhatsApp Business API** access, message-template approval, and per-message cost. **Mitigation:** confirm a WhatsApp BSP/aggregator early (§9); revisit an SMS fallback for the OTP if reach proves a problem in the corridor.
12. **Automated KYC coverage for Zimbabwean IDs.** The rider flow relies on an **automated KYC vendor with no admin step** — but ID-verification providers may have **poor coverage of Zimbabwean national IDs** (latency, false rejects, or no support at all). **Mitigation:** validate a vendor against real Zimbabwean IDs before committing; keep a **manual review backstop** in reserve even though the chosen flow is admin-free (§9).

---

## 4. MVP scope

**In scope (must ship):**
- **Onboarding (low friction):** phone-number auth verified by **WhatsApp code (WhatsApp-only)**, **email optional**, capture **name + national ID**; **one account** with customer ↔ rider role toggle, **upgradeable to rider** (adds **automated KYC ID check + ZIM bike reg + required photo**, rides only after verification). See §5d.
- **Viewable profiles:** rider (photo, first name + last initial, trips, date joined, rating ★+count) and customer (first name + last initial, orders, date joined); **phone hidden except during an active ride** (`assigned`→`completed`, real number). See §5d.
- Customer: create delivery (pickup pin, dropoff pin, item description + photo, size category), see **suggested price**, **adjust it up/down**, **broadcast**, view **interested riders (accept/counter) with price/rating/ETA**, **select a rider**, pay **delivery fee in cash to rider** (Paynow optional), **live tracking window** (accept → confirm → start → collect → en route → delivered → rate, with live map; §5c), rating.
- Rider: go online/offline, **see open broadcasts nearby & accept or counter (one round)**, status transitions, share live location, daily earnings, **prepaid commission balance + top-up** (commission off during pilot).
- **Offer loop engine:** order → `open_for_offers` → collect rider accepts/counters within a window → show to customer → **customer selects** → assign; on no offers, **expire + prompt re-broadcast**.
- Admin web dashboard: **monitor orders & riders, support stuck orders** (no manual dispatch in the normal flow).
- Pricing engine: base + per-km (Google distance) as the **suggested** price; customer-adjustable, soft (no hard floor).
- Trust: **rider verification via automated KYC ID check** (+ ZIM bike reg stored, **required rider photo**), **item photo at pickup**, **delivery OTP** at handover, two-way ratings, **declared-value cap + prohibited-items list**.
- Notifications: signup OTP via **WhatsApp (WhatsApp-only)**; otherwise **push when online, SMS fallback** for critical updates; **low-latency rider broadcast alerts**.

**Out of scope (removed or fast-follow):**
- ❌ **Back-and-forth haggling** — rider response is one round (accept or single counter); customer selects.
- ❌ **Hard price floor / customer-side price caps** — suggestion is soft; market decides.
- ❌ **Manual / admin dispatch as a product path** — no-offers is handled by expire + re-broadcast.
- ❌ **Buy-for-me relay / rider float** — removed (cash, low-trust market).
- ❌ **Goods payment between sender & receiver** — settled offline, never in the app.
- Merchant verticals + Cash-on-Delivery (the commerce fast-follow), multi-city, scheduled deliveries, in-app chat, promotions/referrals, advanced fraud tooling, full iOS launch.

---

## 5. Tech architecture

| Layer | Choice | Why |
|---|---|---|
| App (one app, role toggle) | **React Native + Expo (EAS)** | Single codebase + single build, customer ↔ rider toggle, Android now + iOS later |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Realtime = live tracking + offer/broadcast updates; fastest path to MVP |
| Offer loop logic | **Supabase Realtime + Postgres** (broadcast, offers, window/expiry) | Push broadcasts to nearby riders; collect accepts/counters; expire on timeout |
| Maps / routing | **Google Maps Platform** | Best data coverage in Zimbabwe; geocoding, distance, ETA |
| Payments | **Cash-first** + **Paynow** (optional, for rider top-ups & opt-in fee payment) | Cash to rider, commission from rider balance; Paynow covers EcoCash/OneMoney/InnBucks/Zipit/Visa |
| Admin dashboard | **Next.js** on the same Supabase backend | Monitoring & support tool (not a dispatch console) |
| Notifications | **WhatsApp (signup OTP)** + **Expo Notifications / FCM** + **SMS gateway** (fallback) | Signup OTP via WhatsApp (WhatsApp-only); push when online (primary for broadcast alerts); SMS fallback for other critical updates |

### Data model (sketch)
- `profiles` (id, role: customer/rider/merchant/admin, **first_name, last_name** (public = first name + last initial), phone, **email** (nullable), **id_number** (stored; verified only for riders), **photo_url** (required for riders), **phone_verified_at** (WhatsApp OTP), **created_at** (date joined), **orders_count** (denormalized for the customer profile))
- `riders` (profile_id, vehicle_info, **bike_reg** (ZIM plate, stored — not live-checked), **photo_url** (required), id_verified, **kyc_status[`pending`|`verified`|`failed`]**, **kyc_ref** (KYC provider reference), is_online, current_lat, current_lng, **commission_balance**, **trips_count**, **rating_avg, rating_count** (denormalized from `ratings` for cheap profile rendering), updated_at) — a rider can only go online / accept jobs once `kyc_status = verified`
- `orders` (id, order_type[`parcel`], customer_id, rider_id, pickup{lat,lng,landmark,contact}, dropoff{...}, item_desc, **note** (customer's pickup/handling instructions the rider confirms), item_photo_url, declared_value, size, distance_km, **suggested_fare** (system), **proposed_fare** (customer's broadcast price), **agreed_fare** (selected offer), currency, fee_method[`cash`|`paynow`], commission, delivery_otp, status, **confirmed_at**, **pickup_started_at**, **collected_at**, timestamps)
- `offers` (id, order_id, rider_id, **type[`accept`|`counter`]**, offered_fare, eta_minutes, status[`pending`|`selected`|`declined`|`expired`], at) — the bidding loop; `accept` means offered_fare = customer's proposed_fare, `counter` means a different amount
- `order_events` (order_id, status, **lat, lng** (rider position at the event, when relevant), at) — status history; the **append-only feed the initiator's tracking timeline renders from** (§5c)
- `rider_ledger` (rider_id, order_id, type[`commission`|`topup`], amount, currency, paynow_ref, balance_after, at) — the cash/commission backbone
- `ratings` (order_id, by, score, comment)

### Order status flow
`requested → open_for_offers → assigned → confirmed → en_route_pickup → picked_up → en_route_dropoff → delivered (OTP verified) → completed` (plus `cancelled` and `expired`). The customer sets `proposed_fare` (from the adjustable `suggested_fare`) and broadcasts → `open_for_offers`. Nearby riders submit `offers` (`accept` at the proposed price or a `counter`); all `pending` offers are shown to the customer, who **selects one** → that offer becomes `selected`, its fare becomes `agreed_fare`, `rider_id` is set, status → `assigned`. If the offer window lapses with no offers (or the customer doesn't select), status → `expired` and the customer is prompted to nudge the price and re-broadcast. Delivery fee is paid **in cash to the rider** at handover (or Paynow if opted in); platform commission (zero during pilot) is deducted from the rider's balance on `completed`.

The two post-assignment states — **`confirmed`** (rider has reviewed and confirmed the item description + customer note) and **`en_route_pickup`** (rider has tapped "start ride" and is travelling to the pickup) — exist so the **initiator** (the customer who created the transaction) gets a continuous, legible view of the rider's progress from acceptance to handover. **Live rider location streams from `assigned` through `delivered`**, so the customer sees the bike the moment they select a rider. The single old `en_route` is split into **`en_route_pickup`** (rider → sender) and **`en_route_dropoff`** (rider → receiver) so the tracking window can show *which leg* the rider is on. See §5c.

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

## 5c. Live tracking & journey window (initiator view)

> **Decision (Office Hours):** once a rider is selected, the **initiator** (the customer who created the
> transaction) gets a single **tracking window** that follows the rider through the whole journey —
> acceptance → item/note confirmation → ride start with live position → items collected → en route →
> delivered → rate. It is the customer's home screen for an active order, replacing the offer-selection list
> the moment a rider is assigned.

### Why it matters
In a **cash, low-trust** market the customer has handed a stranger their parcel and is waiting on a delivery
they've already agreed to pay for. A legible, real-time "where is my bike" view is the single biggest **trust
and anxiety-reducer** for the initiator, and it's what makes the two-way rating at the end feel earned. It
reuses the **same Supabase Realtime channel** already built for the offer loop and rider location — no new
infrastructure.

### The journey, as the initiator sees it
A vertical **stepper/timeline** at the top (each step lights up as it happens, stamped with a time), a **live
map** in the middle once the rider is moving, and a **rider card** (name, photo, rating, bike reg, call
button) throughout. The steps map 1:1 to order statuses:

| # | Initiator sees | Order status | What happened | Map |
|---|---|---|---|---|
| 1 | **Ride accepted** | `assigned` | Customer selected this rider from the offer list; `agreed_fare` locked. **Live location starts streaming immediately.** | **live**, rider's position |
| 2 | **Items & note confirmed** | `confirmed` | Rider has read the `item_desc` + customer `note` and tapped **Confirm details**. `confirmed_at` set. | **live**, rider's position |
| 3 | **Ride started — rider on the way to pickup** | `en_route_pickup` | Rider tapped **Start ride** and is travelling to the sender. `pickup_started_at` set. | **live**, rider → sender, ETA to pickup |
| 4 | **Items collected** | `picked_up` | Rider confirms parcel in hand; **photo at pickup** captured. `collected_at` set. | rider at pickup pin |
| 5 | **On the way to drop-off** | `en_route_dropoff` | Rider riding to the receiver; **live location continues**. | **live**, rider → receiver, ETA to drop-off |
| 6 | **Delivered** | `delivered` | Receiver gives the **delivery OTP**; rider enters it → verified handover. | rider at drop-off pin |
| 7 | **Rate your rider** | `completed` | Order closes; **two-way rating** prompt opens. The initiator **must rate to close the order** (and the rider rates the customer). | — |

> Steps **2** and **4** are explicit **rider confirmations** the initiator can see ("the rider has confirmed
> the items / has them in hand"), which is exactly the reassurance the request calls for. At step 2 the rider
> can **only confirm** — if something is wrong (item larger than described, can't take it), the path is to
> **cancel the order** (per the cancellation policy, §9), not to renegotiate inline; this keeps the offer loop
> strictly one round.

### How it works (mechanism)
- **State machine.** Each transition writes an `order_events` row (`status`, optional `lat/lng`, `at`). The
  tracking window renders its timeline straight from this **append-only feed**, so history and live state come
  from one source of truth.
- **Live position.** From the moment the rider is selected (`assigned`) through `delivered`, the rider app
  pushes its GPS to `riders.current_lat/lng` on a **throttled** interval (data is expensive — §3.4); the
  initiator subscribes via **Supabase Realtime** and the map marker animates between updates. The customer
  sees the bike right away, not just once it starts moving. Location streaming is **scoped to the active
  order** and **stops at `delivered`** (privacy + battery + data).
- **ETA.** Google Maps Platform gives ETA to the current target (pickup pin, then drop-off pin); shown on the
  map and in the active step.
- **Notifications.** Each step also fires a **push (SMS fallback)** to the initiator — "Rider confirmed your
  items", "Rider has collected your parcel", "Delivered" — so they don't have to keep the window open (§3.10).
- **Rating gate.** The rating prompt is unlocked **only at `completed`**, tied to the `ratings` table; the
  order can't be rated before delivery is OTP-verified. The initiator's rating is **required to close the
  order** — the order stays in a "needs rating" state until submitted — which maximises rating coverage from
  day one (the rider's rating of the customer is likewise prompted).

### Scope discipline (MVP)
- **Ship:** the 7-step timeline, live map from acceptance through delivery, rider card with call button,
  per-step push/SMS, **rating required at completion**.
- **Defer (fast-follow):** in-app chat, route polyline replay/history, share-a-live-link with a third party,
  predictive "rider is 2 min away" geofenced alerts. The MVP shows **position + status + ETA**, nothing heavier.

---

## 5d. Identity, onboarding & profiles

> **Decision (Office Hours):** account creation is **deliberately low-friction** — **phone number + name**,
> verified by a **WhatsApp code** — while identity is made **trustworthy where it matters** (riders, who carry
> strangers' parcels) via **automated KYC**. Users can **view each other's profiles**, but a **phone number is
> never shown except during an active ride**.

### Signup (low friction, one account)
1. Enter **phone number** (required) → receive a **verification code via WhatsApp** and enter it.
   **WhatsApp-only — there is no SMS fallback for the signup OTP.** (SMS still backstops *other* critical
   notifications; the OTP itself is WhatsApp.)
2. Enter **name** and **national ID number**. **Email is optional.**
3. You now have a **customer** account. There is **one account per person**, role-expandable
   (matches the customer ↔ rider toggle and the §5b "one identity, expandable roles" seam).

> **WhatsApp-only is a deliberate trade-off:** it's cheap and ubiquitous among Zimbabwean smartphone users, but
> it **excludes anyone without WhatsApp** and depends on **WhatsApp Business API** availability/cost — flagged
> in §3 and §9.

### Becoming a rider (upgrade path + gating)
"**Become a rider**" adds, on top of the customer account:
- **ID verification via an automated KYC service** (selfie + ID match). **No admin in the loop** — verification
  is fully automatic; `kyc_status` moves `pending → verified | failed`. Admin only **monitors/supports**.
- **Motorbike ZIM registration number** — **stored as entered, not live-checked** (no reliable public registry
  API); it sits alongside the verified ID and the photo as the trust bundle.
- **Profile photo — required** (recognition and trust at handover).
- **Gating:** an unverified rider can sign up and look around but **gets rides only after KYC completes**
  (`kyc_status = verified`) — they cannot go online or accept jobs until then.

> **Customers are NOT KYC-verified.** Their `id_number` is **stored but unverified** — enough accountability for
> a cash market without adding signup friction.

### Viewable profiles
Either party can open the other's profile. **Public name everywhere = first name + last initial** (e.g.
"Tendai M."). **Phone number is never on the profile.**

| Profile | Shows | Notes |
|---|---|---|
| **Rider** | photo (required) · first name + last initial · **number of trips** · **date joined** · **rating (avg ★ + count)** | the customer reads this when choosing among offers (§1) and while tracking (§5c); `rating_avg`/`rating_count` denormalized from `ratings` |
| **Customer** | first name + last initial · optional photo · **number of orders** · **date joined** | what a rider sees before accepting/while delivering |

> Ratings on the profile are **score + count only** — no written comments displayed in the MVP (comments are
> still stored in `ratings` for moderation/analytics).

### Phone privacy (reveal window)
The **real phone number** (tap to call / WhatsApp) is revealed to the counterparty **only while the order is
active — from `assigned` through `completed`** — then **hidden again**. This is the same active-order window the
tracking view uses (§5c), so the two stay in lockstep. No proxy/masking layer in the MVP (cost/complexity); the
number is simply gated by order state.

### Editing
- **Name, photo, email** — editable anytime.
- **Phone number** — change requires **re-verifying via WhatsApp**.
- **Verified ID / bike reg** — **locked**; changing them requires re-verification.

---

## 6. Unit economics (framework — validate with real orders)

- **Suggested price** = base + (per-km rate × distance), shown in **USD** as a guide. The **customer sets the proposed price** (notch up/down, no hard floor); riders **accept it or counter**, and the **agreed fare** is the selected offer's amount.
- **Cash-first flow:** customer pays the agreed fare **in cash to the rider** at handover. Lynia's commission per completed delivery is **deducted from the rider's prepaid balance** (`rider_ledger`); riders **top up via Paynow/EcoCash**.
- **Pilot commission = 0% (or token)** to seed supply. Target **~15–20%** once liquidity is proven — track take-rate vs. rider top-up friction.
- **No platform float to reconcile:** Lynia never holds the delivery transaction or the goods money — it only tracks rider commission balances. This is what makes the cash economy workable.

*Placeholder to test: suggested base $1.50 + $0.50/km, commission 0% at pilot → ~18% later — replace with corridor-validated numbers.*

---

## 7. One-month plan (revised for straight-to-app)

**Week 1 — Foundations + parallel recruitment**
- Scaffold: Expo app shell (**role toggle**), Supabase schema (incl. `offers`, `rider_ledger`), Next.js admin app, repo CI.
- **Onboarding + identity:** phone auth via **WhatsApp OTP**, name + ID, optional email, **one-account role upgrade**, **rider automated KYC + ZIM bike reg + required photo** (rides only after verified), **viewable profiles** (§5d).
- Customer happy-path skeleton: set pickup/dropoff pins, **suggested + adjustable price**.
- Open Paynow merchant account (for **rider top-ups**); register the business; draft rider agreement + declared-value/prohibited-items policy.
- **Recruit 5–15 riders** in the launch corridor.

**Week 2 — The offer loop (core differentiator)**
- Broadcast → `open_for_offers` → **riders accept/counter (one round)** → **interested riders displayed** → **customer selects** → assigned.
- No-offers expire + **re-broadcast prompt**; item photo upload; push + **SMS** wired.

**Week 3 — Fulfilment + cash backbone + live tracking**
- Rider: status transitions, **live location sharing**, earnings view.
- **`rider_ledger`** + Paynow top-up flow (commission 0% at pilot but plumbed).
- **Delivery OTP** handover, **initiator tracking window** (7-step timeline + live map, §5c), two-way ratings (**required to close**), cancellation/no-show policy.

**Week 4 — Pilot, harden, ship**
- Real orders through the app in the corridor; fix top breakages; tune offer-window length & broadcast radius on real supply.
- **Google Play** submission. iOS TestFlight if time allows.

---

## 8. Success metrics (pilot)

- Orders/day and week-over-week growth in the corridor.
- Delivery completion rate (target ≥ 90%).
- **Offer-loop health:** offers per broadcast, time-to-first-offer, share of broadcasts that get ≥1 offer, customer selection time, re-broadcast rate.
- Median pickup ETA and total delivery time.
- Rider utilization (jobs per online hour).
- Repeat-customer rate.
- Gross margin per order.

---

## 9. Open decisions (pending — to resolve in Plan stage)

- **Offer-loop tuning:** broadcast radius, offer-window length, max offers shown, offer/selection expiry timers — start with placeholders, calibrate on real corridor supply.
- **Legal / regulatory:** business registration, ZIMRA tax, motorbike commercial-use rules, rider licensing & insurance, goods/rider liability, data privacy. Verify with a local advisor before *public* launch (not a blocker for a closed pilot).
- **Brand & language:** is "Lynia" the final consumer name? English first; Shona/Ndebele later?
- **Launch corridor:** which specific Harare suburbs go first (drives rider recruitment + demand seeding)?
- **WhatsApp OTP provider:** which WhatsApp Business API BSP/aggregator delivers the signup code — cost per message, verification-template approval, delivery reliability in Zimbabwe.
- **KYC vendor (riders):** which automated ID-verification service actually supports **Zimbabwean national IDs** — coverage, price, latency, false-reject rate, and the fallback (e.g. manual review) if none is adequate.
- **SMS gateway:** which local aggregator for non-OTP critical notifications (push fallback)?
- **Cancellation/no-show enforcement** in a cash model (hard to charge fees) — policy TBD. Includes the **rider-can't-take-it case** at the item-confirm step (§5c step 2): since confirm is confirm-only, a rider problem cancels the order — define who bears it and how the customer is re-served (re-broadcast prompt).

---

## 10. Next steps (gstack flow)

- ✅ **Think → Office Hours** (this doc).
- ✅ **Office Hours follow-up** — added the **initiator live-tracking window** (§5c): live location from acceptance, rider confirm-only at item check, rating required to close.
- ✅ **Office Hours follow-up** — added **account creation, identity & profiles** (§5d): low-friction phone+name+ID signup, **WhatsApp-only OTP**, **one-account upgrade-to-rider**, **automated KYC** (no admin, rides only after verified) + ZIM bike reg + required rider photo, **viewable profiles** (first name + last initial), **phone hidden except `assigned`→`completed`**.
- ⬜ **Plan → `/plan-ceo-review`** — pressure-test the business/economics.
- ⬜ **Plan → `/plan-eng-review`** — validate architecture & data model.
- ⬜ **Build** — scaffold the Expo app + Supabase backend + admin dashboard.

> Note: gstack skills (`/plan-ceo-review`, etc.) require gstack installed locally; until then these can be run manually.
