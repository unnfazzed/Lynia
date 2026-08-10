# Restaurants vertical — adversarial UX review

Reviewed against what DoorDash, Uber Eats, Gojek (GoFood) and Grab (GrabFood / GrabMerchant /
GrabBike) actually ship. Written against **my own** designs in
`explorations/restaurants/Restaurants Vertical.html` — the job here is to attack them, not defend
them. Severity: **P0** loses orders or breaks trust · **P1** competitive gap a user would feel ·
**P2** polish.

> **Status: all 28 findings are fixed in the gallery** (see the resolution log at the bottom). The
> critique below is kept as written — it is the record of what was wrong and why, so the fixes can be
> argued with.

---

## P0 — fix before this ships

**1 · The restaurant list has no food in it.**
Every competitor leads discovery with photography: DoorDash and Uber Eats are card-per-restaurant
with a hero image; GrabFood and GoFood both open on image tiles. My list rows use a 54px green
utensils icon. It reads like a directory of businesses, not a place to buy dinner — and it makes
every restaurant look identical, so the only differentiators left are distance and fee. Worse, my
own home screen *does* show photo cards ("Kitchens near you"), so the list is a downgrade from the
teaser.
*Fix:* photo-led list rows (96×96 thumb minimum, 4:3 hero for the top three), with a graceful
no-photo fallback — see #2.

**2 · The design assumes photos that Harare merchants won't have on day one.**
Menu rows, list rows and the merchant catalog all show `dish photo` placeholders. In a market where
the merchant is uploading from a $60 Android in a kitchen, a large share of dishes will ship with no
image, and a grid of grey squares looks broken. Grab solves this with a category-derived colour
block + dish initial; DoorDash hides the image column entirely when a store has no photos.
*Fix:* design the photoless state as the default, not the exception — a tinted category block
(mains / sides / drinks) with the dish name set large. Photos become an upgrade, never a dependency.

**3 · The customer is never told when the food will arrive.**
Cart, checkout and the placing screen show money but no time. Uber Eats, DoorDash and GrabFood all
commit to an arrival window before you pay ("Arrives 10:15–10:25"), and it is the single biggest
driver of order confidence. My design only reveals timing *after* the merchant accepts, as a prep
countdown. That's honest about prep, but it asks the customer to buy blind.
*Fix:* show an estimated window at cart and checkout (`prep estimate + ride time`, stated as a
range with "we'll confirm when the kitchen accepts"), then replace it with the real number on accept.

**4 · Merchant accept is all-or-nothing.**
Right now a kitchen that has everything except the Mazoe must reject the whole order (M2·2). Every
competitor lets the merchant remove or substitute a line item and continue — DoorDash and Grab both
treat a full rejection as the last resort because a rejected order is usually a lost customer.
*Fix:* item-level "we don't have this" on the accept screen → customer gets a 60-second
approve/cancel prompt with the recalculated total (and, on WALLET, a partial-refund obligation).

**5 · Nothing verifies that the rider at the counter is the right rider.**
The merchant's pickup screen (M3·1) shows the rider's name and bike. Grab and Gojek both require the
rider to show or read an order code at pickup. In a cash market where the merchant is handing over
goods against a payment they've just accepted, "he said he's Tendai" is not evidence.
*Fix:* a 4-digit **pickup code** in the rider's job screen, typed or read at the counter — the same
grammar as the delivery code, reused rather than invented.

**6 · The wallet payment flow only designs the happy rail.**
`pay_now` sends a prompt and waits. In Zimbabwe the prompt fails, arrives late, or the customer pays
by USSD from a different line — and then pays the *wrong amount* to the *right number*, or the right
amount to a number they mistyped. There is no manual-payment path: no merchant number displayed,
no copyable exact amount, no "I paid from another number" route.
*Fix:* a manual fallback on the same screen — merchant number, exact amount, both copy-to-clipboard,
plus a "I've paid — enter my reference" step that lands in the merchant's reference-matching UI.

