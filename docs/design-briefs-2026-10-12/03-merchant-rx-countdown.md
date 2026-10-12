# 03 · Countdown on the prescription check (MJ-M13)

**App:** Merchant, pharmacies only. **Extends:** merchant-v2 **P1** "Check the prescription". **Route:** `/queue/rx`.

## The problem

An order that needs a prescription rings. The pharmacist taps "Check the prescription" (P1) instead of Accept. P1 has **no clock**, so the pharmacist can't tell how long the customer has been waiting while they read the photo. The ringing screen shows "0:48 to answer", but that clock disappears the moment they open P1.

## The real clock (this decides the design)

- There is **one** clock: the order's answer window, **3 minutes** from the ring.
- **At 0:00 nothing is lost.** The countdown **holds at 0:00** and the order keeps ringing until someone answers. It is a nudge, not a deadline.
- A check done later, during **packing**, has **no clock at all**. Don't show one there.

## Must

- P1 shows the time left to answer while the order is still ringing. Use the same digits and wording the ring uses ("0:48 to answer"), so it reads as the same clock.
- A "past time" look at 0:00 that is calm but noticeably more urgent. It never reads as "expired" or "missed".
- The clock must not crowd the photo. The photo is the work.
- Everything P1 has today stays: photo with page switch and Zoom, Patient / Medicine rows, the 3 ticks, the shield note, Decline / Approve.
- A clock time next to the countdown is the house rule ("Clock times sit next to countdowns"). Only add one if it means something here.

## Your call

- Where the clock lives: header right (it currently holds the order label "#F7C1"), a slim strip under the header, or inside the pinned CTA bar.
- How it changes under 1:00 and at 0:00 (gold wash? the K2 ring banner's green?).
- Whether the shell's alarm needs a visible "ringing" hint on P1.

## Copy to start from

- "Check the prescription" · "#F7C1" · "Patient" · "Needs a prescription"
- "Approve prescription" · "Decline" · "The customer shows the original to the rider"
- Ring: "0:48 to answer" · "This order needs a prescription. Check it first, then accept."

Suggested 0:00 line: "Customer waiting · answer when ready".

## Draw

1. P1 with 1:42 left.
2. P1 at 0:00 (holding).
3. P1 during packing (no clock). This may just be today's P1; confirm it.
4. 320×640 of frame 1.

Suggested ids: `P1b`, `P1c`.
