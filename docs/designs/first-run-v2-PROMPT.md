# LyniaGo: first-run and account gaps, design brief for Claude Design (v2, 2026-10-06)

> **How to use this:** paste **Part 1** into Claude Design as your first message, then **Part 2**, then
> attach the files in **Part 3** in that order. Claude Design can't see the repo, so this file carries
> everything it needs.
>
> **Why this round exists (owner, 2026-10-06):** "I also need to redesign the screens for location and
> notification activation … and the force update", then "all these screens in one brief". This one
> round covers every screen on the start-up → registration path that has no current design (sections
> A–I below). Today these are the last first-run screens still
> in the oldest design generation (`LJ perm_loc`, `LJ perm_notif`, `LJ force_update`: a centred icon,
> a title, one paragraph and two buttons). The customer side has no explainer at all, only the bare
> Android dialog.
>
> **This supersedes `docs/designs/rider-permissions-v1-PROMPT.md`** (rider only, never sent). Its rider
> content is folded in as Part 1 §B; attach v1 as well if you want its full rider reference tables.

---

## Part 1: The prompt (paste this first)

You are designing nine things for **LyniaGo**, a delivery app in Zimbabwe (Harare first). One Android
app (Expo / React Native) serves **customers** (they send parcels and order food, shops and pharmacy)
and **riders** (motorbike couriers who take those jobs):

- **A.** How a **customer** is asked for **location** and **notifications**, in context.
- **B.** The **rider's** permission flow (location, location during a job, notifications) after
  sign-in.
- **C.** The **app update** screens: the hard "you must update" gate, plus an optional soft nudge.
- **D.** **Personal details** for customers (and riders): edit name, see the verified phone, and add an
  optional national ID.
