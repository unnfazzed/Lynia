# Own bikers v1: design brief for Claude Design

**Status:** product decisions final (owner, 2026-10-19). Copy below is final unless marked *(draft)*.
**Extends:** merchant-v2 (D-77), rider-v2 (D-54), empty-states-v2 (D-78), the admin console kit.
**Fidelity wanted:** high: final colours, type, spacing and copy, like shop-front-v1.

## 1. What this is
LyniaGo is a cash-only delivery app in Zimbabwe (motorbikes). Merchants (restaurants, shops, pharmacies) get orders
from customers in the app and can also "Book a biker" for orders that come in by phone or WhatsApp.

**Own bikers** is for merchants who employ their own bikers. The owner invites them into LyniaGo. An Own biker:
- only ever gets jobs from their own shop (all branches of the same owner). Never from other merchants or customers;
- earns no fare per job (the shop pays them a salary), pays no commission, needs no top-up, gets no strikes;
- still collects cash at the door and brings it back to the shop.

The shop pays LyniaGo a fee per ride, billed weekly. The old "Preferred riders" feature is removed for everyone.

**Words:** "Own bikers" (the feature), "My bikers" (the Book choice), "biker" (never "rider"), "<Shop>" = the name of
the branch the biker works from, e.g. "Chicken Inn Avondale". Money is USD with tabular numbers.

**Example data for the drawings:** owner's chain "Chicken Inn" with branches Avondale and Borrowdale; bikers Tendai M.
(Avondale, on a job, holding $14.00), Farai K. (Avondale, online), Blessing N. (Borrowdale, offline, 2 cancels this
week); invites: Kuda (Signing up, sent 2d ago), +263 77 123 4567 (SMS not sent). Fee $1.50 per ride.

## 2. People and roles
- **Owner**: the merchant account owner. Sees everything, invites and removes bikers, sees money.
- **Staff**: works at a branch. Can book "My bikers" for their branch and sees the roster read-only, with no money,
  no Invite and no Remove.
- **Own biker**: uses the biker app.
- **LyniaGo ops**: admin console, 1440 wide.

## 3. Screens to draw

Frame IDs use `OB-`. Each line says which existing frame it extends.

### 3a. Merchant app (extends merchant-v2; 360 × 720 + 320 × 640)

**OB-M1 · Account row** (extends T3 Account, "Orders & people" card)
- Fleet merchants: the "Preferred riders" row becomes **"Own bikers"**, right value **"4 bikers · 1 invite open"**,
  chevron. Paused: value **"Paused"** in the warning style. Staff: same row, read-only value.
- Non-fleet merchants: the row is removed; the card keeps Taking orders · Team.

**OB-M2 · Own bikers roster, owner** (new pushed screen; rows built from the merchant-mobile E2 Team list rows)
- Back header "Own bikers". Under it, owner only: **"This week: 23 rides · $34.50"**.
- Group "YOUR BIKERS", sorted on a job › online › offline. Row: name 15/600 + home branch; a **state chip with
  text** ("On a job", "Online", "Offline"); **"Cash with them $14.00"** on a Cash-due yellow chip (amount in ink text)
  when above 0; **"2 cancels this week"** muted when above 0. At 320 the cash line wraps to its own line; the name is
  never truncated.
- Group "INVITES" below: row = name or phone, state ("Signing up", "Waiting for ID check", "Sent"), "Sent 2d ago",
  pills **Resend** (once per 24 h) and **Revoke**. SMS failed: danger-wash row "SMS not sent · Resend". Expired:
  muted row "Invite again".
- Pinned bar: primary **"Invite a biker"**.
- Tap a biker: sheet with name, phone (Call), home branch, cash held, cancels this week, and owner-only ghost-danger
  **"Remove from my bikers"** → destructive confirm (merchant-v2 pattern).

**OB-M3 · Roster, staff**: same list, no "This week" line, no cash chips, no Invite bar, no Remove. A neutral strip
with `lock`: "Only the owner can invite or remove bikers." *(draft)*

**OB-M4 · Roster, first time**: EmptyState (D-78 pattern) "Invite your bikers" / "They'll get jobs from your shop
only." *(draft)* + one pill "Invite a biker".

**OB-M5 · Preferred suggestions** (once, owner only, top of the roster): group "FROM YOUR PREFERRED RIDERS" with ✕
(dismiss for good); rows with **Invite** pills. *(The header keeps the old feature's name on purpose; the owner knows
it by that name. Copy is "riders" here as the proper name of the retired feature.)*

**OB-M6 · Invite sheet** (from the Team invite sheet): fields Phone (with the +263 flag-and-code picker, D-116) and
Name; primary **"Send invite"**. After sending, the sheet stays open: the last result line ("Invite sent to Kuda" /
"Already invited · Resend") and **"Invite another"** clears the fields. States: sending (spinner on the button),
couldn't send (inline "Couldn't send · Try again"), no network ("Can't reach LyniaGo · Try again").

