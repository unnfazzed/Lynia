# LyniaGo — Restaurants vertical: design decisions, screen inventory & interaction notes

Companion to `explorations/restaurants/Restaurants Vertical.html` (80 screens) and
`explorations/restaurants/Restaurants Journey Maps.html` (3 actor flows).
Everything here is a **judgement call made to unblock design** — each one is numbered so engineering
and product can challenge them one at a time. Nothing in §1 is a product decision that has been
signed off; they are defensible defaults, visible in the mockups.

---

## 1 · Numbers I picked (challenge these first)

| # | Value | Where it shows | Why this number |
|---|---|---|---|
| N-01 | Delivery fee **$0.80/km, rounded to the nearest $0.50, min $1.50** | Cart, checkout, offer card | Keeps a 3.1 km Avenues→Belgravia run at $2.50 — close to what Express riders already accept, and roundable to notes/coins that actually circulate. |
| N-02 | ~~First-order CASH cap $15.00~~ **Retired — see §7 (R-02)** | — | Cash is now collect-and-return: the rider fronts nothing, so the float-risk rationale is gone. Cash for everyone, any size. |
| N-03 | Merchant **accept window 3:00** | Customer waiting screen, merchant alarm | Long enough for a busy kitchen to look up, short enough that a customer doesn't stare at a dead screen. Unanswered = auto-cancel, never a silent hang. |
| N-04 | **Prep chips 10 / 15 / 20 / 30 / 45 min** | Merchant accept | Five taps cover almost every kitchen; free text invites "5 min" fiction. |
| N-05 | **Wallet payment window 10:00** | Pay-now screen, push | Mobile-money prompts fail and get retried; 10 minutes survives one failed rail plus a switch. Expiry = order dies before dispatch, so nobody cooked. |
| N-06 | Rail prompt wait **90s** | Pay-wait ring | Matches the shipped rider top-up flow — same rails, same behaviour, one mental model. |
| N-07 | **NO_RIDER cap 6:00** of auto-dispatch | Tracking, merchant hold screen | ~6 sequential 60s offers with a widening radius. Beyond that the food would be cold anyway. |
| N-08 | Rider **offer timer 60s** | Offer card | Bottom of the 60–90s brief: merchant orders are auto-dispatched, so a slow rider costs the kitchen its prep clock. |
| N-09 | Rider **headroom = declared float − cash tied up in live orders** | Offer card, headroom screen | Riders bank cash mid-shift; a static "float" figure goes stale by 10:00. Blocked CASH offers show the arithmetic, never just "unavailable". |
| N-10 | Customer **no-show window 8:00 + 2 logged calls** | Rider wait timer, customer failure timeline | Two calls four minutes apart is the informal norm; 8 minutes is the most a rider will accept unpaid. |
| N-11 | **Rider keeps the delivery fee** on a failed delivery; goods return to the merchant | Return leg, failure screen | The rider did the work. Charging them for a customer's absence is how you lose riders. |
| N-12 | Refund SLA **2 hours**, then escalated to support and flagged on the statement | Refund-pending screen, merchant refund screen | LyniaGo never holds the money, so the only lever is visibility + escalation. |
| N-13 | Commission **0%**, with the "would have been 10%" figure shown weekly | Merchant statement | Accrual has to be visible before the rate starts, or the first charge feels like a trap. The 10% comparator is illustrative, not a committed rate. |
| N-14 | Out-of-stock default **"for the rest of today"**, auto-resetting at open | Merchant OOS sheet | The commonest failure is a dish left greyed out for a week. |
| N-15 | **Minimum order $4.00**, else a **$1.00 small-order fee** | Cart (under-minimum state) | A rider crosses town for a $2.50 order either way; the fee names the cost instead of quietly making the trip unprofitable. |
| N-16 | **Pickup code, 4 digits** | Rider job screen, merchant pickup confirm | Proves the rider at the counter is the assigned one. Same grammar as the 6-digit delivery code, so nobody learns a second mechanism. |
| N-17 | **Busy mode = +10 min** on new orders | Kitchen board, empty queue | Kitchens reject orders when they're slammed; a prep-time bump keeps the order and tells the customer the truth. |
| N-18 | **Partial-accept approval window 60s** | Customer "one item unavailable" | Long enough to read, short enough that the kitchen isn't held hostage. |

