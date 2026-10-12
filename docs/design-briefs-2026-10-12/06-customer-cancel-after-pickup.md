# 06 · Reach the rider after cancelling post-pickup (U21)

**App:** Customer, Send a parcel. **Extends:** after-send-v2 **18a** "Cancelled by you", composed like **17** Not delivered. **Route:** `app/order/[id].tsx`.

## The problem

The customer cancels after the rider has already **collected the parcel**. Screen 10b warned them: "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly." Then 18a shows only "You cancelled this order", "Nothing to pay." and "Send again". There's **no rider, no Call, no WhatsApp**: they've been told to arrange it with someone they can't reach. (The rider can call the sender, so contact only works one way.)

## Must

- A variant of 18a for **cancelled after pickup** (by the customer). Also check **18b** (the rider cancelled after pickup), which has the same hole.
- Show **the rider card** (photo, name, rating, plate, Verified) with **Call and WhatsApp**.
- The primary action becomes **Call the rider**. "Send again" drops to secondary. This mirrors 17.
- Keep "Nothing to pay." The customer isn't charged for the cancel.
- A line that says what to agree on: getting the parcel back.
- The number may fail to arrive. Use the drawn 2.15 state ("Call and WhatsApp work once Tendai's number comes through.").
- The cancel-before-pickup 18a stays exactly as it is.
- Engineering note, not the designer's problem: the server will reveal the rider's number to the customer for this case only.

## Your call

- How long this stays useful. Should the card fade, or say "Numbers are hidden now the trip's over", after the parcel is back? (There's no "returned" signal yet, so propose one if you want one.)
- Whether the map shows the rider's last position or stays dimmed.
- A Help link (LyniaGo support) for when the rider doesn't answer.

## Copy to start from

- "You cancelled this order" · "Nothing to pay." · "Send again" · "Call rider" · "Call" · "WhatsApp" · "Call support"
- 17: "The parcel is still with Tendai. Call to agree how to get it back, or try the drop-off again."
- 10b: "Tendai already has your parcel. If you cancel, you arrange getting it back with them directly."

Suggested: "Tendai still has your parcel. Call to get it back."

## Draw

1. 18a after pickup (360×720).
2. The same frame with no number yet (2.15 line).
3. 18b after pickup (the rider cancelled), if it differs.
4. 320×640 and font scale 1.3 of frame 1.

Suggested ids: `18d`, `18e` (or `2.34`+).
