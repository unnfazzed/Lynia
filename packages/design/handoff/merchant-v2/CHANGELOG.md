# Merchant v2 — changelog

## 2026-10-05 · follow-ups (D-77, Part A)

New frames live in `MerchantV2Followups.dc.html`, imported at the bottom of `MerchantV2.dc.html`.

### New frames
- **K2a Reasons sheet kitchen**: Out of an ingredient · Too busy right now · Closing soon · Something else. CTA "Turn down #A1B2"; "Too busy" links to busy mode.
- **S2a Reasons sheet shop**: "Out of stock" replaces the ingredient reason. "Something else" opens a one-line optional note.
- **K3a Problem sheet**: "Something ran out" (goes to the S2 swap/remove list) · "Can't finish this order".
- **K3b Cancel cash order**: cancel reasons; "Cash order · nothing to refund"; CTA "Cancel order".
- **K3c Cancel wallet order**: "The customer is refunded first…"; CTA "Refund $9.50 and cancel".
- **K1b Board cash and scheduled**: CASH TO COME BACK · n (gold LATE chip + Call), SCHEDULED · n (dashed cards).
- **K1c Board empty**: "All quiet for now", open state.
- **K5b Delivered wallet**: no cash card, no CTA.
- **K5c Goods back**: "GOODS BACK TO YOU", "I got the food back" / "It wasn't returned". Shops: "I got the goods back".
- **T2b Money this week**: rows by day, newest first.
- **T1b Live bar states**: ringing (sun gold), rider at the counter, waiting for the customer, counts only.
- **A1 Arrival states / A2 ETA states** (need B1): coming to vs at your counter, K4 sub-line, and the copy used when the estimate is unknown.

### Changed frames
- **T1 Menu**: "+ Add a dish" header action in the top card, clear of the live bar. Shops: "+ Add an item". Category chips are now 44px.
- **T2 Money**: adds a "cash on its way" row (#A120). The rejected row reads "You couldn't take it · Too busy" with "No sale" instead of "—". Missed orders use "Missed · no answer in time".
- **T3 Account**: adds a HELP group with "Help & support · WhatsApp".
- **S4 Book a rider**: item chips and "+ Add" are now 44px. No booking-terms UI: Send liability terms live in the Terms & Conditions accepted at sign-up.
- **K3**: "Problem with this order?" pill is now 44px.
- **K1**: "Hand over" pill is now 44px. **P1**: "Zoom" is now 44px. **T2**: "Call" pill is now 44px.

### Not redrawn
- Sign-in, onboarding and the settings sub-screens: the restyle stands.
