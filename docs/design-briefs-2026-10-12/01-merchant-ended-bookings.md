# 01 · Ended bookings on the Deliveries board (MJ-RH2)

**App:** Merchant (shops and kitchens that book their own riders). **Extends:** merchant-v2 **S1** shop home board, **K1b** cash rows, **K5c** goods back. **Routes:** `/deliveries` and `/queue`.

## The problem

A shop books a rider for a buyer. When the booking **ends badly**, the card just vanishes from the board. The bad endings are:

- no rider picked in time,
- the rider cancelled,
- not delivered.

"Try again" and "Call the rider" only exist on the booking's own page, and nothing links to that page any more. After a failed delivery the rider can still be holding **up to $150 of the shop's goods**, while the board shows nothing.

A clean **delivered** booking also vanishes without a word.

## Who and when

- A shop owner or cashier, standing at the counter. They glance at the board between customers.
- Within the last 24 hours. Ended bookings older than that drop off, and the data is already on the phone.

## Must

- Ended bookings show **on the board**, in the board's own card style. No new screen.
- Each ending has **one clear next step**:

  | Ending | Next step |
  |---|---|
  | Not delivered | **Call the rider** to get the goods back. This is the urgent one. |
  | No rider picked in time | **Try again** (re-sends the booking; the fare can be raised ±$0.50, minimum $1.50, on the booking page) |
  | Your rider cancelled | **Try again**, unless LyniaGo already re-sent it: then "LyniaGo sent it out again · follow it" |
  | Cancelled by LyniaGo | **Message LyniaGo** (WhatsApp). Not retryable. |
  | Cancelled by the shop | Try again, or dismiss. Low weight. |
  | Delivered (nothing owed) | A quiet result. It must not shout. |

- Tapping the card opens the existing booking page (it already has the full retry and fare stepper).
- The rider's phone is **only available for a not-delivered booking**. Other endings have no number to call.
- The data has **no end time**, only when the booking was made. Don't draw "ended 14:02".
- Fields available: items summary ("Brake pads"), drop-off landmark, rider name + bike reg, agreed fare, the not-delivered reason (couldn't reach buyer / refused / wrong address / bike broke down), and who cancelled.

## Your call

- **Where they live.**
  - Not delivered and "no rider" probably belong in **NEEDS YOU**.
  - Delivered may want its own quiet section or a single fold such as "Done today · 3".
  - Or the delivered ones simply leave, as K5b does for kitchen orders, with a one-off toast. You decide.
- How a not-delivered card looks next to a normal NEEDS YOU card. Red goods strip (K5c)? A danger-wash row?
- Whether the 5-segment bar stays on ended cards or is replaced.
- Whether ended cards can be swiped or dismissed, or simply age out after 24h.
- The **dark live bar** on the other tabs: should "Not delivered" rank in it? Today it shows ringing → rider at counter → waiting → counts.

## Copy to start from (already in the app)

- "Not delivered" · "No rider picked in time" · "Your rider cancelled" · "Booking cancelled" · "Cancelled by the LyniaGo team"
- "The rider couldn't reach the buyer." · "The buyer refused the delivery." · "The address was wrong." · "The rider's bike broke down."
- "Call the rider to get the goods back." · "Call Blessing M." · "Try again · $3.50" · "Message LyniaGo"
- "LyniaGo sent it out again · follow it" · "Goods coming back · #A117" · "Delivered"
- Card pattern (S1): "Car battery · 3 riders offered" / "Pick one before the offers expire"

Suggested lines (keep them this short): "Not delivered · get the goods back" · "No rider picked · Try again" · "Delivered · Hillside shops".

## Draw

1. The board (S1) with one card of each kind: not delivered, no rider, rider cancelled. Show the cards alongside live ones, so the ranking is visible.
2. The delivered treatment (section, fold or toast).
3. A not-delivered card at 320×640 and font scale 1.3 (the long reason line).
4. Optional: the live bar on another tab while a not-delivered booking exists.

Suggested ids: `S1c`, `S1d`, …
