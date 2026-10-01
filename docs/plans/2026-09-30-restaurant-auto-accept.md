# Restaurant auto-accept

**Status:** built (2026-09-30). **Owner:** founder. **Design ledger:** D-50 in `docs/DESIGN-DEVIATIONS.md`.

## Why

Most restaurants still take orders by phone. Today an in-app order waits 3 minutes for the restaurant to
tap Accept in the merchant app, and is cancelled if nobody does. A restaurant that isn't watching the app
loses every order. This change lets such a restaurant keep working the way it does now, answering the phone,
while LyniaGo handles the rider, the tracking and the cash. The goal is to move restaurants onto the app over
time rather than make the app a condition of joining.

## The workflow

**Setup.** None: **Accept orders automatically** is on for every restaurant, existing and new (migration 0064,
owner decision 2026-10-01). A restaurant that wants the 3:00 accept window back turns it off itself (merchant app:
Account → Taking orders), or ops do it (admin: merchant page → Taking orders). **Show our number to customers**
is on only if the restaurant agreed. Opening hours are enforced by the server when set; a restaurant with none
set reads as open.

1. **The customer orders.** Accepted only inside the restaurant's hours (Harare time). The order goes
   straight to cooking at the restaurant's usual prep time (`prepBaselineMinutes`, else 20 min, plus 10 in
   busy mode). The customer sees "Confirming", can cancel free, and can call the restaurant if it agreed.
2. **The kitchen is confirmed.** No rider is sent until one of:
   - the restaurant taps **Got it, we're making it** (or **Food is ready**) in the merchant app;
   - ops phone the restaurant from **Orders to confirm** in the admin console and tap **Confirmed**.
   Ops can also log **No answer** (and call again) or **Can't make it** (cancel; the customer is told).
   After 5 minutes unconfirmed the order turns **urgent** at the top of the ops list. After **1 hour** unconfirmed
   it is cancelled automatically and the customer is told nothing was charged (owner decision 2026-10-01).
3. **Changes agreed by phone.** Before pickup, the restaurant or ops can change quantities or remove lines.
   The totals are recomputed on the server and the customer gets a push with the new total.
4. **The rider search** starts 8 minutes before prep time ends, or straight away if the kitchen was
   confirmed later than that. Dispatch is unchanged from there.
5. **Pickup.** The rider taps **Collected**; the server accepts it only within 150 m of the restaurant's pin.
   The rider's cash debt to the restaurant opens then, as with the code.
6. **Door and cash back** are unchanged.

## The five safeguards

| # | Risk | What the code does |
|---|---|---|
| 1 | The kitchen never hears about the order | Dispatch is gated on `kitchenConfirmedAt`; escalation after 5 min; auto-cancel after 1 hour; free customer cancel until confirmed |
| 2 | "Collected" without proof | Geofence (`RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM`, 150 m); the generic `advance(picked_up)` is refused for food orders, so no path skips the check or the debt |
| 3 | Orders at a closed kitchen | `placeOrder` checks the weekly hours in Harare time (`harareWallClock`), not only the manual Closed switch |
| 4 | Ops can't act for restaurants | Admin call list, confirm, no answer, edit items, order settings; an ops cancel of a food order now clears kitchen/dispatch state and notifies customer, rider and restaurant |
| 5 | Phone numbers exposed | Customers see the restaurant's number only with `showPhoneToCustomers`; the payment number only on wallet orders; the customer's number is on the restaurant's own views only |

## Where it lives

- Schema: `merchants.auto_accept` (default on, 0064), `merchants.show_phone_to_customers`; `orders.auto_accepted`,
  `kitchen_confirmed_at/by`, `kitchen_escalated_at`, `ops_no_answer_at`, `items_edited_at` (migration 0063).
- Config: `RESTAURANTS_AUTO_ACCEPT` in `packages/shared/src/restaurants-order.ts`.
- API: `FoodOrderService` (`placeOrder`, `cancelUnpaid`, `confirmKitchenAsMerchant`, `editItems`,
  `confirmCollected`, `sweepAutoAccepted`), `food-order-ops.ts` (shared confirm/edit),
  `AdminKitchenService`, `harare-clock.ts`.
- Routes: `POST /merchant/orders/:id/{confirm-kitchen,edit-items,collected}`, `PATCH /merchant/order-settings`,
  `GET /admin/kitchen-confirmations`, `POST /admin/orders/:id/{kitchen-confirm,kitchen-no-answer,edit-items}`,
  `POST /admin/merchants/:id/order-settings`.

## Open decisions

- **Ops hours.** Outside them nobody confirms by phone, so an order the restaurant doesn't confirm in its app
  waits, then is cancelled after 1 hour.
- **Tuning.** 5 min escalation, 1 hour auto-cancel, 8 min dispatch lead and 150 m geofence are first guesses; adjust on real data.
- **Moving restaurants up.** Track per restaurant who confirms (ops vs app) and switch a restaurant off
  auto-accept once it confirms most orders in the app.
