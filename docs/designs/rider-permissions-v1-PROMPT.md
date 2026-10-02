# LyniaGo rider permissions: design brief for Claude Design (v1, 2026-10-02)

> **How to use this:** paste **Part 1 (the prompt)** into Claude Design as your first message, then
> **Part 2 (the current-state reference)** right after it, or attach this whole file. Then attach the
> files in **Part 3**, in that order. Claude Design can't see the repo, so this file carries
> everything it needs.
>
> **Why this round exists (owner decision, 2026-10-02):** the rider's permission priming screen is the
> last rider surface still in an old design generation, and it was never designed for riders. The
> owner chose to keep the current screen running for now and get it designed properly. It matters
> beyond looks: **Android grants location far more often when the app explains why first**, and
> background ("while on a job") location in particular is the permission users refuse when it arrives
> as a bare OS dialog. A rider who says no can't receive jobs, and a rider whose location stops while
> they navigate freezes the customer's live map.

---

## Part 1: The prompt (paste this first)

You are designing the **permission screens on the rider side of LyniaGo**, a delivery app in Zimbabwe
(Harare first). One Android app (Expo / React Native) serves customers and riders. Riders carry
parcels and food orders on motorbikes; they are **always online** once they pass the gates (there is
no Online/Offline switch), they see a **board of nearby jobs**, and while on a job they usually
navigate in **Google Maps or Waze**, with LyniaGo in the background.

A rider needs two permissions to work:

1. **Location.**
   - *Foreground ("while using the app"):* shows nearby jobs on the board, puts the rider on the map,
     and checks they're inside the service area. Without it the rider can't receive jobs.
   - *While on a job, in the background:* when the rider switches to Google Maps or Waze, LyniaGo keeps
     sharing their position with the customer for that job only. Android shows a persistent
     notification for it the whole trip: **"LyniaGo — delivery in progress · Sharing your location
     with the customer for this delivery."** It stops the moment the job ends. Customers see the
     rider only during a job.
2. **Notifications.** The new-job ping, the 60-second food-offer alarm, "the customer picked you",
   and delivery updates. On Android 13+ this is also what lets the job notification above appear.
   Without it the rider misses jobs.

**What I want from you:** a high-fidelity, rider-specific **permission flow** that explains each
permission *before* the Android dialog appears, plus every state that follows (granted, denied,
denied for good, granted only partly, turned off later). It must look like **Rider v2** (attached),
the design the rest of the rider app now follows.

### Decided for this round. Treat these as final.

1. **Ask after the explanation, never before.** Each permission gets its own explainer screen; the
   Android dialog opens only when the rider taps the primary button.
2. **Order:** location first, then the "while on a job" location explanation, then notifications.
   Tell me if you think a different order earns more grants, and why.
3. **Never a dead end.** Every screen has a way forward. "Not now" lets the rider continue; the app
   asks again in context later (the Rider v2 gates and warn rows already do this: G8 No GPS, J8
   Notifications off, Settings S3).
4. **Shown once per install**, right after sign-in and before the rider's first board. A rider who
   already granted everything never sees it.
5. **Rider only.** The customer side asks in context (Calm Mint v2: location when Home first needs an
   address, notifications after the first order). Don't design customer screens.
6. **Honest copy.** Say exactly when location is used (on the board and during a job), who sees it
   (the customer, only during their job), and when it stops. No vague "to improve your experience".

### Hard constraints. Don't break these.

- **Frames:** Android phone. Design at **360×720**; every state must also work at **320×640** (the
  entry-phone check), and the key states at **font scale 1.3**. Content scrolls; nothing hides under
  a pinned CTA bar (bottom padding = bar height + 16).
- **Visual language: Rider v2.** Reuse its parts; don't invent parallel components: the mint top
  card language, `AHeader` for pushed screens, cards (radius 16), the `--danger-wash` /
  `--danger-ink` warn box used for "Location is off" and "Notifications are off", the gate layout
  (G-screens: icon disc, 22/700 title, facts, actions), SmBtn, and the Lucide icon set. Illustration
  may reuse Calm Mint v2's rider art (`biz-scooter-rider.svg`) if it helps; say where.
- **Tokens: Rider v2's table only** (Part 2 §4). No new tokens; if you truly need one, name it, give
  its value and justify it. **Never red text on white.** `--accent` is a fill, never text.