**OB-M7 · First biker joined**: roster banner (mint) **"Farai is ready · Book your first delivery"** → opens OB-M8 with
My bikers selected. Also a Notifications item "Farai joined your bikers".

**OB-M8 · Book a biker, My bikers** (extends S4 Book a rider)
- **Kitchens get this screen too when Own bikers is on**: add the "Book a biker" card under the Orders top card for
  fleet kitchens, as shops have it today.
- Top: segmented control **"My bikers · 4 online | Any biker"**. At 320: the toggle reads "My bikers | Any biker"
  on one line and **"4 of your bikers online"** sits under it.
- Default: My bikers when at least 1 Own biker is online; otherwise Any biker, with the hint **"0 of your bikers
  online"** under the toggle.
- My bikers: same body as S4 (destination, buyer's phone, item chips, "Biker collects $X" switch) but **no fare
  stepper**. Primary **"Ring my bikers"**.
- Any biker: exactly S4 today (fare stepper with hint, "Find a biker · $X").

**OB-M9 · Ringing my bikers**: card "3 of your bikers online · ringing…", a 2-minute countdown bar (**new part**)
with the time left also in text ("1:24 left"), Cancel.

**OB-M10 · None took it** (after 3 rounds, about 2 min): "None of your bikers took it" + primary **"Send to any
biker"** (opens Any biker with the stepper prefilled) + ghost "Try my bikers again".

**OB-M11 · Nobody online**: on "Ring my bikers" with 0 online, skip ringing: "None of your bikers are online" +
"Send to any biker".

**OB-M12 · Paused**: banner on Book "Own bikers paused" + body "Talk to LyniaGo to turn them back on." *(draft)* +
**"Contact LyniaGo"** (WhatsApp, like T3's Help row). My bikers is disabled; Any biker works.

**OB-M13 · Board and order card**: a fleet job on the K1 board uses the existing BOOKED tag (phone booking) or APP
tag, plus the biker's name. The cash card (K5) for an **app order delivered by an Own biker** reads **"Cash back from
Tendai: food $12.00 + delivery $2.00 = $14.00"** (the delivery fee comes back to the shop). For a phone booking:
"Cash back from Tendai: $12.00".

**OB-M14 · Money: fleet rides** (extends T2/T2b This week): a "FLEET RIDES" section per branch: "Avondale · 15 rides
· $22.50"; rows per ride "#B204 · Tendai · 12:40 · $1.50"; adjustment rows show the reason and the original ride
("Credit · #B190 · wrong fee · −$1.50"). Owner only: **"Fleet bill · 28 Sep–4 Oct · $34.50 · Due Fri"** card with
state Unpaid / Paid / Overdue (overdue: danger-wash). Zero rides: one line "No fleet rides this week".

### 3b. Biker app (extends rider-v2; 360 × 720 + 320 × 640)

**OB-R1 · Invite waiting for ID check**: a muted board banner **"Chicken Inn Avondale invited you · finish your ID
check to join"**. No Join button. Shown from sign-up until KYC passes.

**OB-R2 · Join card**: board banner card **"Chicken Inn Avondale wants you on their bikers"** / **"Jobs from Chicken
Inn only. No fare, no top-up."** Primary **"Join"**, ghost **"Not now"**. Push when it appears: **"Chicken Inn
Avondale is waiting for you"**.

**OB-R3 · Join refused** (sheet or inline on the card):
- shop staff: **"You work at Chicken Inn Avondale. Ask them to add you as a biker from a different account."**
- in another fleet: **"Leave Pizza Inn first."**
- invite ended: **"This invite has ended. Ask Chicken Inn Avondale for a new one."**
- network: toast "Couldn't join. Check your connection." *(draft)*; the card stays so the tap can be repeated.

**OB-R4 · Fleet board** (extends J1): count row **"Chicken Inn jobs"**. JobCards and pins carry a **"Chicken Inn job"**
tag, distance and drop-off, **no fare**. No demand line, no "Make an offer" (fleet jobs are offered, not bid).

**OB-R5 · Fleet board, empty**: EmptyState **"No Chicken Inn jobs right now"**. Loading, reconnecting and couldn't
load follow J6/J7 exactly (calm notice, auto-retry text, no Retry button).

**OB-R6 · Paused**: EmptyState **"Chicken Inn's deliveries are paused"** / **"Ask Chicken Inn for details."**

**OB-R7 · Fleet job offer** (extends F1–F4, food offer): same timed full screen, tag "Chicken Inn job", **no fare
and no "pay kitchen upfront"** tiles. Show what to collect at the door. Expired = F4.

**OB-R8 · Active job** (extends A1–A13 / B1–B6): unchanged stages. The cash lines read "Collect $14.00 cash at the
door" and "Bring $14.00 back to Chicken Inn Avondale".

**OB-R9 · Done** (extends A13/B6): leads with **"Return $14.00 to Chicken Inn Avondale"** (or **"Nothing to
return"**). No "You earned", no commission row.

**OB-R10 · Money, fleet biker** (extends M1): hero **"Cash with you · owed to Chicken Inn Avondale $14.00"**. No
Earnings card, no Commission balance card, no Top up. History rows: "Collected · #B204 · 12:40 +$14.00",
"Returned to Chicken Inn · 13:05 −$14.00".

**OB-R11 · Cancel sheet, fleet** (extends X6/X8): no strike line. Body **"This tells Chicken Inn Avondale."**
Primary "Keep the job", ghost-danger "Cancel job".

**OB-R12 · Leave** (Account › new row "Chicken Inn bikers", value "Avondale"): tapping opens a confirm "Leave
Chicken Inn's bikers?" / "You'll become a public biker and need a commission top-up to take jobs." *(draft)*;
ghost-danger "Leave". During a delivery: **"You can leave after this delivery."**

**OB-R13 · You're a public biker now** (one-time full sheet, first-run-v2 style): when LyniaGo turns off the shop's
Own bikers. Explains public jobs, fares and top-up *(draft copy)*; primary "See jobs near me".

### 3c. Admin console (extends ui_kits/admin; 1440 × 900)

**OB-A1 · Fleets table** (new page "Own bikers" in the sidebar): sorted unpaid > 7 days › unpaid › paid. Columns:
owner, branches, bikers, this week $, unpaid $, days overdue, status pill. Overdue rows: danger pill plus "9 days
overdue" in text.
**OB-A2 · Side panel**: fee per ride (editable), Pause / Unpause, Disable, weekly bills list with **Mark paid**,
**Adjust** (amount + required reason + which ride).
**OB-A3 · Confirm dialogs**: Pause and Disable name what stops ("Chicken Inn's 6 bikers stop getting jobs. Their
'Book a biker' falls back to Any biker."), with the kit's required reason code.
**OB-A4 · Overview tile**: "Own bikers live: 3 fleets · 14 bikers online · 2 overdue".
States: loading skeleton, empty "No fleets yet", inline error with Try again, offline banner (kit pattern).

## 4. States checklist (every surface)

| Surface | Loading | Empty | Error | Offline |
|---------|---------|-------|-------|---------|
| Roster | skeleton rows | OB-M4 | Couldn't load (shop-front T14b) + Try again | last list + offline toast |
| Invite sheet | button spinner | n/a | inline Try again; SMS failed row | "Can't reach LyniaGo · Try again" |
| Book · My bikers | count shimmer | OB-M11 | "Can't reach LyniaGo · Try again" | same |
| Money · Fleet rides | row shimmer | "No fleet rides this week" | Couldn't load + Try again | cached week |
| Biker fleet board | J7 skeleton | OB-R5 | J7 calm notice, auto-retry | J6 |
| Join / Leave | button spinner | n/a | toast; tap again | toast |
| Admin fleets | table skeleton | "No fleets yet" | inline + Try again | kit offline banner |

## 5. Accessibility and small screens
- State is never colour alone (chips have words; overdue also says "N days overdue").
- Countdown bar always has the time in text; the ringing count is announced (polite live region).
- Cash-due chips: ink text on yellow, not yellow text on white.
- Screen-reader order on a roster row: name, state, cash, cancels, actions.
- Every control at least `--target-min`; "Ring my bikers", "Join" and "Invite a biker" at `--target-primary`.

## 6. New parts (the only ones allowed)
1. Countdown bar for OB-M9 (track `--line`, fill `--accent`, time in text beside it).
2. State chip on roster rows, if the Team list has none (pill, 12/600, `--surface` / `--accent-wash` for "On a job").

## 7. Out of scope
The biker sign-up and ID check screens (first-run-v2 unchanged); the customer app (customers never see Own bikers);
multi-order trips (later).

## 8. Open items for Claude Design to settle in the export
- Final wording for strings marked *(draft)*.
- Where exactly the "Book a biker" card sits on the kitchen Orders tab (OB-M8 note).

## 9. DESIGN-DEVIATIONS entry the export should propose
"Own bikers v1 · merchant: Own bikers row replaces Preferred riders (T3); roster + invite sheet; Book gets My bikers |
Any biker with no fare stepper on My bikers (S4), also for kitchens; K5 cash card shows food + delivery for Own-biker
app orders. Biker: fleet variants of JobCard/pins, food offer, Done, Money hero and Cancel sheet with no fare,
commission, top-up or strike; invite/Join/paused banners; public-biker sheet. Admin: Own bikers page. New parts:
countdown bar, roster state chip. No new tokens."