- **E.** **Bike & documents** for riders: add or change the rider photo, and add or edit the bike plate.
- **F.** The **ID-check outcome screens** (in review, held for review, unfinished, declined, locked,
  expired, can't open) in the onboarding look.
- **G.** The **rider entry**: what someone sees between "Ride with LyniaGo" / "Become a rider" and R1.
- **H.** The **splash** for riders, and the splash at 320×640 with a navigation bar.
- **I.** A **copy pass** across the whole rider journey: one set of times and promises.

It must look like the two current design systems:

- **Calm Mint v2** for customer screens and first-run screens (attached; C1–C5, R1–R3, Home H1–H6);
- **Rider v2** for rider screens (attached).

Where they overlap, Calm Mint v2's tokens win (it is newer: highlight is `#FFD23F`, not the old gold).

### Decided. Treat these as final.

1. **Explain before the Android dialog, never after.** The OS dialog opens only when the person taps
   the primary button on our explainer.
2. **Customers are asked in context. There is no first-run priming for customers** (Calm Mint v2
   README §3):
   - **location** when Home first needs an address;
   - **notifications** right after their first order is placed (the moment "we'll tell you when it's
     picked up" is worth something).
3. **Riders get a short flow once per install**, right after sign-in and before their first job board.
   A rider without location can't receive jobs, and one without notifications misses them.
4. **Never a dead end.** Every screen has a way forward. "Not now" always continues, and the app asks
   again in context later.
5. **Honest copy.** Say exactly when location is used, who sees it (riders: the customer, only during
   their job), and when it stops. No "to improve your experience".
6. **The hard update gate has no way past it**, by design. It only appears when the server says this
   version is no longer supported.

### Hard constraints

- **Frames:** Android phone, designed at **360×720**. Every state must also work at **320×640** and,
  for key states, at **font scale 1.3**. Content scrolls; nothing hides under a pinned CTA.
- **Targets:**
  - everything ≥ **44dp** (`--target-min`);
  - the one primary CTA per screen at **52dp** (`--target-primary`);
  - draw them at that size. **Text links must be drawn ≥ 44dp tall too**: the last round drew 24px
    links, and the app isn't allowed to enlarge a drawn target.
- **Tokens:** only the table in Part 2 §4. No new ones without naming the value and the reason.
  `--brand #00B14F` is a fill, never text. Never red text on white.
- **Copy:** every user-facing string goes into one object per area (`PC` customer, `RP` rider, `UP`
  update): flat keys, final copy. The app ships it verbatim. Vocabulary: **LyniaGo** (never "Lynia"),
  Job, Order, Delivery code, SMS, WhatsApp.
- **No "Retry" buttons for permissions.** The app re-reads the permission when it comes back from
  Android Settings and moves on by itself. "I've turned it on" is allowed.
- **Android realities.** Draw each of these as its own state where it applies:
  - **Precise / Approximate** in the location dialog: approximate isn't enough for a pickup pin or
    navigation;
  - **"Don't allow" twice = denied for good.** Android stops showing the dialog, and the only path is
    **Open phone settings**, with the steps written out;
  - **phone location (GPS) switched off**, which is different from LyniaGo's permission;
  - **notifications blocked** at the OS level, and the job-alert channel muted (riders);
  - the **Android 14 system dialogs** themselves, drawn so each sequence reads end to end.

---

### A · Customer (Calm Mint v2 look)

**Location.** Home needs an address before it can show what delivers nearby. Today:
- Home's H6 card ("Where should we deliver?" · "Use my location" · "Type an address") and the H5
  location sheet's "Use my current location" both fire the bare Android dialog.
- A refusal just leaves "Set your location".

Design:
- **PC1 · Location explainer:** the moment between tapping "Use my location" and the Android dialog.
  Decide whether it's a sheet over Home (H5's sheet language) or the H6 card's own expanded state. Say
  why.
- **PC2 · The Android dialog** over PC1.
- **PC3 · Approximate chosen:** ask for precise, or carry on and type the address.
- **PC4 · Denied once:** type the address instead (H5's search), with the cost in one line.
- **PC5 · Denied for good:** "Open phone settings" with the steps, plus "Type an address".
- **PC6 · GPS off.**
- **PC7 · Granted:** Home fills in. Show the H1 state that follows.

**Notifications.** Asked right after the first order is placed (a parcel from Send, or a restaurant /
shop / pharmacy order). Today it is the bare Android 13+ dialog over the order screen.

Design:
- **PC8 · Notifications explainer** on the order screen, right after "order placed": what they'll get
  (rider offers / rider assigned, "arriving", the delivery code moment, delivered). Use real examples.
- **PC9 · The Android dialog** over PC8.
- **PC10 · Declined:** what they'll miss, and where to turn it on later.
- **PC11 · Settings → Notifications off:** the row and its warn box, re-opening PC8.

### B · Rider (Rider v2 look)

A rider needs:
- **foreground location**: the job board, the map, the service-area check;
- **location during a job, in the background**: while they navigate in Google Maps or Waze, LyniaGo
  keeps sharing their position with *that job's customer*. Android shows a persistent notification the
  whole trip ("LyniaGo — delivery in progress · Sharing your location with the customer for this
  delivery.") and it stops when the job ends. We do **not** request "Allow all the time";
- **notifications**: the new-job ping, the 60-second food-offer alarm (needs sound), "the customer
  picked you", and delivery updates.

The flow runs after sign-in and before the first board. It is also re-entered from the board's
"No GPS" gate (G8), the "Notifications are off" warn row (J8) and Settings.

Design:
- **P1 · Location explainer:** why, when it's used, who sees it.
- **P2 · The Android dialog** over P1.
- **P3 · "While on a job" explainer:** includes the persistent notification, drawn.
- **P4 · Approximate chosen.**
- **P5 · Denied once:** "You can't receive jobs without location", with ask-again / continue.
- **P6 · Denied for good:** Open phone settings with the steps, plus "I've turned it on".
- **P7 · GPS off.**
- **P8 · Granted:** brief confirmation. Skip this frame if you think it slows the rider, and say why.
- **P9 · Notifications explainer:** offers a **Test ping**, which Settings already has.
- **P10 · The Android 13+ dialog.**
- **P11 · Denied / blocked:** the cost, plus Open phone settings with the steps.
- **P12 · Job-alert channel muted:** notifications allowed, but the alarm is silent.
- **P13 · All set → the first board.**
- **P14 · Skipped something → the board** with J8 / G8, showing how the flow and the in-context asks
  connect.
- **P15 · Settings → Location / Job alerts off** re-opening the matching explainer.
- **P16 · OPTIONAL · Battery optimisation explainer** (Tecno, Infinix, Xiaomi kill background apps),
  reached from Settings only.

The rider has just come from R1–R3 (Calm Mint v2) or from sign-in. Make the hand-off between those
and this flow feel like one journey.

### C · App update (both sides, Calm Mint v2 look)

Today (`LJ force_update`):
- a full green screen with the dove mark, "Time to update", "A new version of LyniaGo is ready with
  the latest fixes. Update to keep using LyniaGo.", and "Update now", which opens Google Play;
- the app draws it in `#00812F`, where the old mock drew it in `#00B14F`;
- it shows before the app knows whether the person is a customer or a rider, so its copy must be
  **role-neutral**;
- with no store link configured, there is no button at all.

Design:
- **U1 · Update required:** the hard gate. Role-neutral copy. Primary "Update now" (opens Google Play).
  - Decide whether it says what's new: a one-line "what's new" can come from the server, so draw it
    as optional.
  - Help & support (WhatsApp) as a secondary action, so a person who can't update isn't stuck.
- **U2 · Update required, no store link:** what to show when the button can't work.
- **U3 · Update required, offline:** Google Play can't open.
- **U4 · OPTIONAL · Update available (soft):**
  - a dismissible nudge on Home and on the rider board ("A new version is ready"), shown once per
    version;
  - draw it as a banner or sheet in each side's language;
  - mark it NEEDS BACKEND (a "recommended version" field).
- **U5 · Returning from Google Play** without updating: back on U1.

Also say how U1 looks when it appears **straight after the splash** (the splash is brand green
`#00B14F` with a yellow sun, handoff `splash-v1`). Should U1 stay green, or move to white with a green
mark? Decide, and justify contrast: white 16px text on `#00B14F` is ~2.9:1, which fails AA.

### D · Personal details (Calm Mint v2 look; customer and rider)

Why: C5 (the customer name screen) promises "No ID needed. If an order ever needs one, we'll ask then.
You can add it in Account." There is nowhere to do that, and nobody can change their name after C5.
The owner has decided to build it. Calm Mint v2's own `mint2.js` already lists a Settings row
"Personal details · Name, phone, optional ID", but never drew the screen.

Today, Settings (Rider v2 S1, shared by both sides) is a card of rows: Language, Privacy, Terms,
Payments, Notifications, Location, (rider) Top-up number and Bike & documents, Sign out, Delete account.
The identity card on Account is not tappable (an owner decision); don't make it tappable.

Design:
- **D1 · Settings row** "Personal details" in context: where it sits in the card.
- **D2 · Personal details screen:**
  - First name and Surname (C5's two side-by-side 52dp fields);
  - the phone as C5's verified row, read-only (a new number means a new account);
  - **National ID (optional)** with a one-line why ("Some orders, like pharmacy or high-value parcels,
    may need it") and the format `63-123456A78`;
  - Save.
- **D3 · Saving / saved** (a toast or an inline confirmation; pick one and say why).
- **D4 · ID already on another account:** the server refuses it (one ID, one account). Say what to do,
  and offer WhatsApp support.
- **D5 · Invalid ID format.**
- **D6 · A verified rider:** the ID came from their ID check. It shows read-only, masked except the
  last 3 characters, marked "Verified", with no edit.
- **D7 · 320×640 with the keyboard up:** Save must stay reachable.

### E · Bike & documents (Rider v2 look)

Why: R1 says "Your photo, licence and bike papers can wait", and R3 says "Add your photo, licence and
bike papers later in Account". Bike & documents (Rider v2 S5) is read-only today:
- rows for National ID, Rider photo ("Not added yet") and Bike, each "Verified" while the ID check
  holds;
- the line "Changed bikes? Re-verify with the new plate.";
- a ghost "Re-verify my bike" button that opens WhatsApp.

The owner decided to let riders add the **photo** and the **bike plate** themselves. **The licence is
not being built.** Propose how R1/R3 should word "can wait" now (section I).

Design:
- **E1 · Bike & documents** with no photo and no plate (a new rider since the ID-check-only sign-up).
- **E2 · Add photo:** camera or gallery choice, a capture guide (face, plain background, no helmet), the
  preview with Retake / Use photo, then uploading and done. It is optional, so no nagging elsewhere.
- **E3 · Change photo.**
- **E4 · Add / edit bike plate:** a sheet with one field (Zimbabwe plates, e.g. `ABC 1234`), a format
  error, and saved. Decide whether a plate change needs ops review (and say what the rider sees
  meanwhile) or is instant.
- **E5 · All set:** photo, plate and ID check. "Verified" shows only for what was actually checked.
- **E6 · Upload failed / offline.**

### F · ID-check outcomes (Calm Mint v2 onboarding look)

Why: Calm Mint v2 §4 redrew R1 (why ride), R2 (checking) and R3 (verified), and said "failed, expired,
locked and can't-start keep the existing KYC copy inside this new shell (C-style title plus a mint
illustration card). They're not redrawn here." They never were. Today they are Rider v2 gate cards
with a mint top card and the tab bar, so the journey changes look halfway through.

Today's copy:
- In review (ops): "Your ID is under review" · "We're checking your ID and bike photo. Most checks
  finish within a few hours."
- Unfinished: "Finish verifying your ID" · "You started the ID check but didn't finish. It takes about
  3 minutes." · "Finish verifying"
- Declined (1 try left): "We couldn't verify your ID" · "The photo of your ID was blurry. Try again in
  good light, with all four corners showing." · "Tries left 1 of 2" · Try again · WhatsApp
- Locked (2 tries used): "We still couldn't verify your ID" · "You've used both tries. Our team will
  check your documents with you on WhatsApp."
- Expired: "Your ID has expired" · "Your national ID expired on {date}. Re-verify to keep taking jobs."
  · Re-verify
- Can't open: "We couldn't open the ID check" · "The ID check needs a data connection and your camera.
  Check both, then try again."

The app never names the verification vendor (owner rule).

Design, each in the R2 shell (title, mint illustration card, checklist where it helps, a primary
action, and Send a parcel / Help as secondary):
- **F1 · In review by our team (hours):** distinct from R2's automated "usually under a minute".
- **F2 · Held for review:** the check passed but needs a person (for example, the ID is on another
  account, or a borderline face match). Don't reveal fraud signals; give WhatsApp support.
- **F3 · Unfinished:** resume, with a WhatsApp exit.
- **F4 · Declined, with the reason:** one variant per reason. The server knows the reason: blurry
  photo, face didn't match, document not accepted or expired document, other. Each gets its own
  advice; "blurry" must not be the advice for a face mismatch. Show tries left.
- **F5 · Locked** (both tries used): WhatsApp only.
- **F6 · ID expired:** re-verify.
- **F7 · Can't open the check:** camera or connection, try again, WhatsApp.
- **F8 · Just finished, waiting for the result:** the first ~30 seconds after the check, before R2.
  This avoids today's flash of "you didn't finish".

### G · Rider entry (Calm Mint v2 look)

Why: README §3 says C1's "Ride with LyniaGo" "starts the rider flow after OTP". Today, after sign-in
(and the rider permission flow, B), a new rider first lands on the Rider v2 "Earn with your bike" card,
with the tab bar: "Verify your ID and bike once, then take parcel and food jobs near you." Then they
tap through to R1. Customer Account's "Become a rider" card says "You'll need your national ID, your
bike and 5 minutes."

Design:
- **G1 · From C1 "Ride with LyniaGo"**: decide whether R1 is the first rider screen (the
  recommendation: drop the extra card) and where the permission flow (B) sits relative to R1. Before
  R1, or after R3's "Go online"? Recommend one.
- **G2 · From Customer Account → "Become a rider":** the card, then R1. Rewrite the card copy to match
  R1 (ID check only; papers can wait).
- **G3 · A rider who switches to Customer and back** (the Account Customer | Rider toggle) mid-check:
  where they land.

### H · Splash, rider variant and small screens (splash-v1 look)

Why: the splash (handoff `splash-v1`, "1a Sun & orbit") was designed for customers. Its steps read
"Checking it's you", "Loading your saved places", "Finding riders near you". A rider's boot ends after
step 1, so they glimpse "Finding riders near you" as a pending row.

Separately, at **320×640 with a 48dp 3-button navigation bar** the steps card (16dp above the bar)
covers about 20dp of the wordmark, and the offline panel overlaps it too.

Design:
- **H1 · Rider splash:** step labels (or a two-step card) that fit a rider.
- **H2 · 320×640** with 3-button and with gesture navigation, normal and offline, without overlap.
  Show what moves up or shrinks.

### I · One copy pass for the rider journey

Make these consistent across R1, R2, F1–F8, G, E and the free-jobs notifications:

- **How long the ID check takes:** today "~2 min" (R1), "about 3 minutes" (unfinished), "5 minutes"
  (Become card), "Usually under a minute" (R2) and "within a few hours" (in review). Pick one honest
  set: automated check vs a person.
- **How we tell them:** R2 says "We'll notify you", but the Account card says "We'll SMS you" and no SMS
  is sent. Use the in-app notification.
- **What "can wait":** the photo and the bike plate (E). The licence isn't collected anywhere. Either
  drop "licence" or say what happens with it.
- **Free jobs:** R3's "We'll remind you before you need to top up" is now real. The server sends a
  notification at 1 free job left and at 0. Write those two notifications (title and body) as keys.

### Deliverables (same package shape as Calm Mint v2 / Rider v2)

1. **`BRIEF.md`:** decisions as short final statements, plus open questions.
2. **`README.md`:**
   - screen and state list with ids (PC1…, P1…, U1…);
   - what each tap does, including which Android dialog opens and what Allow / Don't allow /
     Approximate lead to;
   - a component spec with exact sizes at 360 and 320;
   - a token table;
   - **NEEDS BACKEND / NEEDS NATIVE**;
   - **Retires**: name which of your screens replaces `LJ perm_loc`, `LJ perm_notif`, `RJ perm_loc`,
     `RJ perm_notif`, `LJ force_update`, `RJ force_update`, the Rider v2 KYC gates G1–G7 (as used
     during onboarding), Rider v2 S5 Bike & documents, and the `kyc-2026-08` outcome screens.
3. **One standalone HTML prototype** with every state at 360×720, key states at 320×640 and at font
   scale 1.3, and `?screen=<id>` single-screen views.
4. **A kit file** with the shared parts and the `PC` (customer permissions), `RP` (rider
   permissions), `UP` (update), `PD` (personal details), `BD` (bike & documents), `KY` (ID-check
   outcomes and rider entry) and `SP` (splash additions) copy objects. Include the Android
   foreground-service notification title and body as `RP` keys, and the Android manifest location
   rationale as a key (today's says "to set the pickup point", which is wrong for riders).
5. **2× PNG renders** of every state.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Where each ask happens today

| Who | When | What they see today | Code |
|---|---|---|---|
| Customer | Taps "Use my location" (H6 card / H5 sheet) or Home first needs an address | Bare Android location dialog; a refusal leaves "Set your location" | `src/logic/home-location.ts` |
| Customer | Right after placing a first order (Send, food/shop/pharmacy checkout) | Bare Android 13+ notifications dialog | `src/push/ask-in-context.ts` |
| Rider | After sign-in, before the first board (once per install) | Two old centred screens: "Turn on location" → "Stay in the loop" | `app/permissions.tsx` |
| Rider | Board with location off / notifications off | G8 "No GPS" gate · J8 warn row | `app/rider/(tabs)/index.tsx` |
| Both | Settings | Location / Notifications rows with an "off" warn box and "Open settings" | `app/settings/index.tsx` |
| Both | Installed version below the server minimum | Full-screen green "Time to update" gate | `app/force-update.tsx` |

### 2. Today's rider copy (replace it)

| Step | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| Location | Turn on location | LyniaGo uses your location to show you nearby jobs and navigate you turn-by-turn to pickups and drop-offs. We only use it while you're online or on a job. | Allow location | Not now |
| Notifications | Stay in the loop | Get notified the moment a new job is posted near you, when a customer picks you, and for delivery updates. | Turn on notifications | Not now |

What's wrong with it:
- "navigate you turn-by-turn" is false: riders navigate in Google Maps or Waze;
- background use during a job is never explained;
- "Not now" shows no consequence;
- there are no denied, denied-for-good, approximate or GPS-off states;
- the notifications icon is a phone glyph.

### 3. Copy that already exists (keep consistent)

| Where | Copy |
|---|---|
| Android job notification | "LyniaGo — delivery in progress" · "Sharing your location with the customer for this delivery." |
| Manifest rationale | "LyniaGo uses your location to set the pickup point." (customer-worded) |
| Rider J8 warn row | "Notifications are off. You won't get new jobs or food offers." |
| Rider Settings | "New-job ping and the food-offer alarm" · "Must be on to receive jobs. Customers see you only during a job." · "Location is off. You can't receive jobs." |
| Customer H6 card | "Where should we deliver?" · "Use my location" · "Type an address" |
| Force update | "Time to update" · "A new version of LyniaGo is ready with the latest fixes. Update to keep using LyniaGo." · "Update now" |

### 4. Tokens (Calm Mint v2; use only these)

| Token | Value | Use |
|---|---|---|
| ink | `#14181B` | body text |
| muted | `#5B6670` | secondary text |
| line | `#E2E6EA` | hairlines, field borders |
| surface | `#F6F7F8` | notes, verified rows |
| bg | `#FFFFFF` | screens |
| brand | `#00B14F` | fills only: progress, icon discs, active borders, splash |
| green-text | `#006630` | links, small green text |
| cta / pressed | `#00812F` / `#006B27` | primary button fill (white text) |
| mint | `#E9F8EF` | hero panels, chips, ok notices |
| forest | `#063B22` | live-order bar |
| highlight / ink | `#FFD23F` / `#3D3100` | chips, dots |
| rider-wash | `#ECE8FF` | rider hero |
| free (violet) | `#4B2FBF` | rider headline accent |
| danger / wash / ink | `#C0392B` / `#FAEDEB` / `#8F2418` | warn boxes |
| Type | Inter 400/600/700, tabular numerals; Fredoka 600 for the wordmark only | |
| Radius | fields 12 · cards 14–16 · hero 28 · sheet 24 · pills 999 | |
| Space | gutter 16, grid 8 | |
| Depth | zero shadows (tint + hairlines), except sheet dim `rgba(20,24,27,.45)` | |
| Targets | `--target-min` 44 · `--target-primary` 52 | |

---

## Part 3: Files to attach to Claude Design

1. `packages/design/handoff/calm-mint-v2-2026-10/`: `README.md`, `Calm Mint v2 - all screens.html`
   (`?screen=H5`, `H6`, `C1`–`C5`, `R1`–`R3`) and `assets/`.
2. `packages/design/handoff/rider-v2/`: `README.md`, `BRIEF.md`, `design/Rider v2 (standalone).html`,
   `design/rv-kit.jsx`, `design/rv-account.jsx`.
3. `packages/design/handoff/splash-v1/` (`README.md` and `Splash.html`), for U1 and section H.
3b. `packages/design/handoff/kyc-2026-08/README.md` (the outcome copy and the old flow), for F.
3c. `docs/designs/owner-review-2026-10-02/PROMPTS.md` Prompt 1 (rider photo, an earlier ask), for E.
3d. Renders of today's Bike & documents, the KYC gates, the "Earn with your bike" card and Settings
    (the Rider v2 prototype `?screen=` views cover them).
3e. **The current-UI pack** (`first-run-v2-current-ui.zip`, overview sheet
    `docs/designs/first-run-v2-current-ui.png`). It shows today's app for every section, named by
    section letter:
    - A: customer location priming (old), Settings with permissions off, H5 / H6;
    - B: rider permissions, mock vs app;
    - C: force update, mocks vs app;
    - D: Settings (customer, rider) and C5;
    - E: Bike & documents (new rider, verified);
    - F: every ID-check wall (in review, unfinished, declined, locked, expired, R2);
    - G: "Earn with your bike", the Account Become card, C1, R1;
    - I: R3, Delete account.

    "Reconnecting…" in the rider headers is an artifact of the render harness (it has no live
    socket), not part of the design. For the splash (H), use `splash-v1/Splash.html`, which plays
    every state.
4. Renders of today's screens: `node tools/parity/pair.mjs --keys LJ.perm_loc,LJ.perm_notif,LJ.force_update --out out/perm-update`.
5. `docs/designs/rider-permissions-v1-PROMPT.md` (optional, the fuller rider reference).

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

- **Export** to `packages/design/handoff/first-run-v2/` with a `docs/DESIGN-DEVIATIONS.md`
  entry (next free number) marking `LJ/RJ perm_loc`, `perm_notif` and `force_update` superseded. The
  design-freeze CI job requires it. Add a matching CLAUDE.md authority line.
- **Rebuild:**
  - `app/permissions.tsx` (rider flow, plus its two generated views);
  - a location explainer wired into `src/logic/home-location.ts`, the H6 card and the H5 sheet;
  - a notifications explainer wired into `src/push/ask-in-context.ts` and its two callers
    (`app/send.tsx`, `app/food/checkout.tsx`);
  - `app/force-update.tsx` and its generated view.
- **Strings:** `PC`, `RP` and `UP`, verbatim, in `src/ui/permissions/copy.ts`.
- **Wiring:**
  - denied / denied-for-good / approximate / GPS-off states to `expo-location` / `expo-notifications`
    (`canAskAgain`, `Location.hasServicesEnabledAsync`, `Linking.openSettings`);
  - re-read the permission on `AppState` active.
- **Native (next store build, not OTA):**
  - the foreground-service notification copy in `src/realtime/background-location-task.ts`;
  - the manifest rationale in `app.config.ts`.
- **Also rebuild:**
  - `app/settings/personal.tsx` (D, being built from kit parts on 2026-10-06; realign it);
  - `app/rider/documents.tsx` (E, the same);
  - the board's KYC gates and the R2/R3 pages in `app/rider/(tabs)/index.tsx` and
    `src/ui/onboarding/rider.tsx` (F);
  - the rider entry routing (G);
  - `src/boot/splash/*` (H);
  - copy in `src/ui/rider/copy.ts` / `src/ui/onboarding/copy.ts` (I).
- **If U4 (soft update) is approved:** add a "recommended version" field next to the server's
  `/app/version-gate` minimum.