- **Targets:** ≥ **44 dp** (`--target-min`) for everything, **52 dp** (`--target-primary`) for the one
  primary CTA per screen. Draw them at that size. Every icon has a visible text label.
- **No manual refresh, no "Retry" buttons.** Re-read the permission state when the app comes back to
  the front (the rider returns from Android Settings) and move on by itself; you may add an
  "I've turned it on" button, as G8 does.
- **Vocabulary:** Job, Order, Fare, Delivery code, **LyniaGo** (never "Lynia"), SMS, WhatsApp.
  Help & support goes to WhatsApp.
- **Android realities to design for**, each as its own state:
  - The OS dialog offers **Precise / Approximate**. Approximate isn't enough for pickup and drop-off
    navigation; design the "you chose approximate" follow-up.
  - **"Don't allow" twice = denied for good:** Android stops showing the dialog, so the only path is
    **Open phone settings** (with the steps: *Permissions → Location → Allow only while using the
    app*, *Use precise location* on). Design that screen.
  - **Location services off** for the whole phone (the GPS toggle), distinct from LyniaGo's
    permission. Rider v2 G8 is the gate version; the priming flow needs its own moment.
  - **Notifications blocked** at the OS level, including "the job-alert channel is muted" (the 60 s
    food alarm needs sound).
  - Optional, as a separate frame you flag as **OPTIONAL**: some phones (Tecno, Infinix, Xiaomi)
    kill background apps to save battery. An explainer for "Don't optimise battery for LyniaGo",
    reached from Settings, not part of the first-run flow.