**7 · The customer never sees "the restaurant confirmed your payment".**
After `pay_wait` the design jumps to the prep countdown. The merchant meanwhile has a whole screen
for verifying the reference against their own statement. If the merchant hasn't confirmed yet, the
customer is in an undesigned limbo — exactly the state where support tickets come from.
*Fix:* an explicit "Payment sent · waiting for the restaurant to confirm" tracker step, with the
reference visible and the 10-minute window still counting.

**8 · Text and targets break the system's own minimums in a dozen places.**
The design system says 12px captions, 44px targets, sunlight-first. I shipped 10–11.5px meta rows
(list rows, tile sub-labels, tracker timestamps), a 26px add-to-cart button on menu rows, and
10px tab labels. On a cheap 5" screen in Harare sun, that is unreadable and un-tappable — precisely
the constraint the whole system exists to serve.
*Fix:* floor body/meta at 12px, promote list meta to 12.5px, replace the 26px round add button with
a 44px control, and re-audit every phone screen at 320px.

**9 · Large white text on `--accent` in the merchant alarm.**
The queue-new takeover (M1·3) puts white 13–15px text on `#00B14F` — about 2.9:1, which is the exact
failure the green split rule exists to prevent. It's the loudest screen in the product and it's the
least legible one.
*Fix:* the alarm surface stays green, but small text on it moves to `--cta-fill` (#00812F) blocks or
white cards; only ≥24px/700 text sits directly on `--accent`.

---

## P1 — competitive gaps a user would feel

**10 · No reorder.** DoorDash's most-used affordance is "Order again"; GrabFood surfaces it on home.
My Orders list is read-only and home has no recents row. One tap should rebuild the cart.

**11 · The menu doesn't scale past ~10 dishes.** No sticky category rail, no jump-to-section, no
search-in-menu. Uber Eats, DoorDash and GrabFood all pin category tabs to the top on scroll. A
25-dish menu on a 320px screen is currently an endless list.

**12 · No cart upsell, and no "add more items".** Once you're in the cart there is no route back to
the menu and no drinks/sides prompt. Grab and DoorDash both attach a small horizontal
"Add a drink?" strip — it lifts basket size and, here, it also softens the fixed delivery fee.

**13 · The rider offer card has no map.** GrabBike, Gojek and Uber all show a mini route thumbnail:
riders judge a job by *where*, not by kilometres. Mine is text-only legs, and the rider has to accept
before seeing geography they know better than the app does.

**14 · The offer timer is a number, not a bar.** 60s counted in text is easy to misread mid-traffic;
every competitor uses a depleting ring or bar tied to the accept button.

**15 · No rider/vehicle identification on the customer's tracking screen.** Grab and Gojek show the
plate number as the largest element in the tracking card, because that is how you find your rider
in a car park. I show "red Honda" once, in the rider-secured card, at 11.5px.

**16 · No safety or help entry point on the food journey.** Express has SOS, report and
get-help-with-this-trip. The food tracking screens have a phone button and nothing else. A vertical
that reuses Express's riders must reuse Express's safety surface.

**17 · No minimum order, small-order fee, or busy-kitchen state.** A $2.50 order carrying a $2.50 fee
is a bad experience for everyone; competitors either set a minimum or add an explicit small-order
fee. Similarly there is no merchant "we're slammed, +10 min" control — Grab's merchant app has one,
and without it kitchens reject orders instead.

**18 · The merchant queue is a list of rows, not a kitchen board.** Once three orders are live, my
dashboard can't tell you which is closest to burning: no per-order prep countdown in the row, no
New / Cooking / Ready grouping. GrabMerchant and DoorDash's tablet both use exactly those columns.

**19 · No printing, no second device, no roles.** Real kitchens print tickets and have a cashier plus
a cook. One tablet, one session, no ticket output is a workflow assumption that should be stated and
tested, not implied.

**20 · Cancellation consequences aren't stated on CASH.** The cancel sheet says "free before the
rider collects", but not what happens after the merchant has cooked on a cash order — who eats the
food cost. Uber and DoorDash both state the charge before the destructive tap.

---

## P2 — polish

21 · No price-tier or cuisine filters beyond three chips; no "closes in 20 min" urgency marker on the
list. 22 · The delivery-fee explainer repeats on cart *and* checkout; once is enough. 23 · The
kitchens-near-you strip on home shows two cards and no scroll affordance. 24 · Tracker timestamps are
absolute (09:44) where relative ("4 min ago") reads faster mid-delivery. 25 · The rider's earnings
card shows today's total but no per-hour or acceptance context. 26 · Merchant statement has no export
/ share, which is the first thing an owner asks for. 27 · No empty state designed for "you have no
orders yet" on the customer Orders tab. 28 · The `More · Coming` tile is filler — either name the
next service or drop the tile.

---

## What I'd defend under attack

- **Pay-after-accept, not pay-first.** Slower than every competitor's checkout, and correct here:
  LyniaGo never holds funds, so taking money before a kitchen has agreed to cook would create a
  refund queue nobody can service.
- **"Don't start cooking yet" as a full screen.** Competitors fire the kitchen on acceptance because
  they have dispatch density. We don't, so the cost of a wrong signal is wasted food — the loud
  amber hold is worth the extra step.
- **Code-only proof of delivery.** No photos, no signatures. Cheap phones, expensive data, and a
  code the customer already understands from Express.
- **The float block on CASH offers.** Blocking a rider from a job looks hostile until you watch one
  stranded at a counter $4 short. Showing the arithmetic is the mitigation.
- **Services as tiles, not tabs.** Costs one tap versus a tab; buys a navigation that survives
  Pharmacies and everything after it.

---

## Resolution log

**P0.** 1 · list is photo-led with a 76px thumb. 2 · photoless category-tint block with the name
initial is now the *default* thumbnail everywhere (`FoodThumb`); photos are an upgrade. 3 · arrival
window on cart and checkout (`EtaLine`), confirmed on acceptance. 4 · merchant accept is item-level
("Don't have it") + new customer screen **5·b3 One item unavailable**, 60s to approve. 5 · 4-digit
**pickup code** on the rider's job screen and both merchant pickup confirms. 6 · manual-payment rail
on the pay screen (merchant number / exact amount / reference, all copyable) + new **5·5 Paid another
way**. 7 · new **5·6 Payment sent — waiting for the restaurant**. 8 · every phone caption raised to
the 12px floor, add-to-cart and option rows to 44px. 9 · alarm and cook-now takeovers moved from
`--accent` to `--cta-fill` so white text clears AA.

**P1.** 10 · Order-again row on home + Orders list. 11 · menu category rail, section headers and
search-in-menu. 12 · "Add more items" and a drinks upsell strip in the cart. 13 · mini route map on
both offer cards. 14 · depleting timer bar on the offer header. 15 · plate number promoted on every
tracking card (`RiderCard`). 16 · Get help · Share trip · SOS row on live tracking. 17 · minimum order
+ small-order fee state (**3·b4**) and merchant busy mode (+10 min). 18 · new **M1·4 Kitchen board**
(New / Cooking / Ready with per-order clocks). 19 · print-ticket action on accept and on the empty
queue. 20 · cancellation consequence stated at checkout and in the cancel sheet.

**P2.** 21 fee filter + closes-soon marker · 22 fee explainer now only in the cart · 23 third card
peeks in the kitchens strip · 24 relative timestamps in the tracker · 25 $/hour on the rider's
earnings line · 26 statement download / WhatsApp · 27 new **0·b1 Orders · empty** · 28 the filler
"More" tile is gone (3 tiles: Send · Food · Pharmacy soon).

---

## Suggested order of work

1. P0 #8 and #9 (legibility) — cheapest, and they touch every screen.
2. P0 #1, #2, #3 (photos, photoless fallback, ETA promise) — the discovery-to-checkout spine.
3. P0 #4, #5, #6, #7 (partial accept, pickup code, manual payment, payment-confirmed state) — the
   money spine.
4. P1 #10, #11, #16, #18 — reorder, menu scale, safety, kitchen board.