---

## 2 · Design decisions

**D-01 · Services are tiles on one home, not tabs.** The root is Home | Orders | Account. Home
carries the address + search header, a 4-up grid of round service tiles (Send · Food · Pharmacy
"Soon" · More), the live-order card when one is running, and a "Restaurants near you" photo-card preview. Tapping
Food pushes the restaurant list full-screen with a back arrow — the vertical is a destination, not a
navigation mode. Adding Pharmacies is one more tile and zero layout change; a tab bar would have had
to be redesigned at the third vertical.

**D-02 · Both products launch together — no reveal.** ~~When the remote flag flips…~~ **Superseded
(Jul 2026):** Send and Food ship in the same release, so there is no "new service" moment to
announce. Home carries both tiles from first run; the cold-start spotlight sheet and the NEW badge on
the Food tile are removed. Pharmacies, when it lands, gets the same treatment — a tile, no fanfare.

**D-02b · Orders is one list across every service.** Express parcels and food orders share the same
history and the same live-order card, so no vertical ever needs its own "my orders".

**D-03 · The tracker grammar is Express's, re-labelled.** Seven steps, same dots, same ✓/live
treatment: placed → accepted → rider secured → at restaurant → picked up → on the way → delivered.
Restaurants adds a prep countdown ring above it, not a new timeline component.

**D-04 · "Rider secured" is a first-class state for all three actors.** It is the merchant's cook
signal (screen turns green), the customer's confidence signal, and the rider's commitment. Cooking
before it is the expensive mistake this vertical can make, so the amber "Don't start cooking yet"
screen is the whole viewport, not a chip.

**D-05 · The merchant alarm is unlocked at login, by design.** Browsers won't loop audio without a
gesture, so the sign-in button is labelled "Sign in & start the alarm". The alarm is a repeating
2-tone chime (~1.2s on, 0.8s off) plus a whole-screen green takeover; it stops **only** on Accept or
Can't-take-it. No snooze, no "OK" that silences without deciding.

**D-06 · Confirming money means acknowledging a number.** CASH pickup shows $13.00 at 82px with a
checkbox reading "I counted $13.00 in my hand". WALLET pickup requires the merchant to type the
reference *and* the amount, with the expected amount displayed beside it — a mismatch blocks release
and names the gap in dollars. Copy states the rule: trust your own statement, never a payment screen
shown on someone else's phone.

**D-07 · The rider's pay-merchant screen is a mirror of the merchant's confirm.** Same amount, same
size, same moment, two devices. Anything that only one side can see is a dispute waiting to happen.

**D-08 · Food money and delivery money are never merged into one figure for the merchant.** The
merchant screens show $13.00 (theirs); the rider and customer screens show $15.50 (goods + fee) with
the split spelled out. One number in the wrong place is a short payment.