- **What we ask Android for today:** location *while using the app*, kept alive during a job by a
  foreground service and its notification. We do **not** request Android's "Allow all the time"
  (it drags the app through Google Play's background-location review). Design the background
  explanation for the job-time behaviour above. If you believe "Allow all the time" is worth
  requesting, draw it as a clearly labelled **ALTERNATIVE** frame and list it as an open question.

### What's wrong today (fix these, and find more)

- **It's a customer screen with rider words swapped in.** Both steps are a generic system-state
  layout (centred icon, title, paragraph, two buttons) drawn for the customer in an older design
  generation (`LJ perm_loc` / `perm_notif`). Nothing about it says "rider".
- **One paragraph per permission.** Location is explained in one 40-word sentence; the background
  "while on a job" use (the one riders refuse most) is never mentioned at all, so the first time a
  rider meets it is the persistent notification mid-trip.
- **"Not now" is a quiet skip with no consequence shown.** A rider who skips doesn't learn they won't
  get jobs until the board is empty.
- **No denied, denied-for-good, approximate or GPS-off states.** If the rider taps "Don't allow", the
  flow just moves on.
- **The notifications icon is a phone glyph**, kept from the customer mock.

### Deliverables (same package shape as Rider v2, After Send v2 and Calm Mint v2)

1. `BRIEF.md`: the decisions you made, as short final statements, plus open questions.
2. `README.md`: screen + state list with ids (`P1`, `P2`…), what each tap does (including which
   Android dialog opens and what happens after Allow / Don't allow / Approximate), the constraints
   above, a component spec with exact sizes at 360 and 320, a token table saying where each token
   is used, a **NEEDS BACKEND / NEEDS NATIVE** section, and a **Retires** section.
3. A standalone HTML prototype showing **every state at 360×720**, key states at **320×640** and at
   **font scale 1.3**, with a single-screen view per id (`?screen=P1`). Draw the Android system
   dialogs too (Android 14 style), so the sequence reads end to end.
4. A kit file with the shared parts **and one object with every user-facing string, named `RP`** (in
   the style of Rider v2's `R`: flat keys, final copy, no lorem). The app ships it verbatim. Include
   the Android foreground-service notification's title and body as keys, so the in-app explanation
   and the notification say the same thing.
5. 2× PNG renders of every state.

### States to cover (360×720 each; key ones also at 320×640 and font scale 1.3)

**Location**
- P1 · Location explainer (foreground): why, when it's used, who sees it.
- P2 · The Android dialog over P1 (Precise / Approximate · While using the app / Only this time /
  Don't allow).
- P3 · "While on a job" explainer: keeps sharing with the customer while you navigate in Google Maps
  or Waze; the persistent notification it shows (draw it); stops when the job ends.
- P4 · Approximate chosen: ask for precise, with what changes if they don't.
- P5 · Denied once: the cost in one line ("You can't receive jobs without location"), ask again or
  continue.
- P6 · Denied for good: Open phone settings, with the steps; "I've turned it on".
- P7 · Phone location (GPS) switched off.
- P8 · Granted: a brief confirmation, then on to notifications (or skip the frame if you think it
  slows the rider; say why).

**Notifications**
- P9 · Notifications explainer: the new-job ping, the 60 s food-offer alarm (with sound), "you were
  picked", delivery updates. Offer a **Test ping** (Rider v2 Settings already has "Test ping" /
  "Test alarm").
- P10 · The Android 13+ dialog over P9.
- P11 · Denied / blocked: the cost, Open phone settings with the steps.
- P12 · Job-alert channel muted (notifications allowed, alarm silent).

**Endings and re-entry**
- P13 · All set → the rider's first board (Rider v2 Jobs tab).
- P14 · Skipped something → the board with Rider v2's warn row (J8) or the G8 gate, showing how the
  flow and the in-context asks connect.
- P15 · Settings → Location / Job alerts off (Rider v2 S3) reopening the matching explainer.
- P16 · OPTIONAL · Battery optimisation explainer (from Settings).
- Any ALTERNATIVE frame ("Allow all the time"), clearly labelled.

**Retire:** the gallery `LJ perm_loc` and `LJ perm_notif` screens for the rider. Say which of your
screens replaces each.

---

## Part 2: Current-state reference (paste after the prompt)

### 1. Where the screen sits in the rider journey

```
Sign in (SMS code) → profile → [PERMISSIONS: location → notifications]  ◄── this brief
                                         └─► /rider: Rider v2 Jobs tab (board)
Rider onboarding (Calm Mint v2 R1–R3: Why ride → Pending → Verified "Go online") and the Rider v2
gates (G1–G14) sit around it. G8 "No GPS" is the gate a rider with location off sees on the board;
J8 is the "Notifications are off" warn row; Settings → RIDER → Job alerts / Location show the state.
```

The screen is `apps/mobile/app/permissions.tsx` (route `/permissions?next=/rider`). It is shown once
per install (a "primed" flag) and forwards straight to the board if already shown. Today it only
requests **foreground** location and notifications; the job-time background sharing starts on its
own when a job goes active (an Android foreground service), with no explanation beforehand.

### 2. What it looks like today

Two steps, each the same generic centred layout (icon in a disc, title, paragraph, primary +
secondary button):

| Step | Icon | Title | Body (rider variant) | Primary | Secondary |
|---|---|---|---|---|---|
| 1 | navigation | Turn on location | LyniaGo uses your location to show you nearby jobs and navigate you turn-by-turn to pickups and drop-offs. We only use it while you're online or on a job. | Allow location | Not now |
| 2 | phone | Stay in the loop | Get notified the moment a new job is posted near you, when a customer picks you, and for delivery updates. | Turn on notifications | Not now |

"Not now" on step 1 goes to step 2; on step 2 it finishes. Denials aren't handled: the flow moves on.
The structure comes from the old customer mocks `LJ perm_loc` / `LJ perm_notif`.

### 3. Copy that already exists elsewhere in the rider app (keep the explainer consistent with it)

| Where | Copy |
|---|---|
| Android job notification (foreground service) | "LyniaGo — delivery in progress" · "Sharing your location with the customer for this delivery." |
| Android permission rationale (manifest) | "LyniaGo uses your location to set the pickup point." *(customer-worded; propose a rider-aware one if you can)* |
| Rider v2 `R.notifOff` (J8 warn row) | "Notifications are off. You won't get new jobs or food offers." |
| Rider v2 `R.sAlertsS` / `R.sAlertsOff` | "New-job ping and the food-offer alarm" / "Notifications are off. You won't get new jobs." |
| Rider v2 `R.sLocS` / `R.sLocOff` | "Must be on to receive jobs. Customers see you only during a job." / "Location is off. You can't receive jobs." |
| Rider v2 G8 | "No GPS" gate · "Open location settings" · "I've turned it on" |

### 4. Design tokens: Rider v2 (use only these)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#14181b` | body text |
| `--muted` | `#5b6670` | secondary text, idle icons |
| `--bg` | `#ffffff` | screens, cards, bars |
| `--surface` | `#f6f7f8` | facts boxes, gate discs |
| `--line` | `#e2e6ea` | borders, dividers |
| `--accent` | `#00b14f` | **fills only**: primary CTA fill, progress |
| `--accent-text` | `#006630` | green text, small icons, Back |
| `--accent-wash` | `#e9f8ef` | mint top card, ok notices |
| `--cta-fill` | `#00812f` | selected segment |
| `--highlight` | `#f2b705` | unread dot, sun/moon sticker only |
| `--danger` | `#c0392b` | warn-notice border |
| `--danger-wash` / `--danger-ink` | `#faedeb` / `#8f2418` | location off, alerts off |
| Shadows | `--shadow-card` / `--shadow-sheet` / `--shadow-menu` | as Rider v2 |
| Radius | input 12 · card 16 · pill 999 · tag 6 | |
| Spacing | 4 · 8 · 12 · 16 · 24 · 32 · 48; gutter 16 | stack gap 12 |
| Type | Inter 400/600/700; 22/700 gate titles (18 under 340 dp) · 16/700 CTA · 15/600 rows · 14 body · 13 labels · 12 meta | tabular numerals |
| Targets | `--target-min` 44 · `--target-primary` 52 | |

---

## Part 3: Files to attach to Claude Design

**Send these first** (if uploading from a phone):

1. **Rider v2, the style authority:** `packages/design/handoff/rider-v2/` — `README.md` (global rules,
   tokens, components, the G-gates, J8, Settings S1–S5), `BRIEF.md`, `design/Rider v2 (standalone).html`,
   `design/rv-kit.jsx` (the `R` copy object and icons), `design/rv-account.jsx` (Settings).
2. **Today's screen:** renders of `/permissions?next=/rider`, both steps, at 360×720 and 320×640.
   Make them with the parity lane (`docs/SCREENSHOT-LANE.md`):
   `node tools/parity/pair.mjs --keys LJ.perm_loc,LJ.perm_notif --out out/rider-perms` — these
   fixtures render the customer variant, so also attach this brief's Part 2 §2 table for the rider
   wording.

**Then:**

3. `packages/design/handoff/calm-mint-v2-2026-10/` — `README.md` §4 (rider onboarding R1–R3, the
   screens right before this flow), `Calm Mint v2 - all screens.html` (`?screen=R1`…`R3`), and
   `assets/` (the rider illustration).
4. `packages/design/explorations/journey/screens.jsx` — `PermLoc` / `PermNotif`, the current mocks,
   for content only, **not** for style.
5. `packages/design/tokens/` — the token CSS, if Claude Design wants the raw values.

---

## Part 4: After Claude Design returns (for us, not for Claude Design)

Per `CLAUDE.md`, a redesign lands like the Rider v2 and Calm Mint rounds did:

- Export to `packages/design/handoff/rider-permissions-v1/` (README, BRIEF, this PROMPT, design/,
  screens/), with a **`docs/DESIGN-DEVIATIONS.md`** entry under the next free number marking
  `LJ perm_loc` / `LJ perm_notif` superseded for the rider. The design-freeze CI job requires it.
- Add a CLAUDE.md line: "The rider's permission screens follow their own handoff
  (`handoff/rider-permissions-v1/`)".
- Rebuild `apps/mobile/app/permissions.tsx` (and its two generated views) from the handoff; strings
  to `src/ui/rider/permissions-copy.ts` (the handoff's `RP`, verbatim); wire the denied / denied for
  good / approximate / GPS-off states to `expo-location` and `expo-notifications`
  (`canAskAgain`, `Location.hasServicesEnabledAsync`, `Linking.openSettings`); re-read on
  `AppState` active.
- Keep the foreground-service notification copy in `src/realtime/background-location-task.ts` equal
  to `RP`'s keys, and update the manifest rationale in `app.config.ts` (native change: new binary,
  not OTA-able).
- If the owner picks an "Allow all the time" frame, that's a separate decision: it adds
  `ACCESS_BACKGROUND_LOCATION` and a Google Play background-location declaration.
