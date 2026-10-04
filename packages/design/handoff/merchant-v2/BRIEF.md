# Merchant v2: product decisions (final)

These rules apply to restaurants (kitchen), shops and pharmacies. If the design or the code disagrees with this file, this file wins.

## 1. One shell
- **Tabs (4):**
  - Kitchen: Orders · Menu · Money · Account
  - Shop and pharmacy: Orders · Inventory · Money · Account
- **Mint top card** on every tab root. On Orders it holds:
  - the business name;
  - the open state, e.g. "Open · until 22:00";
  - an open/closed pill switch, 44 px tall, always labelled;
  - one KPI strip: Orders, Sales, and **Cash due** (shown in yellow when it isn't zero).
- **Closed state:** the top card turns grey. The body offers **Open now** and **Open, but busy (+10 min)**.
- **Live bar:** a dark bar shown on every non-Orders tab while any order needs the merchant or is live, for example "Blessing is at your counter · 2 cooking · 1 on the way". Tapping it opens that order.
- **Pushed screens:** a back header (44 px back target) and a pinned bottom bar for the main button.

## 2. One order lifecycle
Every order goes through the same 5 steps:

**Accept → Cook / Pack → Hand over → On the way → Cash back**

- A 5-segment progress bar appears on every ticket and on every card on the board.
- The **Orders board** replaces the New / Cooking / Ready tabs. It is one list sorted by urgency:
  1. NEEDS YOU: ringing orders, a rider at the counter, rider offers about to expire, Rx checks;
  2. COOKING / PACKING;
  3. ON THE WAY;
  4. cash still to come back.
- **Shops** show customer orders (`APP` tag) and riders they booked themselves (`BOOKED` tag) in the same list.

## 3. Ringing (K2, S2)
- **One full-screen ringing screen** covers manual, auto-accepted and scheduled orders. Only the banner line changes.
- **Countdown:** 60 s for kitchens, 90 s for shops.
- **Kitchen ready-in:** 10 / 15 / 20 / 30 / 45 min; 15 is selected by default. The main button shows the clock time: "Accept · ready 07:36". The rider is booked to arrive when the food is ready.
- **Shop item changes:**
  - The merchant taps an item to swap or remove it, inline.
  - A removed item shows "Removed · Undo".
  - The total is recomputed and the old total shown struck through.
  - The button reads "Accept with N changes": accepting and sending the changes are one action.
  - The customer has 3 minutes to approve; the merchant starts packing meanwhile.
- **Can't take it** opens the existing reasons sheet.

## 4. Cooking ticket (K3)
- A big countdown, the ready time, and when the rider arrives.
- **+5 min** pushes the ready time back. It is new and needs backend support.
- **Change items** reuses the swap flow from S2.
- **Problem with this order?** is the same danger pill as in Rider v2. It replaces "Can't finish".
- The main button reads **Food is ready**. Shops see **Packed** instead.

## 5. Hand over (K4, S3)
- A rider card with a call button.
- The **6-digit code**, shown as `720 518`: the merchant reads it aloud and the rider types it on their phone.
- **There is no hand-over button for the merchant.** When the rider enters the code on their phone, the merchant's screen moves on by itself.
- **Shops and pharmacies** use a 3-step checklist: Seal the bag → Rider photographed it (with a thumbnail) → Say the code.

## 6. On the way + cash back (K5)
- **One screen** that changes as the order moves: live map, then delivered (with the door photo), then cash back.
- **Cash card:**
  - the amount owed to the merchant (food only);
  - delivery fee shown as "rider's";
  - the time the cash is due back.
- **I got $X** stays disabled until the order is delivered.

## 7. Book a rider (S4, shops)
- **One screen:**
  - destination, from the pin the buyer sent or typed in;
  - the buyer's phone number;
  - what's going, as item chips;
  - "Rider collects $X" switch;
  - fare stepper with a hint like "Riders usually get $6–7";
  - main button: **Find a rider · $X**.
- Riders' offers use the existing **Send v2** offer list, unchanged.

## 8. Rx check (P1, pharmacy)
- **Prescription photo** with Zoom; paging if there is more than one.
- **Checklist:**
  - Name matches the patient
  - Signed and stamped
  - Dated in the last 6 months
- **Approve stays disabled until every box is ticked.**
- **Decline** opens the reasons sheet, already filled in from the unticked box.

## 9. Money (T2)
- Today / This week toggle and a big sales number.
- **Late cash** is a yellow card with a **Call** button for the rider.
- **Ledger rows:**
  - cash back in: green "+$X";
  - cash late: yellow subtext;
  - order the merchant couldn't take: "—" (never "$0.00").

## 10. Account (T3)
- **Two grouped cards:**
  - Your shop front: Profile & photos · Opening hours · Branches
  - Orders & people: Taking orders · Preferred riders · Team
- **Each row shows its current value** (for example "08:00–22:00", "Auto-accept off").
- **Badges use words**, e.g. "1 invite open", not a bare count.
- **Sign out** is a danger pill.

## Out of scope (keep the current flow, restyle only)
Sign-in, onboarding, and the settings sub-screens (hours editor, branches, team invite, payout details). They take on the new back header, inputs and buttons only.

## Open questions (answer before shipping)
1. **Offline rider:** should there be a manual hand-over fallback when the rider's phone is offline? Proposal: after 2 minutes waiting, the merchant can tap "Rider can't enter code" and the rider gets an SMS link.
2. **+5 min:** does it notify the customer? Proposal: yes, a silent push with the new time.
