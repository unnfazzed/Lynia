# Handoff: LyniaGo First Run v2 (permissions, update, personal details, bike & documents, ID-check outcomes, rider entry, splash)

**Date** 2026-10-06 · **Fidelity: high** · **Look:** Calm Mint v2 (customer + first-run) and Rider v2 (rider board) · **Target:** `apps/mobile` (Expo / React Native, Android first)

## 0. About these files
The files in `design/` are **design references built in HTML**. Do not ship them. Rebuild each screen in the app with its existing primitives (`src/ui/*`, `Screen`, `Button`, `Sheet`, `Row`, `Icon`, tokens), so the result matches the HTML pixel for pixel at 360×720.

- `design/First Run v2.html`: the 25 hero screens on one canvas.
- `design/First Run v2 - All States.html`: about 70 frames covering every state, plus 320×640 and font scale 1.3 versions. Add `?screen=<ID>` to open one frame, e.g. `?screen=P6`.
- `design/fr-kit.js`: the shared parts, and **the source of truth for every size and colour**. Read its CSS block.
- `design/fr-states.js`: how each frame is composed from those parts.
- `screenshots/<ID>.png`: a 1× render of every state (360×720; D7 and H2* at 320×640). `screenshots/index.html` is a contact sheet.
- `copy.ts`: **every user-facing string.** Ship it verbatim as `src/ui/permissions/copy.ts` (or split it per area).
- `BRIEF.md`: the decisions. `CLAUDE-CODE-PROMPT.md`: the prompts to paste into Claude Code, one per phase.

---

## 1. The shell (used by almost every screen)
Every first-run screen is built from the same five parts, top to bottom:

| Part | Spec (360 wide) |
|---|---|
| Status bar | System. The content starts 36dp from the top: 24dp status bar plus 12dp. |
| **Hero panel** | Full width minus a 16dp gutter on each side. Height **232** (360×720), **160** (320×640), **176** (font scale 1.3). Radius **28**. Fill by tone (below). Decor: a **150dp `#FFD23F` circle** with its centre at (right −56+75, top −56+75), so it overhangs the top-right corner, and an **18dp `#FF6B4A` dot** 36dp from the left and 40dp from the bottom. The dot is hidden when the panel holds cards instead of a disc. Overflow is clipped. |
| **Disc** (inside the hero) | **104dp** white circle (84dp at 320 and at font scale 1.3), centred. Icon 40dp, stroke 1.75, coloured by tone. Halo: a ring 14dp outside the disc, 1.5dp wide, `rgba(255,255,255,.8)`. |
| **Title** | 24dp below the hero (16 at 320). Inter **700, 28/31.4** (24 at 320), letter-spacing −0.025em, `text-wrap: balance`. Two parts: the first in `#14181B`, the **second part coloured by tone**. |
| **Body** | 8dp below the title. Inter 400 15/21.75, `#5B6670`. **One sentence**, at most two. |
| **Footer** (pinned) | White background, padding 12 16 16. A column with 4dp gap: **primary CTA 52dp** (pill, `#00812F` fill, white Inter 600 16, optional 20dp leading icon, 8dp gap). Then an optional **text link 44dp tall** (Inter 600 15, `#006630`, optional 16dp leading icon). The content above scrolls; nothing may hide under the footer. |
| Exit (ID-check screens only) | A **44dp white circle** with a 20dp `x` icon in `#14181B`, absolutely positioned at left 28 / top 48, over the hero's top-left. It is the only way out: no "Send a parcel" or "Order food" secondary buttons on F screens. |

**Tones**

