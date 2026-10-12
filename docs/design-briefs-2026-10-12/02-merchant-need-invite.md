# 02 · "You need an invite" (MJ-M16)

**App:** Merchant, sign-up. **Extends:** merchant-mobile **A3** "What do you sell?" and **A5** Join. **Route:** `/join`.

## The problem

A new cashier signs in and sees A3 "What do you sell?" with a link, "Joining a team instead?". If no owner has invited their number yet, tapping it **silently bounces them back** to A3. They assume the link is broken and register the shop a second time. That leaves a duplicate business, a second owner, and orders split across two accounts.

## Who and when

A staff member on their first day, often with the owner not standing next to them. They are on an unfamiliar app on a cheap phone.

## Must

- An **explaining state on the join screen**, reached from "Joining a team instead?" when there is no invite for this number.
- It says plainly that **the owner has to invite this phone number first**. Show the number they are signed in with, because the wrong number is the usual cause.
- Next steps:
  - **check again** (re-reads invites; the owner may have just sent one),
  - **start my own business** (back to A3, for real owners).
- It must **not** reveal anything about other businesses (privacy rule R2-21). It never says "this number already works at X".
- Invites last 14 days. An expired invite also lands here; it has no separate state.
- It sits in the sign-up flow: no tab bar. Use the A-series back header.

## Your call

- Whether this is a full screen (A5's sibling) or an explaining state in place of the A5 form.
- How to show the "tell your owner" step. A line? A copyable number? Telling them where in *their* app to add you (Account → Team → + Add someone)?
- Whether "check again" is a soft pill or happens on its own when the app comes back to the front.
- The illustration: reuse A5's 64 mint tile, or the empty-state disc.

## Copy to start from

- A3: "What do you sell?" · "Joining a team instead?" · "Next"
- A5: "Join Siyaso Spares" · "Farai added you as **Staff**." · "Not me" · "Start my own business"
- Errors: "That invite isn't there any more. Ask the owner to send a new one." · "Couldn't load your invites."
- Owner side (Team): "+ Add someone" · "Invite ready. Send them the link on WhatsApp."

Suggested lines: "No invite yet" / "Ask the owner to add 077 123 4567 in Team." · "Check again" · "Start my own business".

## Draw

1. The no-invite state (360×720), plus 320×640.
2. Its "checking" moment, if you give it one.
3. Optional: what A3 looks like when they come back, if you change the link at all.

Suggested id: `A5b`.
