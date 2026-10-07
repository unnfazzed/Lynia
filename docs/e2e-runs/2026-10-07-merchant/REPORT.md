# Merchant journey audit — 2026-10-07 (report only)

**Verdict: the core restaurant order works end to end, but 1 blocker and 5 high-severity issues would cost merchants orders, rider hand-overs, menu listings and pharmacy safety.** No code was changed by this run.

How it was run:
- **Live:** local stack (API + PostGIS + Redis), the merchant web as its production static export served the way Cloudflare serves it, Playwright/Chromium at 360×720 and 320×640. The test played owner, cashier, second phone, customer and rider.
- **Code review:** an adversarial multi-agent review. Only 2 of its 9 lanes finished (sign-in/entry, board/ringing) before a usage limit. The other 7 lanes (order lifecycle, book a rider, money, listing, team/branches, speed, attacks) are covered by the live run only.
- **Merchant unit tests:** 69 files, 492 tests, all pass.

Evidence tags:
- **LIVE** means reproduced in the browser.
- **CODE ✓** means a reviewer claim I re-checked in the source.
- **CODE** means a reviewer claim not independently re-checked.

## Blocker

| ID | What the merchant hits | Evidence |
|---|---|---|
| MJ-B1 | **New orders don't show or ring on any pushed screen.** This covers an order's cooking or hand-over ticket, the Rx check, hours, shop front, taking orders, team, riders, branches and bookings. Only the Orders board and the tab bar's LiveBar poll and ring. The open tab still counts as "online", so the 3-minute window runs. The order is then cancelled as `shop_closed`, and the customer is told the venue couldn't take it. | **LIVE**: the owner sat on #C012's cooking ticket. Order #4141 arrived, nothing showed or sounded, and it was cancelled `shop_closed` about 3 minutes later ([01](img/01-ticket-no-ring.png)). `components/Kitchen.tsx`, `lib/use-queue-poll.ts` (used only by `queue/page.tsx` and `LiveBar.tsx`). **Fix:** move the queue poll and the alarm into `KitchenConnectionProvider`, and show a ring banner on every (app) screen. |

## High

| ID | What the merchant hits | Evidence |
|---|---|---|
| MJ-H1 | **The pickup code changes every time the hand-over screen opens.** A second staff phone, or the same phone after Back and reopen, gets a new code. The code still shown on the first phone is dead, so the rider gets "That code doesn't match" and eventually a lockout. This hits shops, pharmacies and hand-accepting kitchens. | **LIVE**: phone A showed 545 180 and phone B showed 077 528. A kept showing 545 180, which was refused. Reopening A showed 667 709 ([02](img/02-phone-a-code.png), [03](img/03-phone-b-code.png)). `queue/order/page.tsx` `usePickupCode` → `revealPickupCode` rotates (N-16). **Fix:** make reveal idempotent while a rider holds the order. |
| MJ-H2 | **An order that rang during a data drop is cancelled about 20 s after the merchant reconnects.** The "clock pauses while offline" rule only pushes the deadline forward one sweep (20 s) at a time. | **CODE ✓** `food-order.service.ts:1236-1241`. **Fix:** store the remaining time when pausing and restore it when the merchant is back. |
| MJ-H3 | **Add a dish on a phone: "Save changes" sits above the required photo.** The tablet side column stacks below the buttons. Owners save a name and price, get "Draft · add a photo to go live", and customers never see the dish. | **LIVE** ([04](img/04-add-dish-save-above-photo.png)). `components/menu/DishEditorSheet.tsx:77-81` (`kitchen-aside`). **Fix:** put the photo first in the phone layout, and label the button for a dish with no photo honestly. |
| MJ-H4 | **Pharmacy "Swap for…" can add prescription-only medicine with no prescription check.** The new line also isn't flagged `rxRequired`. | **CODE ✓** `order-substitution.service.ts:196-203`. **Fix:** refuse a swap to an `rxRequired` item unless the prescription is approved. |
| MJ-H5 | **A pharmacy with no pharmacist ticked can list Rx items.** Their orders can then never be packed ("Check the prescription before marking packed"), and non-pharmacists get no cue. | **CODE ✓** `merchant.service.ts:1110` (`assertRxAllowed` checks only `shopKind`). **Fix:** require a ticked pharmacist first, and show "Needs a pharmacist" on the ring and the ticket. |

## Medium

