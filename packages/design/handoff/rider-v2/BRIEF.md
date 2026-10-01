# LyniaGo Rider v2 — BRIEF

Product decisions behind `Rider v2.html`. Final unless listed under Open questions.

## Jobs board
- Tab root = 8c mint top card + full-bleed map + snapping sheet + tab bar. The sheet peeks at 50% (44% when empty) and opens to full with 16 px of map left.
- The mint card's sub-row shows connection state honestly ("● Online" / "Reconnecting…") and the detected location. It's text, not a control.
- Map: job pins are green pickup dots with a fare pill. The nearest job is selected: its pin gets an ink pill + ring and its card gets the 2 px `--accent-text` border. "You" = 34 px ink bike disc.
- Demand: busy zones are dashed `--accent` circles. The busiest gets a "Busy now" label, and the sheet always carries one line, "Busier near {place} · {km} from you".
- The list is parcels only. Food is auto-dispatched and rings full screen, so with food on the board says so in one line ("Food jobs ring full screen. Keep LyniaGo open."). With food off that line disappears and no copy mentions food.
- Parcel card: tag · km to pickup · asking fare; pickup/drop-off; trip km + item; one 44 px "Make an offer". No countdowns.
- Empty state answers "why no jobs?" (quiet now + peak hours) and points at the nearest busy area. No button.
- Load error and reconnecting retry by themselves and say so. There's no Retry or Refresh anywhere.
- Notifications off = a red-bordered warn notice at the top of the sheet with "Turn on". It's a hint, not a gate.
- "Your offers" sits above nearby jobs. **New: Withdraw** until the customer chooses, with a 5 s Undo toast.
- "Rudo picked you!" is a modal sheet over the board with one button, "Open job".
- Not chosen / taken first / expired = an ink toast. The card and pin just leave.

## Make an offer
- A pushed screen with the Send v2 price step: route strip (no Edit), "Rudo is asking $3.00", 56/700 tap-to-type fare, 52 px − / + $0.50, "usual" band bar.
- ETA = four 44 px chips (5 · 10 · 15 · 20 min), 10 preselected. No free typing.
- A fare well above the band shows a warn notice and can still be sent.
- CTA: "Send offer · $3.20" (the fare is echoed so a fat-fingered digit is visible) + ghost "Skip this job".

## Gates
- One blocking-state pattern: 72 px disc, 22/700 title, 15/22 why, an optional facts box (when it clears / how much / tries left), then primary + ghost pinned above the tab bar.
- Every dead-end gate also offers "Order food and send parcels" (bridge to the customer side).
- Server-reason gates (hold, suspended, top-up) use the danger-wash facts box with dark-red ink, never red text on white.
- Force update hides the tab bar.

## Active job
- The rider-side mirror of After Send: same header (title = stage name, red Help pill), map, sheet, step track, CTA bar.
- Step track: Pickup · Collected · Drop-off · Done (the same labels for food).
- The sheet shows **one stop**: label, name 20/700, distance/ETA, then Call · WhatsApp · Navigate (44 px). Below it sits the cash line (parcel) or the YOURS / OWED TO KITCHEN split (food). Then one row: **"Problem with this job?"**
- **One primary action** per stage: I'm at pickup → I've collected the parcel → I'm at the drop-off → Confirm delivery.
- The Help pill and "Problem with this job?" open the **same sheet**. Its contents depend on the stage:
  - Before pickup: Cancel this job (parcel) / Drop this job (food), Get help, Report, Emergency.
  - After pickup: Can't reach the customer, Can't deliver, Get help, Report, Emergency.
- Cancel always shows the strike count. One strike from a pause, it turns into a danger-wash warning and the button reads "Cancel and pause".
- Can't reach: a 10-minute wait bar with calls logged. "Mark undelivered" unlocks at 10:00. Undelivered doesn't count as a strike.
- Delivery code: 6 boxes (3+3) + numpad. 5 tries, and the last one gets a sharper message. Lockout shows "Call Rudo to re-send" and the new code works without leaving the screen. The code works offline.
- Pickup photo uploads in the background. If it fails, the photo stays on the phone and the job continues (no blocking error).
- Offline: a calm notice ("Your job is saved on this phone — keep riding"). After 4 minutes it turns into a warn notice that still says the job is safe. "Job restored" shows after a restart.
- Done screen: earnings first (+$3.20), then cash collected / returned to kitchen / commission, then optional stars.

## Food offer
- Full screen, no Back. Countdown pill + progress bar; restaurant, km, fare 28/700; the upfront variant shows Pay the kitchen / Collect at the door.
- Hint above the buttons: passing doesn't affect standing.

## Money
- Earnings is the hero: Today | This week toggle, a 40/700 total, the job count, and parcels/food counts. The week view adds a 7-day bar strip.
- Commission balance comes second, with Top up inline. Low = red border. Below the floor / owes = danger wash. At a 0% rate the copy says the rider keeps the full fare.
- Cash with you now shows real values (YOURS / OWED TO KITCHEN). Parcels-only shows one line.
- History: fares are green credits, commission is an ink debit, top-ups are green. Food off hides the filter chips. "Load older" is retired: entries load as you scroll.
- Top up = Send v2 step bar: Provider → Amount → Phone (prefilled from Settings) → Approve.

## Account & the role switch
- The Customer and Rider Account tabs are siblings: identity card (tappable) → **Customer | Rider** segmented toggle (48 px, selected = `--cta-fill`) → side-only rows.
- Rider: a standing card (acceptance, rating, strikes 1 of 3 with a plain-words pause rule and when the oldest strike clears) + Job history · Notifications · Help & support · Settings. The Money and Bike & documents rows are gone.
- Customer: Trip history · Notifications · Help & support · Settings. A customer-only user gets the Become-a-rider card in place of the toggle (start / in progress / under review / failed). Once verified, the toggle appears with a one-line confirmation.
- Rider → Customer: a confirm sheet ("Stop getting jobs?"). During an active job it says the job keeps running and where to get back to it.

## Settings
- One screen: YOUR ACCOUNT → CUSTOMER → RIDER (riders only) → a final card with Sign out and Delete account. Delete stays last on screen, so the account section's two danger rows sit in their own card at the bottom.
- Rider section: Job alerts (test ping / test alarm; off = danger-wash consequence + Open phone settings), Location (off = "You can't receive jobs"), Navigation app (Google Maps | Waze), Top-up number, Bike & documents.
- Permission values come from the phone, never hardcoded.

## Open questions
1. Should FOOD cards ever appear on the board (e.g. a missed offer that's still unassigned)? This design says no.
2. Busy zones need a server-side demand feed (orders per area, last 60 min). What's the minimum the API can give?
3. Should withdrawing an offer have a limit (e.g. 3 a day) to stop spam bidding?
4. Should the "picked you" modal auto-open the job after 10 s if the rider doesn't tap?
