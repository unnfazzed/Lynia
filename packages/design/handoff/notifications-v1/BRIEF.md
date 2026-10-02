# Claude Design prompt · Notifications (both sides) — LyniaGo

Prepared 2026-10-02 from the closed-testing build (vc 42), the server feed
(`apps/api/src/notifications/notifications-feed.service.ts`) and the October handoffs
(Calm Mint v2, Rider v2, Order flow v2, Tab bar v1).

## What to improve, and in which direction

The screen still uses the August look: a plain back-arrow header, a flat list with hairline dividers, and
a mint circle on every row. Apart from the look, four things are wrong with it:

1. **One parcel fills the list.** Every status change is its own row, so a single delivery produces six or
   more lines. Group the rows by order and show only the latest update.
2. **Every row looks the same.** "Delivered" looks exactly like "Account paused" or an SOS alert. Each row
   should show its kind through the icon tint: neutral, good, money, warning or danger.
3. **Restaurant, shop and pharmacy orders never appear.** The server skips every order that isn't a parcel
   (`notifications-feed.service.ts:410`). This is server work, but the design should draw these rows so the
   server change has something to build to.
4. **Missing states.** Only the empty state is drawn. There's no "notifications are off" banner (Rider v2
   J8 already draws one) and no undo after swiping a row away.

**Direction:** keep it calm and in the October style, a quiet history that lets you jump back into an
order, not a second Orders tab. Group rows by day, then by order. Give urgent items colour. Don't add
badges, settings or extra features.

---

## Paste this into Claude Design

> You're redesigning the **Notifications** screen for **LyniaGo**, a cash delivery app in Harare, Zimbabwe
> (one Android app, Expo / React Native, customers and riders in the same app). Today it's an
> older-generation screen: a plain AppBar, a flat hairline list, a mint disc on every row. Bring it into the
> **Calm Mint v2 / Rider v2** visual language (attached): the pushed-screen **AHeader**, white **r16 cards**
> on the page background, the **LRow** ledger-row grammar and **day groups** from Job history (C12). Draw
> every frame at **360×720** and check each at **320×640**.
>
> **How people get here:** the 44px **bell** on the MintTop header (both sides; 8px gold `--highlight`
> unread dot) and the **Notifications** row on both Account tabs ("3 new"). Opening the screen marks
> everything read; the rows that were new keep their dot for this visit only.
>
> **What the feed contains** (titles are today's, keep the meaning, improve the words if you need to):
> - **Order updates, customer voice:** Rider assigned · Rider on the way · Parcel collected · On the way to
>   drop-off · Delivered (rate your rider) · Delivery couldn't be completed · Order cancelled · No riders
>   yet · Your rider had to cancel · The window closed · New offer · Fare updated · A rider's online near you.
> - **Order updates, rider voice:** You got the job · Heading to pickup · Parcel collected · Delivered ·
>   Delivery not completed · Order cancelled.
> - **Restaurant / shop / pharmacy orders** (new, use the venue name as the headline, e.g. "Sadza
>   Republic"): accepted · being prepared · rider collected · at your door · delivered · item swapped
>   (needs your OK).
> - **Account:** You're verified · ID check needs another look · Account paused · Account blocked ·
>   Account restored · Wallet credited.
> - **Safety & support:** SOS on your delivery · An update on your delivery · Your delivery is back on
>   track · Your report was resolved.
>
> **Frames:**
> - **N1 · Customer, populated.** Day groups (Today · Yesterday · then "Mon 28 Sep"). **One row per
>   order**, showing its latest update; earlier updates collapse into a muted "4 earlier updates" line.
>   Tapping a row opens that order. The icon disc shows the tone: neutral (mint), good (ok green), money
>   (banknote), needs-you (warn), danger (`--danger-wash`). An unread row has the gold dot and a 700 title.
> - **N2 · Expanded order.** The same order row opened inline to show its timeline (small step dots, time
>   on the right), like the order screen's step track but quieter.
> - **N3 · Rider, populated.** Jobs, Money (wallet credited, top-up), Account (verified, paused,
>   restored). Rider-voiced copy. A danger row for "Account paused" sits first while it's in force.
> - **N4 · Dual-role user.** Someone who is both a customer and a rider. Does the feed follow the side
>   they're on (customer side shows orders, rider side shows jobs, account rows on both), or show everything
>   with a small "Rider" / "Customer" tag? **Draw your answer and say why.**
> - **N5 · Needs you.** A row that needs action (new offer, item swapped, ID check failed) gets an inline
>   SmBtn ("See offer", "Review swap", "Try again"). Only these rows have a button.
> - **N6 · Notifications off.** The phone's notification permission is denied: the Rider v2 **J8** warn
>   row at the top ("Turn on" → phone settings). Customer and rider copy.
> - **N7 · Swipe to dismiss.** A row mid-swipe (follows the finger, fades), then gone with a toast
>   "Notification removed" + **Undo**.
> - **N8 · Empty.** Calm Mint v2 empty-card geometry (mint wash, r20, the Home empty-state art). Customer:
>   nothing yet, plus one "Send a parcel" action. Rider: nothing yet, no action.
> - **N9 · Loading** (skeleton rows in the card) and **N10 · Couldn't load** (wifi-off, "Try again").
>   Assume patchy 2G/3G.
>
> **Rules:**
> - Write every string into one `N` copy object. It ships verbatim.
> - Tap targets ≥ 44px, primary 52px.
> - Use only Calm Mint v2 tokens. Gold is only for unread.
> - No settings on this screen, no filters or tabs, no "Mark all read" (opening the screen does that), no
>   badges, no illustrations on rows, no confetti.
> - Times read "now", "2 min", "1 hr", "Yesterday", then "28 Sep".

## Attach

1. `packages/design/handoff/rider-v2/` — `README.md` (§ Shared components: MintTop, AHeader, Card, LRow,
   Notices/toast; § Jobs board J8; § Account C1/C6/C12), `design/rv-kit.jsx`, `design/rv-account.jsx`.
2. `packages/design/handoff/calm-mint-v2-2026-10/README.md` (§2 Home: bell + unread dot, H6 empty card).
3. `packages/design/handoff/order-flow-v2/README.md` and `code/copy.ts` (`O.g.push`, merchant-order push copy).
4. `packages/design/handoff/tab-bar-v1/README.md` (§ Badges, so the unread treatment matches).
5. `packages/design/tokens/*.css`.
6. A screenshot of today's screen from the closed-testing app, labelled "current, to replace".

---

## Outside the design

- **Restaurant, shop and pharmacy orders need server work** before N1's merchant rows can be real: the
  feed has to stop skipping those orders, with row copy taken from the existing push messages (`O.g.push`).
- **Grouping one order's updates into one row can be done in the app.** Each row already carries its
  order's id, so this needs no API change.

When the export comes back, put it in a new `packages/design/handoff/notifications-v1/` folder and add a
ledger entry in `docs/DESIGN-DEVIATIONS.md`. Then `app/notifications/` can be aligned to it and the old
August gallery screens (`LJ.notifications`, `LJ.notif_empty`) retired.