**D-09 · Cash steering explains itself on the disabled control.** The disabled CASH row carries the
reason — "riders front the food cost from their own pocket" — plus the way back ("order under $15
next time and cash unlocks"). No blocked path without a stated cause and an exit.

**D-10 · Out-of-stock items stay visible and disabled.** Hiding them makes the menu look thin and
erodes trust; greying them says "we normally have this".

**D-11 · Rejections require a reason, and the reason writes the customer's copy.** "Out of an
ingredient" reads better to a customer than a generic failure, and gives ops a real signal.

**D-12 · Refunds are the merchant's act, executed in the UI.** LyniaGo never touches the money, so
the merchant cannot reject a paid order without entering their own refund reference first. The
customer's order keeps that reference forever — it is their evidence, not a screenshot.

**D-13 · NO_RIDER is designed as an apology, not an error.** Customer: what we tried, for how long,
nothing charged, two ways forward. Merchant: "cancelled for you, you never cooked", and it does not
count against acceptance rate.

**D-14 · The delivery code is unchanged from Express, and is the only proof of delivery.** No photo,
no signature. It renders at 34px, works offline, and is read only when the food is in hand.

**D-15 · The return leg is a real job.** Failed delivery gets its own navigation back to the
restaurant, a hand-back confirm where the merchant returns the fronted cash, and a support path if
they refuse. It is not a status change.

**D-16 · Connection loss is loud on the tablet and quiet on the phone.** The kitchen must know it is
invisible to customers (red bar, disabled actions, reconnect counter). The customer's dropped socket
is a muted "Live paused — reconnecting…" because their order is unaffected.

**D-17 · Merchant phone numbers are masked everywhere.** Merchant surfaces show +263 7• ••• ••90 with
a proxied call button; the raw number never renders.

**D-18 · Maps are real geography.** Tracking and rider navigation render actual Harare streets
(Avenues → Belgravia corridor) with a desaturated tile treatment so the green route and pins stay the
brightest things on screen in sunlight.

**D-19 · Every screen ships its five states.** Default, loading (content-shaped skeletons, never a
spinner on white), empty (icon + one sentence + one action), error (honest cause + one retry),
offline (what still works + what is paused). The gallery shows them as siblings, not variants buried
in a spec.

**D-20 · Photography is placeholder-only.** Dish and cover images are marked slots with dimensions
and a weight budget (≤300 KB, 1:1, min 600×600). No stock food photography enters the system.

**D-21 · The ETA is promised before payment, not after acceptance.** Cart and checkout show an
arrival window (prep estimate + ride time) with the caveat that it is confirmed on acceptance. Buying
food without a time is the single biggest confidence gap in the flow.

**D-22 · Photos are an upgrade, never a dependency.** The default dish/store thumbnail is a
category-tinted block with the name's initial. A merchant with no camera still gets a list that
looks finished, and a merchant who uploads gets a better one.

**D-23 · Merchant accept is item-level.** "Don't have it" on a line beats rejecting the order; the
customer approves the shorter order in 60 seconds, with the money difference stated (refund with a
reference on WALLET, less cash at the door on CASH).

**D-24 · Mobile money has a manual rail.** Prompts fail here. The pay screen carries the merchant
number, the exact amount and the order reference — all copyable — plus an "I paid another way" route
that captures the transaction reference for the merchant to match against their own statement.

**D-25 · "Paid, waiting for the restaurant to confirm" is a designed state.** The customer sees the
amount, the reference and a confirmation clock instead of silence between paying and cooking.

**D-26 · The queue becomes a board at three orders.** New / Cooking / Ready columns, each card
carrying its own clock, because a flat list can't say which order is closest to burning.

**D-27 · The plate number is the tracking card's largest element after the ETA.** That is how a person
finds a bike, and it is what Grab and Gojek both promote.

**D-28 · Express's safety surface is reused verbatim.** Get help · Share trip · SOS sit on every live
food-tracking screen — same riders, same risk, same controls.

**D-29 · The merchant owns the menu structure.** Categories are created by the merchant (name +
availability window), dishes are added *into* a category, and the customer's menu tabs are a direct
mirror of that list and its order. Categories can be renamed, reordered, time-limited (Breakfast
07:00–11:00), hidden with one toggle, and deleted only once empty. A shop with no categories cannot
add a dish — the first-run screen asks for a category first, with four one-tap starting points.

**D-30 · The shop front is the merchant's, edited against the customer's view.** A "Shop" section owns
the 3:1 cover banner (1200×400, compressed to ≤250 KB for us), the round logo, the one-line blurb, up
to three cuisine tags and a price level — with a live miniature of the customer's restaurant page
beside the form. Changes go live instantly; there is no review queue to wait on. Upload is
choose-a-file from the tablet, then a drag-and-zoom crop inside the aspect frame; the left edge is
kept clear in guidance because the logo sits there.

**D-31 · A dish cannot go live without a photo.** Saving without one keeps the dish as a **draft** —
visible to the kitchen, invisible to customers, with one button to fix it. Rationale: photos are the
single biggest driver of orders, and a half-photographed menu looks broken. The photoless tinted
block stays in the system as the fallback for legacy dishes and while photos are still landing.

**D-32 · We compress on the merchant's behalf and say so.** A 4 MB camera file is normal; the upload
dialog states the target size, keeps the old banner live until the new one lands, and an offline
upload is queued on the tablet and retried rather than lost.

**D-33 · A rider can drop a job only before collecting the food.** Before pickup: a reason picker,
the consequence stated (three drops in a week pauses offers), auto re-dispatch, and the merchant's
prep clock **pauses** rather than running against them. After pickup the control is gone — the rider
has already paid the merchant and is carrying the food, so the only routes are call the customer,
get support, or the return leg. Abandonment is not a state the system offers.

**D-34 · A cancelled rider is the merchant's decision, not just a notification.** The queue takes an
amber takeover naming the reason and the re-dispatch countdown, with three explicit choices: keep
cooking, stop and hold, or cancel. If nobody takes it inside the remaining NO_RIDER cap, the cooked
food is logged on the weekly statement as a loss LyniaGo covers — otherwise merchants stop cooking on
"rider secured", which breaks the whole timing model.

**D-35 · Notes are free text, at two levels, and never change the price.** A note can sit on a single
dish ("leg portion, not breast · no chilli") where it travels with that line on the kitchen ticket,
or on the whole order ("pack the sadza separately from the stew") where it sits at the bottom of it.
Both levels are written from the same sheet and both show in the cart before checkout, so the kitchen
is never sent copy the customer had no way to enter. Quick chips
seed the common ones but the field stays open, because Zimbabwean kitchens improvise and a fixed
option list can't cover what people actually ask for. A note can never alter the total — if what the
customer wants costs more, the kitchen calls before accepting. Notes render on the merchant's accept
screen *and* on the cook ticket, indented under their line in `--highlight-ink`, so a cook reading at
arm's length sees them.

---

## 3 · Interaction notes for engineering

**Merchant alarm.** Two-tone chime looping until a decision; unlocked by the login tap; `AudioContext`
resumed on every user gesture in case Chrome suspends it. Screen Wake Lock held while the tab is
visible and any order is un-answered. If the wake lock is refused, the queue falls back to a
full-brightness flashing header. Alarm state (on/muted) is shown in the top bar at all times — muting
is deliberate and visible, never silent.

**Merchant reconnect.** Socket drop → red CONNECTION LOST bar within 3s, all mutating actions
disabled, exponential backoff with the attempt count shown. On reconnect: orders that arrived while
dark are backfilled with a banner naming the count; their accept clocks were paused server-side.

**Customer notifications.** Three pushes: "merchant accepted — pay now" (wallet, high priority,
persists on the lock screen until paid or expired, action buttons Pay now / View order), "rider
secured", and "rider is at your door" (single vibrate). No push for step changes in between — the
tracker is enough.

**Vibration.** Rider: offer arrival = 3 short pulses + sound even in silent mode (it's a job offer);
code accepted = one short pulse. Customer: door arrival only.

**Survives an app restart.** Live order id + last known status, the PII-free cart draft, the delivery
code, and any confirmed money event (cash paid to merchant, wallet reference entered). On resume the
app lands directly on the live order with a "picking up where you left off" strip. Nothing about a
payment is re-asked once confirmed server-side.

**Survives a tablet reboot.** Merchant session, open orders, and prep clocks; the alarm needs one tap
to re-arm (browser gesture requirement) and the banner says so.

**Offline tolerance.** Customer: restaurant list cached with a visible timestamp, checkout draft kept
locally, delivery code readable offline. Rider: active job, addresses and amounts cached; code entry
queues and syncs. Merchant: read-only queue, no accepts.

---

## 4 · Screen inventory

### Customer — 46 screens (Expo, 320–360dp)
Home (green brand header + floating search, service tiles, live-order card per running job — ride or food — restaurants near you) ·
Orders (all services) · Restaurant list · List loading · Nothing open · Offline list ·
Search · Menu · Item sheet · Closed restaurant · Closes-while-browsing modal · Cart · Item sold out ·
Note for the kitchen · Price changed · Empty cart · Checkout CASH · Checkout WALLET (cap steering) · Checkout offline ·
Placing · Waiting for accept · Pay-now push (lock screen) · Pay the restaurant · Prompt sent ·
Payment window expired · Payment declined · Prep countdown · Rider secured · On the way (map) · Live
paused · NO_RIDER · Rejected / refund pending · Refunded · Cancel sheet · Code + cash at the door ·
Delivered & rate · No-show failure timeline · Resumed mid-order.

### Merchant — 39 screens (web, tablet-first 1024×680, degrades to phone)
Phone+OTP login (alarm unlock) · First-login setup · Rebooted mid-shift · Queue empty · Queue loading
· NEW ORDER alarm · Two orders at once · Connection lost · Order arrived offline · Accept + prep time
· Reject reason · Accepted / do not cook yet · Rider secured / cook now · Mark ready · NO_RIDER ·
Pickup confirm CASH · Pickup confirm WALLET · Short-payment blocked · Handed over · Rider no-show ·
Refund-after-payment · Menu grouped by category · Categories (reorder / hide / delete) · New or rename
category · Edit / delete category · No categories yet · Edit dish (photo required) · Dish photo crop ·
Draft dish needs a photo · Out-of-stock sheet · Hours · Weekly statement · End of day · Shop profile ·
Position the banner · Uploading / compressing · Upload paused offline.

### Rider — 18 screens (same Expo app, rider role)
Offer CASH · Offer WALLET · Offer blocked by float · Offer expired · Cash headroom · Navigate to
restaurant · Pay the merchant · Collect the order · Navigate to customer · Code + collect cash ·
Wrong code · Delivered & earnings · Drop the job (before pickup) · Drop blocked after collecting · Customer unreachable (wait + call log) · Return to restaurant ·
Hand-back confirm · Resumed mid-delivery.

---

## 5 · Deliberately not designed

Pharmacies (tab slot reserved only) · order batching · photo/signature proof of delivery · scheduled
orders · tipping · promo codes · merchant-side analytics beyond the weekly statement and end-of-day ·
in-app chat (proxied voice only) · Shona/Ndebele localisation.

---

## 6 · Open questions for product

1. Is the delivery fee **per order** or **per kilometre band**? N-01 assumes per-km with $0.50 rounding.
2. Does the **first-order cash cap** reset per restaurant, or once per customer lifetime?
3. Who eats the loss when a **customer no-show** happens on a CASH order — the rider is out $13.00
   until the merchant refunds them at hand-back. Design assumes the merchant returns the cash.
4. Does a **merchant rejection after wallet payment** carry any penalty, and who chases a refund past
   the 2-hour SLA?
5. Should the customer see the **rider's headroom-driven wait** (i.e. "no rider can carry this cash
   order") as a distinct reason from NO_RIDER? Currently folded into NO_RIDER. *(Now only applies to
   pay-me-upfront kitchens — see §7.)*

---

## 7 · Revision — the cash-collect model (28 Jul 2026, founder decision)

Cash changed direction: **the rider is no longer obliged to pay the merchant at collection.** The
default CASH flow is now **collect-and-return** — the rider takes the food unpaid, collects the full
amount from the customer at the door, keeps the delivery fee, and rides the food money straight back
to the restaurant. Rider-fronting survives only as an **opt-in merchant rule** ("pay me upfront").
Mobile money (EcoCash / InnBucks / O'mari) is unchanged and remains a first-class option.

### Revised decisions

**R-01 · Collect-and-return is the CASH default.** The rider fronts nothing, so any rider can take
any cash order. The risk window moves to the merchant: food leaves the counter against a **recorded
debt**, repaid ~25–35 min later. Immediately after the drop the rider rides back — the return-cash
leg is a real job with its own navigation (mirror of the failed-delivery return leg, D-15), and the
rider **cannot take new offers until the merchant confirms the returned cash**.

**R-02 · The first-order cash cap is dropped** (supersedes N-02 and D-09). Cash for everyone, any
size. The controls are the doorstep handshake, the customer flag/cash-ban on refusal, and the rider
suspension on non-return — not a cap.

**R-03 · The merchant sets the cash rule per shop** (Shop → "How riders pay you"): collect-and-return
(recommended, default) or pay-me-upfront (the old model). Riders see the rule on the offer before
accepting; headroom/float logic (N-09, R1·b1, R1·3) applies **only** to upfront kitchens.

**R-04 · The doorstep is a dual-confirm handshake, food first.** Order of operations: hand the food
over → customer pays cash → **customer taps "I gave $X"** → **rider taps "I received $X"** → only
then does the delivery code appear on the customer's screen and the rider's code entry unlock. Two
signed, timestamped confirmations are the evidence layer; the code closes the trip.

**R-05 · A missing confirmation freezes the trip.** If the customer confirms and the rider doesn't
(or disputes the amount) within 2 minutes: the order stays open, **support is auto-called**, and the
rider can take no new jobs until it's settled. Mismatches are named in dollars, never guessed at.

**R-06 · The rider keeps the delivery fee out of the collected cash** and returns the goods value
only ($15.50 collected → $2.50 kept, $13.00 owed). The merchant's return confirm uses the same D-06
count-and-acknowledge grammar ("I counted $13.00 in my hand").

**R-07 · Default risk sits with the merchant, by their own choice.** If a rider never returns the
cash, the merchant eats the loss; the rider is **suspended and named**. This trade is stated in
plain words on the cash-rule setting and on the release screen — never discovered after the fact.

**R-08 · An unpaid customer costs the customer nothing in money — and everything in access.** If they
refuse or can't pay, the food rides back (existing return leg), the merchant logs the loss, and the
customer is **flagged and cash-banned** (mobile-money-only from then on). No debt is created.

**R-09 · The delivery code is masked until the handshake (CASH orders).** Tracking screens (6·3,
6·b1) show `••• •••` with "appears once you both confirm the cash" — one coherent story, no code to
wave at the door before paying. The code is still stored on-device (offline tolerance survives): if
the phone is offline at the door, the customer pays and **press-and-holds to reveal** — a deliberate
act, logged and synced later; the rider's entry field is the second gate either way. WALLET orders
are already paid, so their code shows during transit as before.

### New numbers

| # | Value | Where it shows | Why |
|---|---|---|---|
| N-19 | **Handshake confirm window 2:00** | Customer wait screen, rider dispute screen | Long enough to count notes twice; short enough that a stalling rider is caught at the door, not down the road. |
| N-20 | **Return leg starts immediately** after the drop; no new offers until the merchant confirms | Rider return screen, merchant count screen | "Batched later" is how cash evaporates. Immediate return caps merchant exposure at one order per rider. |
| N-21 | **Rider return trail** (release → both confirms → back at counter) shown on the merchant's count screen and weekly statement | M3·4 | The debt is auditable by the person owed, not just by ops. |

### Screens added / reworked (in the gallery)

- **Customer:** 7·1 Pay at the door (reworked — code hidden until handshake) · 7·1b Waiting for rider
  confirm · 7·1c Both confirmed · code · 7·b3 Rider didn't confirm (support auto-called) · 4·2
  checkout WALLET (cap steering removed).
- **Rider:** R1·1 CASH offer (collect-and-return default) · R1·1b upfront-kitchen offer · R3·2
  doorstep (confirm-cash-unlocks-code) · R3·3 delivered (return duty stated) · R3·4 return the cash
  · R3·b2 customer confirmed / rider didn't.
- **Merchant:** M3·1b release unpaid (collect rule) · M3·4 count the returned cash · M5·4 cash rule
  setting. (M3·1 upfront confirm and the float screens survive for upfront kitchens.)

### Revision 2 (same day) — no minimum balance, and EcoCash confirmed before cooking

**R-10 · No minimum balance, no float concept anywhere.** N-09 and the headroom screens (R1·b1
blocked-offer, R1·3 headroom) are **deleted**. Any rider can take any cash order. "Pay me upfront"
kitchens survive, but riders **self-declare**: the offer states the amount plainly ("only accept if
you're carrying $13.00 — nobody checks a balance, but arriving short strands you at the counter")
and the app never blocks.

**R-11 · Mobile money is confirmed by the restaurant BEFORE cooking, never at pickup.** EcoCash /
InnBucks / O'mari is paid at acceptance (in-app prompt or outside the app by USSD — D-24); the
merchant matches the reference against **their own statement** and that confirm is what starts the
prep clock (M3·2 reworked). A submitted reference freezes the payment-window expiry — money-gone,
order-dead must be impossible. Cash is the only money that moves at the door.

**R-12 · The rider sees PAID at pickup and hand-off.** Once the merchant confirms, the order carries
a PAID mark everywhere the rider looks: rail, amount, who confirmed, time, reference (R2·3b). Cash
jobs show the mirror: "NOT PAID — collect $15.50 at the door." One glance answers the only money
question a rider has.

*After-hours note:* pay-after-accept means the merchant just accepted seconds earlier, so the tablet
is live by definition — there is no unattended-confirm case; an unconfirmed payment escalates through
the frozen-expiry path (R-11), never silence.

### Revision 3 — no payment clocks; the kitchen calls first

**R-16 · Call before requesting payment.** On a mobile-money order the merchant's flow is accept →
**call the customer** (logged on the order; may come from the restaurant's own number) → request payment
→ confirm it landed → cook. The request button unlocks after a logged call, with an override
("they confirmed another way") for regulars and in-person confirms.

**R-17 · No payment window, no auto-cancel.** N-05 (10:00 window) is retired; N-06's 90-second ring
is retired as visible UI (rail timeouts are handled silently with a retry). The order waits until
the money lands, the merchant releases it, the customer cancels (free, any time before paying), or
the shop closes for the day — **end-of-day close is the only automatic exit** (N-23), a shift
boundary rather than a countdown. Prep time starts at payment confirm, not at accept.

**Regressions this opens (explored):**

1. **Zombie orders.** Without expiry, unpaid orders could pile up. Mitigation: an *awaiting payment*
   lane that never blocks the kitchen board (M2·7), a no-penalty **Release** action that notifies
   the customer, and the N-23 end-of-day auto-close.
2. **Lost urgency — customers forget.** The countdown was a commitment device; the phone call is its
   replacement (a spoken "yes" beats a timer). Backstops: one soft reminder push ~15 min after the
   request (N-22, no threat language) and the *Still unpaid* screen (5·b1) with a free cancel.
3. **The ETA promise breaks.** Cart promised an arrival window anchored on acceptance; with an
   open-ended pay step it anchors on **payment confirm** — restated on the request ("the kitchen
   starts the moment it lands") and re-promised once confirmed.
4. **Merchant labour.** Every wallet order now costs a phone call; a slammed kitchen may start
   rejecting wallet orders. Watch wallet acceptance rate; the override keeps repeat customers fast.
   If call volume hurts, the fallback is making the call optional per shop — not restoring the clock.
5. **Unreachable customer.** No answer = no request. The merchant releases with reason "couldn't
   reach you", which writes the customer's copy (D-11 grammar) — never a silent drop.
6. **Fraud surface unchanged.** A "payment" claimed but never sent still dies at the
   statement-match before cooking (R-11); removing the clock removes pressure, not verification.
7. **Push contract.** The pay push no longer threatens expiry; it persists until paid or cancelled.
8. **R-11's expiry-freeze rule is moot** — nothing expires, so a submitted reference simply waits
   for the merchant's confirm.

**New numbers:** N-22 reminder push ~15 min after an unanswered payment request (once, soft copy).
N-23 unpaid orders auto-close at the shop's closing time; nothing charged, customer notified.

**Screens:** customer 5·1b *They call to confirm*, 5·2/5·3/5·4/5·5/5·6 de-clocked, 5·b1 reworked to
*Still unpaid · reminder*; merchant M2·6 *Call, then request payment*, M2·7 *Awaiting payment · no
clock* (release action, prep-starts-at-confirm note).

### Open questions raised by this revision

1. Multi-drop: may a rider carry **two collect-mode orders from different kitchens** at once, or is
   one open debt the hard limit (N-20 implies one)?
2. Does a merchant on collect-and-return see a rider's **return history** ("212 returns, 0 missed")
   before release, or is that ops-only? (Mocked as visible — challenge it.)
3. When the rider is back and the kitchen is slammed, does the **count-and-confirm interrupt** the
   queue like a new order, or wait quietly? (Rider is blocked from offers while it waits — a slow
   confirm costs the rider money, not the merchant.)
4. Is the 2:00 handshake window (N-19) right for gate/complex deliveries where the customer walks
   away after paying?

---

## Appendix — rationale defended under review (absorbed from the retired RESTAURANTS-UX-REVIEW)

The July 2026 adversarial UX review (28 findings, all fixed and folded into the D-/N- numbers above)
closed with four positions worth restating because they are deliberate trade-offs, not oversights:

- **Pay-after-accept, not pay-first.** Slower than every competitor's checkout, and correct here:
  LyniaGo never holds funds, so taking money before a kitchen has agreed to cook would create a
  refund queue nobody can service.
- **"Don't start cooking yet" as a full screen.** Competitors fire the kitchen on acceptance because
  they have dispatch density. We don't, so the cost of a wrong signal is wasted food — the loud
  amber hold is worth the extra step.
- **Code-only proof of delivery.** No photos, no signatures. Cheap phones, expensive data, and a
  code the customer already understands from Express.
- **Services as tiles, not tabs.** Costs one tap versus a tab; buys a navigation that survives
  Pharmacies and everything after it.