| Tone | Hero fill | Disc icon | Title accent | Used for |
|---|---|---|---|---|
| mint (default) | `#E9F8EF` | `#00B14F` | `#006630` | customer, neutral rider steps, positive outcomes |
| violet | `#ECE8FF` | `#4B2FBF` | `#4B2FBF` | rider permission flow (P*) |
| danger | `#FAEDEB`, sun becomes `#F4D9D5`, dot `#C0392B` at 35% | `#C0392B` | `#8F2418` | denied, blocked, declined, expired, delete |
| neutral | `#F6F7F8`, sun `#E2E6EA`, dot `#AEB6BD` | `#5B6670` | `#006630` | GPS off, notifications declined |
| green | `#00B14F`, yellow sun, white dot at 50% | white logo | `#006630` | U1 update only (white screen, green panel) |

**Other parts** (exact values are in `fr-kit.js`)
- **List card:** 1dp `#E2E6EA` border, radius 16. Rows ≥56dp, padding 8 14, hairline between rows. Leading 36dp icon disc: `#F6F7F8` with a `#5B6670` icon, or `ok` `#E9F8EF`/`#006630`, `vi` `#ECE8FF`/`#4B2FBF`, `bad` `#FAEDEB`/`#8F2418`. Title Inter 600 15, sub 13 muted. Trailing value Inter 600 14 muted (`#006630` when ok), or a chevron 20dp `#AEB6BD`.
- **Step markers** (KYC checklist and the settings steps): 28dp. Done = `#00B14F` fill with a white 16dp check. Open = 1.5dp `#E2E6EA` ring with a 13/700 numeral. Active = a 3dp `#E9F8EF` ring with a `#00B14F` top arc, spinning at 1s linear.
- **Bullet points (P1):** 32dp `#ECE8FF` disc with a 16dp `#4B2FBF` icon, 12dp gap, text 15/20. Gap between rows 14.
- **Chips (F4 tips):** pill, min height 32, `#F6F7F8`, Inter 600 13, 16dp `#006630` icon, 6dp gap. They wrap with an 8dp gap.
- **Soft pill button:** 44dp tall, padding 0 18, `#E9F8EF` / `#006630` Inter 600 14. Used for in-row actions ("Add", "Turn on") and the Test ping (white with a 1dp `#E2E6EA` border).
- **Info box:** radius 14, padding 12 14. `ok` is `#E9F8EF` with `#006630` 600 text. `bad` is `#FAEDEB` with `#8F2418`. `n` is `#F6F7F8`.
- **Tries meter:** two 28×6 bars, radius 3, with a 6dp gap. Remaining = `#00B14F`, used = `#E2E6EA`.
- **Sample notification card** (inside heroes, PC8/P3/I·free): white, radius 16, padding 10 12, a 1dp `rgba(20,24,27,.06)` ring and no shadow. 28dp `#00B14F` app tile (radius 8) with a **white** 16dp icon. Title 13/600, body 12/16 muted. Width 268–296. The cards behind the front one are scaled to .94 and stay opaque.
- **Toast:** `#063B22`, radius 14, padding 14 16, white Inter 600 14, 20dp `#00B14F` check. Sits 96dp above the bottom and auto-dismisses after 2.5s.
- **Sheet:** radius 24 at the top, 4×36 `#E2E6EA` grab handle, padding 8 16 16. Dim `rgba(20,24,27,.45)`.
- **Fields:** 52dp tall, radius 12, 1dp `#E2E6EA` border. Focus = 2dp `#00B14F` border. Error = 2dp `#C0392B` border, with the helper below as a 13/600 `#8F2418` line and a 16dp `alert` icon. Label 13/600 muted, 6dp above the field. Verified read-only row = `#F6F7F8`, no border, 20dp `shield` icon in `#00B14F`.
- **Back header** (Settings and sub-pages): 56dp tall, 24dp below the status bar. 44dp **round `#F6F7F8` back button** with a 24dp `back` chevron. The large title sits below it: Inter 700 30 (24 at 320), −0.025em, padding 4 16 0.
- **Toggle:** 44×26, `#00B14F` on / `#E2E6EA` off, 20dp white knob.
- **Icons:** Lucide, stroke 2 (1.75 at 40dp). Sizes 16, 20, 24 and 40 only. Names used: `navigation, map-pin, bell, bell-off, check, clock, id-card, camera, message-circle, shield-check, bike, user, search, chevron-right, chevron-left, arrow-right, x, volume-2, volume-x, power, plus, refresh-cw, package, sun, lock, wifi-off, circle-alert, image, battery, house, upload, globe, log-out, trash-2, file-text, banknote`.