| ID | Finding | Evidence |
|---|---|---|
| MJ-M1 | **Auto-accept contradicts itself.** The ring says "LyniaGo accepted this for you", then "59:44 to answer" and an **Accept** button. Taking orders says "New orders go straight to cooking. Confirm each one so a rider is sent." If nobody confirms, the customer waits up to 60 min and is then cancelled (`kitchen_unconfirmed`). | **LIVE** ([05](img/05-auto-accept-ring.png)). `lib/vocabulary.ts`, `ordering/page.tsx`. This needs a copy or design decision. |
| MJ-M2 | "Can't take it" on an auto-accepted order throws away the reason and the note the sheet promises the customer will see. | **CODE ✓** `queue/page.tsx:147` (`cancelPreparing(orderId)` only). |
| MJ-M3 | The item-change "New total" leaves out the small-order fee, so it disagrees with the cash the merchant later collects. | CODE `lib/substitution.ts:37` |
| MJ-M4 | "Accept with N changes" promises the customer 3 min to OK even for removals only. Removing every line cancels the order while the screen says "Accepted". | CODE `RingingScreen.tsx:147` |
| MJ-M5 | **Security:** the sign-in `next=` guard is bypassed by a tab or newline (`/%09/evil.example`), giving an off-site redirect right after a real OTP sign-in. | **CODE ✓** `lib/merchant-access.ts:65-69`. **Fix:** validate with `new URL(next, origin).origin`. |
| MJ-M6 | Signing out while an order rings leaves the alarm looping on the sign-in screen. | **CODE ✓** `KitchenConnectionProvider.tsx:156`: `signOut` never stops the alarm. |
| MJ-M7 | The presence socket doesn't recover after reconnecting with an expired token. The merchant reads as "dark", which feeds MJ-H2. | CODE `lib/queue-socket.ts` |
| MJ-M8 | If `/auth/me` fails while onboarding opens, every "Create my business" tap shows raw "location: Too small…", and 5 taps lock the person out for an hour. | CODE `onboarding/page.tsx:80` |
| MJ-M9 | Android Back on the code step or on onboarding step 2 leaves the app and loses what was typed. | CODE `onboarding/page.tsx:35`, `login/page.tsx` |
| MJ-M10 | A scheduled order that starts ringing replaces the order being answered, mid-tap. | CODE `queue/page.tsx:241` |
| MJ-M11 | A scheduled order at an auto-accept restaurant rings "0:00 to answer". | CODE `RingingScreen.tsx:117` |
| MJ-M12 | An order that ends while ringing, or that the customer cancels mid-prep, just vanishes with no toast. A staff member's late "Turn down" is refused silently too. | CODE `RingingScreen.tsx:99`; **LIVE** for the staff race |
| MJ-M13 | Rx check: no countdown, the alarm keeps going, prescription photo links die after 5 minutes, and a pending prescription never reaches NEEDS YOU. | CODE `queue/rx/page.tsx:59`, `lib/board.ts:179` |
| MJ-M14 | Tapping the gold "New order" bar silences the alarm before the Orders page has loaded, and on 2G the gap is seconds. | CODE `queue/page.tsx:95` |
| MJ-M15 | **Book a rider:** an unreadable location link says "Drop a pin instead", but there is no pin control. The server's message overrides the web's own line. Without a Places key, typing an address does nothing. | **LIVE** ([06](img/06-book-a-rider.png)). `map-link-resolver.ts:17`, `deliveries/new/page.tsx:39` |
| MJ-M16 | "Joining a team instead?" with no invite silently bounces back to "What do you sell?". The cashier may then create a duplicate business. | CODE `join/page.tsx:66` |

## Speed and data (measured live)

| What | Result |
|---|---|
| First-ever visit, compressed like Cloudflare | `/login` 251 KB: **2.0 s on 3G, 6.2 s on slow 3G**. `/queue` 313 KB: **1.9 s / 6.0 s**. Fonts are 71–88 KB of that (4 woff2 files). |
| Returning visits and tab switches | 0.1–0.4 s on 3G and 0.8–1.6 s on slow 3G. Fine. |
| **MJ-P1 Idle polling** | The server pushes `food:queue-changed` the instant an order changes, and the web ignores it. A 5 s full-queue poll runs all day: **19 requests and ~24 KB per idle minute with 3 orders**, scaling with the order count. New orders appear about 2.4 s after the event, and up to about 60 s in a background tab. **Fix:** refetch on the socket event, and back the poll off to 15–30 s while the socket is up. |
| MJ-P2 Duplicate calls | Every Orders load calls `/merchant/me`, `/summary/today` and `/scheduled-orders` twice each. Sign-in to landing repeats `/merchant/me` and `/merchant/invites`. |
| MJ-P3 Photo re-downloads | The order screen re-downloads the bag and door photos every 5 s, because each poll returns a newly signed URL (CODE, `merchant-order-proof.service.ts:140`). |
| 320 px | No horizontal overflow on any merchant screen ([07](img/07-ringing-320.png)). |

## Low

- A pending invitee or non-member who opens Money, Menu or Hours reads "This number isn't on a business on LyniaGo yet. Check your data connection and try again." (LIVE)
- A removed staff member is bounced to sign-in within 5 s, which is correct, but nothing says why. (LIVE)
- "Sales" counts auto-accepted orders the kitchen hasn't confirmed yet. (LIVE)
- "Couldn't reach the server" stays on the ringing screen after the connection is back. (LIVE)
- Account "Opening hours 08:00–22:00" hides closed days. (LIVE)
- Onboarding shows "Use my current location" again after a location is set. (LIVE)
- "Accept · ready HH:MM" ignores busy mode's +10 min. (CODE)
- The countdown uses the phone's clock. (CODE)
- The wake lock waits for a tap after a reload. (CODE)
- The OTP cap message gives no wait time. (CODE)
- A dead session strands the merchant on a "check your data connection" screen. (CODE)
- A held number is told to message WhatsApp, with no link. (CODE)
- Sign-out doesn't revoke the server session, and a refresh already in flight can re-create the cookie. (CODE)
- Android Back on the ring leaves the alarm with no order on screen. (CODE)

## Passed live

- Restaurant and shop sign-up.
- Menu category and dish, out-of-stock sheet.
- Hours with a closed day: the E2E-LB-2 fix holds.
- Open/closed switch.
- Taking orders, shop front, preferred riders.
- Team invite → WhatsApp link → join.
- Staff permissions: Money hidden, owner-only pages say so.
- A removed staff member is signed out.
- Full cash order: auto-accept and manual ring with ready-in chips, accept, ready, auto-dispatch in about 10 s, collected, on the way, delivered, "I got $13.00" (disabled until delivered), Money row.
- Two-phone accept/decline race: refused safely.
- Offline tap: honest message.
- Expired access token: refreshed silently.

## Not tested

- Real photo uploads (no storage locally).
- Push.
- Real Android audio and background-tab throttling.
- Production config (Places key, support WhatsApp).
- The 7 unfinished review lanes beyond what the live run touched.
