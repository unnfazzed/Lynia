# Biker sign-up (manual ID review): brief for Claude Design (2026-11-12)

> **How to use this:** start a new Claude Design project. Attach the files in **Part 3** in that order, then
> paste **Part 1** as your first message and **Part 2** right after it. Claude Design can't see the repo, so
> this file carries everything it needs.
>
> **Source:** the owner's field report of 2026-11-12 (photos of a new biker signing up), ledger D-122 (manual
> review since 1 Nov 2026) and D-134 (the interim fix shipped the same day). Bugs: KB-01, KB-02 in
> `docs/KNOWN_BUGS.md`.

---

## Part 1: The prompt (paste this first)

You are redesigning one short flow in **LyniaGo**, a delivery app in Zimbabwe (Harare first). One Android app
serves customers and bikers. Bikers deliver food and parcels on motorbikes. Most of them have **low-end Android
phones with weak cameras**, slow data, and little patience for forms.

**The flow:** a customer taps **"Earn with your bike"** and becomes a biker. Before they can go online, we must
check who they are. Until 1 Nov 2026 an automated ID-check vendor did this in about two minutes. That vendor is
now switched off for cost, so **our own team reviews every biker by hand**. The biker sends:

1. their **national ID number** (typed, format `63-123456A78`),
2. a photo of their **ID card (front)**,
3. a photo of their **driver's licence**,
4. a **selfie holding their ID**.

Then they wait (usually a few hours). We approve or decline with a reason, and they get a notification.
Optional extras, **not** needed for approval: a **biker photo** customers see, and the **bike plate**
(`ABC 1234`).

