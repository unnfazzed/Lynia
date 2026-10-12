# 07 · Show the venue's own note on "couldn't take your order" (U66)

**App:** Customer, restaurant / shop / pharmacy orders. **Extends:** order-flow-v2 **D3b**. See `resources/screens/D3b.png` and `D5a.png`.

## The problem

When a venue turns an order down, it picks a reason. If it picks **"Something else"**, it types a short note (at most 80 characters). The merchant screen even promises them: "Rudo sees this note". The note only goes into the **push notification**. If push is off or dismissed, the customer never sees it. D3b shows the generic "Nothing was charged."

## Must

- On D3b, show the venue's note when there is one, attributed to the venue and in its own words (quoted). It is untrusted text: render it as plain text, max 80 characters, wrapping to at most 3 lines.
- When there's no note, today's D3b is unchanged.
- The note sits with the venue card (venue disc, name, "Order #… · 12:18", "No charge") or right under it. It must not push "See other places nearby" off the first view at 320×640.
- Follow **D5a**'s drawn reason pattern ("Reason from the pharmacist" + value). Reuse it, don't invent a new box.

## Your call

The label ("From Sadza Republic"? "Their note"?), and whether the note sits inside the venue card or under it.

## Copy to start from

"{v} couldn't take your order" · "Nothing was charged." · "They're too busy right now. Nothing was charged." · "See other places nearby" · "No charge" · "Reason from the pharmacist"

Suggested label: "Note from {v}".

## Draw

1. D3b with a 2-line note.
2. D3b with an 80-character note at 320×640 and font scale 1.3.

Suggested id: `D3g`.
