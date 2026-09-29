# Merchant go-live runbook (ops)

**What this covers:** switching a self-signed-up business live, the ops queue, and the pilot numbers.
**Source:** merchant web upgrade L1, `docs/plans/2026-09-29-merchant-web-upgrade-plan.md` (D5, §11
CEO-10) and `docs/designs/merchant-web-upgrade.md` L1.5.

Two sections arrive later. Holds and prohibited goods on bookings come with L2 (Book a rider). Owner
transfer and lost-number recovery come with L4 (Team).

---

## 1. What "go-live" means

- A business signs itself up in the merchant web: phone and WhatsApp code, then "What do you sell?",
  its name, a map pin and a landmark. It starts **dormant**.
- **Going live makes a restaurant findable by customers.** It appears in the app's restaurant list and
  can take food orders. The flag is `merchants.pilot_enabled`, and the go-live switch is its only
  writer.
- **Restaurants only, for now.** A shop has nothing a customer can find until the LyniaGo Shops section
  ships, so the switch refuses shops with `shops_not_open`. Shops still use the merchant web from day
  one; Book a rider (L2) needs no go-live.
- Book a rider never needs go-live. It runs at Send's trust level: the $150 value cap, the disclaimer
  and holds.

## 2. The daily queue

Admin console → **Merchants** → filter **Awaiting go-live**. That lists restaurants not yet switched
on, newest first, with the landmark and a masked contact phone. The API is
`GET /admin/merchants?filter=awaiting_go_live`. The **Shops** filter (`?filter=shops`) lists signed-up
shops. There's no go-live call for them, but ops can call about Book a rider.

**Target:** call every new restaurant within **1 business day**. The owner's `/setup` checklist tells
them to expect that call.

## 3. The call: what to check before switching a restaurant on

Open the merchant's detail page. It shows the business contact phone in full, because that's the number
riders are given at pickup, plus the pin.

1. **They answer the contact phone.** Riders will call that number at pickup.
2. **The pin is where they are.** Check it with street view, a photo from the owner, or a visit. A wrong
   pin sends every rider to the wrong place.
3. **It's a restaurant** (cooked food). If they're really a shop, they signed up with the wrong type. It
   can't be changed in the app; note it and escalate. It's a support fix.
4. **At least one dish has a photo and a price.** The switch enforces this (`no_live_dishes`). A photoless
   dish is a draft that customers never see.
5. **Opening hours are set.** Without hours the restaurant reads as closed.
6. **The owner's name is recorded.** Sign-up asks for it, and it shows on the merchant's team.

## 4. Switching on and off

- **On:** merchant detail → **Go live**, with an optional note (what you checked). The API is
  `POST /admin/merchants/:id/pilot {"enabled": true, "note": "…"}`, and it writes audit row
  `merchant.go_live` in the same transaction.
  - The switch refuses `shops_not_open` (a shop), `no_location` (no pickup pin) and `no_live_dishes`.
  - Setting a value the merchant already has writes nothing.
- **Off:** the same button, or `{"enabled": false}`, writes audit row `merchant.go_dormant`. It's always
  allowed. Use it for a restaurant that has stopped answering or closed, or while a complaint is looked
  into.
- Both audit actions are reserved, so the free-text audit endpoint can't forge them.

## 5. Things to know

- **Access comes from the team table now, not the account's role.** A business's owner is a row in
  `merchant_members`. Since L1, `POST /merchant/become` no longer changes anyone's `profiles.role`, so an
  owner keeps a working customer app.
- **L1 is forward-only once a business has signed up through it.** Rolling the API back to the old
  role-based guard would lock those owners out, because nothing writes `role = merchant` any more. Fix
  forward.
- **The `RESTAURANTS_ENABLED` kill switch gates the whole merchant web.** From L2 that includes every
  shop's Book a rider. Pulling it in an incident stops those bookings too.
- **Sign-up refuses** a held account, a banned or suspended rider, and a pin outside the area LyniaGo
  covers (the 25 km Send corridor).

## 6. Bookings (Book a rider, L2)

A business books a LyniaGo rider from its own pin for its own customer. Each booking is an ordinary Send
order whose customer is the business's **booking account**: a customer profile named after the business,
with the phone `business:<merchant id>`. Nobody can sign in to it. In the console, its orders show the
customer as "Business: {name}" and its phone as the business's contact phone, and it doesn't appear in the
Customers list.

- **Pause one business's bookings:** open the business in Merchants, follow "Booking account", and put
  that account on hold (the ordinary customer hold). Every new booking from any team member then gets
  "Bookings are paused for this business." Lift the hold to resume. A single team member's own hold, or a
  banned or suspended rider account, stops only that person from booking.
- **Prohibited goods** (prescription medicine, weapons, drugs, cash). A rider who finds them at pickup
  does not cancel: in Send every rider cancel is a strike and re-broadcasts the job. They use "Report a
  problem" on the job (type Other: "prohibited goods") and message support. Then:
  1. Cancel the booking from the order's admin page with the reason **"Safety concern"**. An admin cancel
     carries no rider strike and no re-broadcast; the business sees "Cancelled by the LyniaGo team".
  2. Hold the business's booking account (above) while you talk to the owner.
- **A business can cancel only before pickup.** After pickup the goods are with the rider: the business
  calls the rider, and ops can still cancel from the console.
- **Money:** the business pays the rider the picked fare in cash at pickup (Send's model). There is no
  cash-on-delivery: the rider collects nothing from the buyer. The declared value is capped at $150.
- **A business's own team can't take its deliveries.** The pick refuses an offer from a team member (the
  business holds the delivery code, so they could deliver to themselves).

## 7. Pilot numbers (CEO-10)

Run against a read replica or with care. The booking queries arrive with L2 (`merchant_bookings`).

```sql
-- Sign-ups per day by type (and shop kind)
SELECT date_trunc('day', m.created_at) AS day, m.business_type, m.shop_kind, count(*)
FROM merchants m
GROUP BY 1, 2, 3
ORDER BY 1 DESC;

-- Restaurants waiting for their go-live call, oldest first (the 1-business-day target)
SELECT m.id, m.name, m.created_at, now() - m.created_at AS waiting
FROM merchants m
WHERE m.business_type = 'restaurant' AND m.pilot_enabled = false
ORDER BY m.created_at ASC;

-- Sign-up time for brand-new numbers: account created (code verified) → business created, in minutes.
-- The design's success criterion is a median under 5 minutes across the first 5 businesses.
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (m.created_at - p.created_at)) / 60) AS median_minutes
FROM merchants m
JOIN merchant_members mm ON mm.merchant_id = m.id AND mm.role = 'owner'
JOIN profiles p ON p.id = mm.profile_id
WHERE m.created_at - p.created_at < interval '1 day';
```