**What went wrong (owner's words, from a real sign-up):**

> "Driver clicks earn as a biker, gets shown a screen already saying ID in review, no clear call to action. Have
> to click upload documents and the process is confusing. The keyboard covers the screen and the field you are
> entering, so you can't see. You can't see the ID you typed. Licence expiry not necessary. The steps are not
> moving. There is no exit when done, and when you come back it still says ID in review."

What the biker actually saw (the attached photos):

- **After "Start ID check"**: a full screen titled "Our team is taking a look", "Usually a few hours. We'll notify
  you.", a 3-step checklist (Your account · Done / **ID check · In review** / Go online), and a small soft pill
  "Add your documents". Nothing had been sent yet, so "In review" was false and the real next step looked
  optional.
- **Bike & documents**: a settings-style list of eight rows (National ID, ID card (front), Driver's licence, Selfie
  holding your ID, Licence details (number + expiry), Biker photo, Bike plate) with "+ Add" pills, and bars
  reading **"0 of 6"**. Three of the six counted things were optional or out of the biker's hands, so the bars
  never finished. The national ID sheet opened behind the keyboard.
- **Selfie guide**: a dark camera guide "Face the camera" with a dashed oval and tips. (This was the optional
  biker photo, and it looked like a required step.)
- After sending everything there was **no Done**, only Back, and the board again said "In review".

We have shipped a stop-gap (see Part 2, "Today"). **Your job is the real design:** one calm, linear sign-up that
a first-time biker on a cheap phone finishes in about two minutes without help, knows exactly what's next at
every moment, and knows when they're done.

**The feeling we want:** "this is quick, and I know where I am." Like a good bank or mobile-money sign-up in
Zimbabwe: one thing per screen, big obvious buttons, honest status. No legal tone, no "KYC", no "verification
vendor", no gamification, no emoji.

**Hard rules from the system (attached `00-BRAND.md` and `tokens/`):**

- Light theme, Inter 400/600/700, tabular figures for numbers.
- Brand green `#00B14F` is never text. Green text is `--accent-text`.
- Every control is at least 44 tall (`--target-min`), and the one primary CTA is 52. **Never draw a target under
  44**, including ✕ and Back on a camera screen.
- Draw at 360×720. Every frame must survive **320×640** and **font scale 1.3**: text wraps, actions stack, nothing
  hides under the CTA.
- **Draw the keyboard.** Every frame with a text field also gets a keyboard-up frame showing the field and its
  Save above the keyboard (Android keyboard ~ 300 high at 360×720).
- Copy is second person, sentence case, one short sentence (two at most).
- **Use the First Run v2 components only** (the hero panel + disc, split title, list card rows, step markers,
  pinned footer, sheet, the dark capture guide). Don't add tokens. If you need a value no token covers, say so in
  the README.
- Write "rider" in copy as the other handoffs do. The app shows it as "biker" automatically.
- Never name the review vendor. Never ask for the licence expiry date or licence number by hand: we read them
  off the photo.

**What to send back** (the same shape as the other handoffs):

- `README.md`: one row per frame (id, state, what changed), the flow diagram, specs for anything new.
- An HTML canvas with every frame at 360×720, plus 320×640, font scale 1.3 and keyboard-up wherever they differ.
  Support `?screen=<ID>` like First Run v2.
- `copy.ts`: every string verbatim and keyed. Mark changed strings with `// was: …`.
- Screenshots `<ID>.png` if you can.

---

## Part 2: The screens to draw

### Today (the stop-gap shipped 2026-11-12, ledger D-134), for reference only

- "Start ID check" opens **Bike & documents** straight away.
- If they leave before finishing, the board shows F3's shell: "Almost there, {name}", step 2 "Next · ~2 min", one
  primary "Add your documents" →.
- Bike & documents while unverified shows only **National ID number + 3 photos**, bars "N of 4". The typed number
  stays visible with Edit. The licence number/expiry row is gone. The biker photo and plate come back after
  approval.
- With all four in: "Sent for review. Usually a few hours. We'll notify you." and a **Done** back to the board,
  which then shows F1 "Our team is taking a look".

It works, but it's still a settings list wearing a sign-up's job. Redesign it as a sign-up.

### The flow to draw (your call on how many screens; this is the shape we expect)

```
R1 "Earn with your bike" ──Start──▶ K0 What you'll need (optional if K1 makes it obvious)
   ▶ K1 Your ID number (one field, keyboard-up)
   ▶ K2 ID card (front) ── guide → camera/gallery → preview "Use photo / Retake" → uploading
   ▶ K3 Driver's licence ── same pattern
   ▶ K4 Selfie holding your ID ── same pattern, front camera
   ▶ K5 Check & send (all four, thumbnails, Edit on each) ──Send──▶ K6 Sent ("We'll notify you") ──Done──▶ board (F1)
```

**Must**

- **One clear next step at every moment.** A step indicator that actually moves (1 of 4 … 4 of 4) and reaches the
  end. Only required steps count.
- **Resume.** A biker who leaves mid-way (app killed, no data) comes back to the step they were on, with what they
  already sent kept. Draw the **resume entry** on the board: replaces today's F1 to-do page.
- **Honest status.** "In review" appears only after Send. Before that the board says what to do.
- **The ID number stays visible** after typing, on K1 and on K5, formatted `63-123456A78`, with a format error
  ("Use the format 63-123456A78") and the one-ID-one-account refusal ("This ID is on another account. One ID, one
  account. Message us and we'll sort it." with WhatsApp).
- **Photo steps for weak cameras.** A guide before the camera (what to frame, "Lay it flat, all four corners in
  view, no glare." / "Hold your ID next to your face."), gallery always allowed, a preview the biker confirms,
  per-photo upload progress, and an **upload failed / try again** state that keeps the photo on the phone.
- **Camera blocked** state (permission refused for good): how to fix it in phone settings.
- **An explicit end.** K6 Sent, with a Done, and the board's **F1 waiting** state afterwards (keep F1's look: "Our
  team is taking a look", step 2 "In review").
- **Declined → fix only what's wrong.** Today's decline reasons: "Photos unreadable", "Licence expired", "Selfie
  doesn't show your face". Draw the board's decline page and the flow re-entering at **just the step(s) to redo**,
  not all four.
- **Approved** → today's R3 "You're verified" stays; then the optional extras (biker photo, plate) are offered
  once, skippable, never blocking going online.
- **An exit everywhere.** ✕ / Back on every frame; leaving keeps progress.

**Your call:** whether K0 exists, whether K2–K4 share one screen with a capture sheet or are separate pages,
whether K5 is a page or the last step's footer, how the step indicator looks (bars, dots, "Step 2 of 4"), and the
exact words.

**Draw**

| Suggested id | State |
|---|---|
| K0 | What you'll need (if kept) |
| K1 / K1-kb / K1-err / K1-dup | ID number: empty, keyboard up, format error, on another account |
| K2-guide / K2-prev / K2-up / K2-fail | ID front: guide, preview, uploading, failed |
| K3-* | Licence: same four |
| K4-* | Selfie with ID: same four (front camera) |
| K-blocked | Camera blocked, open phone settings |
| K5 | Check & send (+ one row being replaced) |
| K6 | Sent |
| B-todo | Board: not started / half done (resume) |
| B-wait | Board: sent, waiting (F1, keep its look) |
| B-decl-photo / B-decl-licence / B-decl-selfie | Board: declined, one reason each, CTA re-enters at that step |
| X1 / X2 | After approval: optional biker photo, optional plate (skippable) |

Every frame also at 320×640 and font scale 1.3 where text wraps; every field frame also keyboard-up.

---

## Part 3: Files to attach (in this order)

1. `packages/design/handoff/first-run-v2/README.md` (the shell, components, F pages, E1–E6 rows)
2. `packages/design/handoff/first-run-v2/copy.ts` (current strings; `BD`, `KY`, `PD`)
3. `packages/design/handoff/first-run-v2/BRIEF.md`
4. `packages/design/handoff/calm-mint-v2-2026-10/README.md` (R1 "Earn with your bike", R2, R3)
5. `apps/mobile/src/ui/rider/manual-kyc-copy.ts` (the manual-review strings, D-122 + D-134)
6. `docs/design-briefs-2026-10-12/00-BRAND.md` and `packages/design/tokens/*.css`
7. The owner's photos from 2026-11-12 (kept out of the repo: they show a real biker's details). Ask the owner
   for them, or describe from Part 1.