**Headers reused from shipped screens** (do not redraw them; use the existing components)
- Customer Home header: Calm Mint v2 H1/H6 (sun, coral and blue dots, "DELIVERING TO" or "NO ADDRESS YET", bell, greeting, search) plus the v2 service tiles. Used in PC1–PC7 and U4a.
- Rider and Account greeting header: Rider v2 (mint strip, "Good morning, Tendai", status line "Reconnecting… · 📍12 Samora …" or the address, yellow sun disc, white 44dp bell). Used in P14, U4b and G2.

---

## 2. Screens and states
IDs match the HTML labels. **CTA** is the pinned primary button, **link** the 44dp text button. All copy keys are in `copy.ts`.

### A · Customer location (sheet over Home)
| ID | State | Hero / content | CTA → | Link → |
|---|---|---|---|---|
| PC1 | Explainer. Opened from H6 "Use my location" and H5 "Use my current location" | Sheet over Home (no address). Mint hero 150 with a `navigation` disc. `PC.locA/locB/locBody` | `PC.locCta`: opens the **Android location dialog** (PC2) | `PC.locAlt`: H5 search |
| PC2 | Android 14 dialog over PC1 | System: Precise / Approximate, While using the app / Only this time / Don't allow | Precise + While using / Only this time → **PC7** · Approximate → **PC3** · Don't allow → **PC4** (1st) / **PC5** (`canAskAgain=false`) | |
| PC3 | Approximate granted | Mint hero 130 with a `map-pin` disc. `PC.approx*` | `PC.approxCta`: re-requests precise (Android shows the upgrade dialog) | `PC.approxAlt`: H5 search, keeping the approximate centre for search bias |
| PC4 | Denied once | No hero. Sheet title `PC.deniedA/B`, body, then H5 search focused, with suggestions | (none; picking a result sets the address) | |
| PC5 | Denied for good | Danger title `PC.foreverA/B`, then the 3 numbered steps `PC.step1–3` in a list card | `PC.openSettings`: `Linking.openSettings()`. **On AppState `active`, re-read the permission; if granted, go to PC7.** | `PC.locAlt` |
| PC6 | Permission granted, phone GPS off (`hasServicesEnabledAsync=false`) | Neutral hero 130 with `map-pin`. `PC.gps*` | `PC.gpsCta`: `Location.enableNetworkProviderAsync()` (Google's turn-on dialog) | `PC.locAlt` |
| PC7 | Granted | H1 fills in, plus the toast `PC.grantedToast` with the resolved address | | |

### A · Customer notifications (after the first order is placed)
| ID | State | Content | CTA → | Link → |
|---|---|---|---|---|
| PC8 | Explainer on the order-placed screen. **Only if** the permission is undetermined **and** this is the first order on this install | Pill `PC.placed`. Mint hero 250 with 3 stacked sample notifications (`PC.ex1–3`). `PC.notif*` | `PC.notifCta`: **Android 13+ POST_NOTIFICATIONS** (PC9) | `PC.notifAlt`: dismiss and continue the order (ask again after the next order, max 3 times total) |
| PC9 | Android dialog | System | Allow → close the explainer · Don't allow → PC10 | |
| PC10 | Declined | Neutral hero 200 with `bell-off`. `PC.off*` | `PC.offCta`: back to the order tracking screen | |
| PC11 | Settings, Order updates off | A danger info card at the top of Settings, `PC.setOff*` with a "Turn on" soft pill. The **Order updates** row toggle is off | Turn on: if `canAskAgain`, open PC8 again; otherwise go to PC5-style steps using the notification wording | |

### B · Rider permission flow (once per install, after R3 "You're verified", before "Go online")
Order: **P1 → P2 → (P3 → P8 toast) → P9 → P10 → P13**. Each "Not now" moves to the next step; any skipped step resurfaces on the board as J8 or G8 (P14).

| ID | State | Content | CTA → | Link → |
|---|---|---|---|---|
| P1 | Location | Violet hero with a `map-pin` disc. `RP.locA/B` plus 3 bullets `RP.loc1–3` | `RP.locCta`: Android dialog (P2) | `RP.notNow` → P9 |
| P2 | Android dialog | System | Precise → P3 · Approximate → P4 · Don't allow → P5 / P6 | |
| P3 | During a job | Violet hero with tag `RP.tripTag` and the **drawn foreground-service notification** (`RP.fgsTitle/fgsBody`). `RP.trip*` | `RP.tripCta` → P9 (we do **not** request background "all the time"; this uses a `location` foreground service during a job) | |
| P4 | Approximate | Violet hero `map-pin`. `RP.approx*` | `RP.approxCta`: upgrade request | `RP.notNow` → P9 |
| P5 | Denied once | Danger hero. `RP.denied*` | `RP.askAgain`: request again | `RP.continue` → P9 |
| P6 | Denied for good | Danger hero 180, then the steps `RP.step1–3` | `RP.openSettings`: re-read on return | `RP.turnedOn`: re-read now; if still denied, shake the steps card |
| P7 | GPS off | Neutral hero. `RP.gps*` | `PC.gpsCta`: `enableNetworkProviderAsync` | `RP.notNow` |
| P8 | Granted | **Not a screen**: toast `RP.grantedToast` over P3 for 2.5s | | |
| P9 | Notifications | Violet hero with a **mock job-offer card** (pill `RP.offerTag` `#FFD23F`/`#3D3100`, 60s countdown, fare 22/700, route 13 muted, 4dp `#4B2FBF` progress on `#ECE8FF`). `RP.notif*`. Below it, a white soft pill `RP.testPing` (plays the job-alert channel sound) | `RP.notifCta`: POST_NOTIFICATIONS (P10) | `RP.notNow` → P13 |
| P10 | Android dialog | System | Allow → check the channel (P12 if muted) → P13 · Don't allow → P11 | |
| P11 | Blocked | Danger hero 180 `bell-off`, then the steps `RP.step1, nStep2, nStep3` | `RP.openSettings` | `RP.turnedOn` |
| P12 | Job-alert channel muted (`getNotificationChannelAsync('job-alerts').importance < HIGH` or sound off) | Danger hero `volume-x`, then the steps `mStep2/3` | `RP.openSettings`: **channel settings** (`openNotificationChannelSettings`) | `RP.testPing` |
| P13 | All set | Mint hero with `trust-verified.svg` (140 tall). `RP.done*` | `RP.goOnline` (`power` icon) → board, online | |
| P14 | Skipped something | Rider board: J8 danger row `RP.j8` + "Turn on" (→ P9), and G8 as an **Empty States v2 mark** (64 mint disc + halo, title 18/600 `RP.g8A`, body, soft pill `RP.turnOn` → P1) | | |
| P15 | Settings · Location off | The Location row gets a danger wash with sub-text "Off · You can't receive jobs". Tapping it reopens P1 (or P6 if `canAskAgain=false`) | | |
| P16 | Battery saver (optional, from Settings only) | Violet hero `battery`. `RP.bat*` | `RP.batCta`: `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | `RP.notNow` |

### C · App update (role-neutral, shown before the role is known)
| ID | State | Content | CTA | Link |
|---|---|---|---|---|
| U1 | Required (server `minVersion` > installed) | **White screen**; green hero 280 with the white LyniaGo mark (88). `UP.title/titleB/body`. Optional what's-new pill (`#F6F7F8`, "**New**" in `#006630`, then the server line) | `UP.cta`: Play Store deep link | `UP.help`: WhatsApp |
| U2 | No store link configured | `UP.noLinkBody`. No what's-new pill | `UP.noLinkCta`: WhatsApp | |
| U3 | Offline | Disabled CTA (`#E2E6EA` / `#5B6670`). Info box `n` with `wifi-off` and `UP.offlineNote`. Re-enables by itself on reconnect | | `UP.help` |
| U4a | Soft · customer Home (**NEEDS BACKEND** `recommendedVersion`) | A banner under the Home header: `#063B22`, radius 20, title 15/700 white, body 13 `#B9E8CC`. A `#00B14F` "Update" soft pill and a 44dp `x` dismiss. Shown **once per version** | | |
| U4b | Soft · rider board | The same banner in `#4B2FBF` with body `#DCD5FF` and a white pill with violet text | | |
| U5 | Back from Play without updating | Stays on U1 (no extra state) | | |

Contrast decision: white 16px text on `#00B14F` is 2.9:1 and fails AA. That's why U1 moves to white with a green panel; the splash stays green.

### D · Personal details (Settings → Personal details; customer and rider)
| ID | State | Spec |
|---|---|---|
| D1 | Settings row | First row of the "You" card: `ok` disc with `user`, `PD.row` / `PD.rowSub`, chevron. Rider Settings also show "Bike & documents" with "1 to add", Language, an Alerts card (Job alerts / Location / Order updates toggles) and Sign out |
| D2 | Edit | Back header, title `PD.title`. First name / Surname fields side by side (gap 12). Verified phone row (read-only). Label "National ID · optional", field with placeholder `63-123456A78`, helper `PD.idWhy`. CTA `PD.save` |
| D3 | Saved | **Inline on the button**: the CTA turns `#E9F8EF` / `#006630` with a check and `PD.saved` for 1.5s, then reverts. No toast |
| D4 | ID on another account (server 409) | Field in error. Danger box with `PD.takenA/B` (bold) plus `PD.takenBody`. CTA becomes `PD.takenCta` (WhatsApp) |
| D5 | Invalid format | Regex `^\d{2}-\d{6,7}[A-Z]\d{2}$` (normalise spaces, uppercase). Error helper `PD.invalid`. Validate on blur and on Save |
| D6 | Verified rider | ID row read-only, `#F6F7F8`, masked `••-••••••K07` (last 3 shown), "Verified" with a check, helper `PD.idVerified`. Not editable |
| D7 | 320 with the keyboard up | The CTA rides above the keyboard (`KeyboardAvoidingView` / `adjustResize`). The ID field scrolls into view |

### E · Bike & documents (rider)
| ID | State | Spec |
|---|---|---|
| E1 | New rider | Back header, title `BD.title`. Progress: three 6dp bars plus "1 of 3". List: National ID (Verified), Rider photo (sub `BD.photoSub`, soft "+ Add"), Bike plate (sub `BD.plateSub`, soft "+ Add"). Footnote `BD.optional`. **No "Re-verify" CTA; no nagging elsewhere** |
| E2a | Add photo · choose | Sheet: `BD.camera` / `BD.gallery` rows with `ok` discs |
| E2b | Capture guide | Full-screen `#14181B`. Close `x` top-left. Title `BD.guideA` + `BD.guideB` in `#00B14F` (on dark: allowed as text at 26/700, contrast 6.7:1 on `#14181B`). Dashed oval face guide 220×290. Translucent chips `guide3, guide2, guide1`. 76dp shutter |
| E2c | Preview | 240 circular preview. Title "Looking **good**". CTA `BD.use` · link `BD.retake` |
| E2d | Uploading | Row sub-text becomes a 4dp progress bar. Value `BD.uploading` |
| E4a/b/c | Plate sheet / error / saved | Sheet with one field (uppercase, letter-spacing .06em, 600). Regex `^[A-Z]{3}\s?\d{4}$`. Error `BD.plateErr`. Save is **instant**; the row shows the plate with a `#FFF6D6`/`#3D3100` "Checking" pill and sub `BD.plateReview` until ops confirm (**NEEDS BACKEND**: `plate_status`) |
| E5 | All set | Mint hero 200 with a filled `#00B14F` disc and a white check. Title `BD.doneA/B`. Rows with Change / Edit. "Verified" appears **only for what was actually checked** |
| E6 | Upload failed / offline | Danger hero `upload`. `BD.fail*`. CTA `BD.retry`. The photo is kept locally |

### F · ID-check outcomes (one shell; never name the vendor)
Each one is: exit `x` + hero + title + body + (optional) the 3-step KYC checklist (`KY.s1–s3`) + one CTA. **No "Send a parcel" or "Order food" secondary.**

| ID | Server state | Tone / icon | CTA | Link |
|---|---|---|---|---|
| F8 | Just submitted, waiting (0–30s, before R2) | mint, spinner in the disc | (none) | |
| F1 | Manual review (hours) | mint `clock`, checklist "In review" | (none) | |
| F2 | Held for review (needs a person; never reveal why) | mint `shield-check` | | `KY.help` WhatsApp |
| F3 | Unfinished | mint `id-card`, title "Almost there, {firstName}", checklist step 2 "~2 min" | `KY.unfCta` (`arrow-right` trailing) | |
| F4a | Declined · blurry | danger `camera`, tips chips, tries meter | `KY.tryAgain` | `KY.help` |
| F4b | Declined · face mismatch | danger `user`, face tips | same | same |
| F4c | Declined · document not accepted / expired doc | danger `id-card`, `KY.docBody` | same | same |
| F4d | Declined · other | danger `circle-alert`, `KY.otherBody` | same | same |
| F5 | Locked (2 tries used) | mint `message-circle` | `KY.msg` WhatsApp | |
| F6 | ID expired | danger `id-card`, `KY.expBody` with `{date}` | `KY.expCta` | |
| F7 | Can't open the check | danger `wifi-off`, chips `cant1/cant2` | `KY.tryAgain` | `KY.help` |

**Free-job notifications** (server push, NEEDS BACKEND): `KY.notif1T/B` at 1 left, `KY.notif0T/B` at 0.

### G · Rider entry
- **G1:** C1 "Ride with LyniaGo" → OTP → **R1** directly. Drop the Rider v2 "Earn with your bike" card. The permission flow (B) runs **after R3, before Go online**.
- **G2:** Customer Account → violet "Become a rider" card (radius 24, `#ECE8FF`, sun 120 top-right, coral 14 dot; title 22/700 with "your bike" in `#4B2FBF`; `KY.becomeBody`; CTA `KY.becomeCta` with a trailing arrow) → R1.
- **G3:** switching the Account toggle back to Rider mid-check lands on the **current F state** (or R2 if pending).

### H · Splash
- **H1 · Rider:** two steps only, `SP.r1` then `SP.r2`. Card: white, radius 20, 48dp rows, the same step markers.
- **H2 · 320×640:** the card bottom is `navBarHeight + 16` (3-button: 48+16; gesture: 20+16). The wordmark (Fredoka 600 44, white) is **centred in the space above the card**: `top = (H − bottom − cardH)/2 − 40`. Offline swaps the card for a single row `SP.offline` / `SP.offlineBody`.

### Font scale 1.3 / 320×640
The hero shrinks (176 / 160), the disc goes to 84, and the titles scale with the text but stay 2 lines maximum at 360. The footer stays pinned and the body scrolls. Check the frames in the "Font scale 1.3" and "320×640" sections of the All States file.

---

## 3. Android realities (wiring)
- `expo-location`: `requestForegroundPermissionsAsync()` → `{status, canAskAgain}`. `getForegroundPermissionsAsync()` → `android.accuracy === 'coarse'` → PC3/P4. `hasServicesEnabledAsync()` → PC6/P7. `enableNetworkProviderAsync()`.
- `expo-notifications`: `getPermissionsAsync` / `requestPermissionsAsync` and `getNotificationChannelAsync('job-alerts')`.
- **Re-read on `AppState` → `active`** for every "Open phone settings" state. Never show a Retry button.
- Foreground service during a job: title `RP.fgsTitle`, body `RP.fgsBody` (**NEEDS NATIVE**, next store build, `src/realtime/background-location-task.ts`).
- Manifest rationale: `RP.manifestRationale` (**NEEDS NATIVE**, `app.config.ts`).

## 4. State
- `permissions`: `{loc: 'undetermined'|'granted'|'coarse'|'denied'|'blocked', gps: boolean, notif: 'undetermined'|'granted'|'denied'|'blocked', channelMuted: boolean}`. Recomputed on mount and on AppState active.
- `riderPermFlowDone` (per install, AsyncStorage): set at P13 or after the last "Not now".
- `custNotifAsks` (count, max 3) and `custLocAsked`.
- `softUpdateDismissed[version]`.
- `kycStatus` from the server: `pending | submitted | manual_review | held | unfinished | declined{reason, triesLeft} | locked | expired{date} | cant_open`, mapped to F8, F1, F2, F3, F4a–d, F5, F6, F7.
- `profile`: `{firstName, lastName, phone, nationalId?, nationalIdVerified}`. `bike`: `{photoUrl?, plate?, plateStatus: 'none'|'checking'|'verified'}`.

## 5. Tokens (Calm Mint v2 only, no new ones)
ink `#14181B` · muted `#5B6670` · line `#E2E6EA` · surface `#F6F7F8` · bg `#FFFFFF` · brand `#00B14F` (fills only) · green-text `#006630` · cta `#00812F` / pressed `#006B27` · mint `#E9F8EF` · forest `#063B22` · highlight `#FFD23F` / `#3D3100` · rider-wash `#ECE8FF` · violet `#4B2FBF` · danger `#C0392B` / wash `#FAEDEB` / ink `#8F2418` · coral decor `#FF6B4A` · sky decor `#3EC1F3` (Home header only).

**Two decor and edge values to confirm** (used, not in the token table): `#F4D9D5` (the sun on danger heroes) and `#FFF6D6` (the "Checking" pill wash, which pairs with highlight-ink). Add them as `dangerSun` and `highlightWash`, or swap in the nearest token.

Type: Inter 400/600/700, tabular numerals; Fredoka 600 for the wordmark only. Radius: fields 12 · boxes 14 · cards 16 · banners 20 · sheet 24 · hero 28 · pills 999. Space: gutter 16, grid 4/8. Depth: no shadows (hairline rings only) except the sheet dim. Targets: 44 minimum, 52 primary.

## 6. Retires
PC1–PC11 replace the bare dialogs and `LJ perm_loc` / `LJ perm_notif`. P1–P16 replace `RJ perm_loc` / `RJ perm_notif` (`app/permissions.tsx`). U1–U5 replace `LJ/RJ force_update`. F1–F8 replace Rider v2 KYC gates G1–G7 (during onboarding) and the `kyc-2026-08` outcome screens. E1–E6 replace Rider v2 S5. G2 replaces the Account "Earn with your bike" card copy. G1 removes the board's "Earn with your bike" interstitial.

## 7. Assets
`design/assets/brand/lyniago-mark-mono.svg` (U1, tinted white), `design/assets/illustrations/trust-verified.svg` (F8 alt, P13), `design/assets/service-icons/v2/{send,restaurants,shops,pharmacy}.svg` (Home tiles, already in the app). Icons: Lucide (already in the app).
