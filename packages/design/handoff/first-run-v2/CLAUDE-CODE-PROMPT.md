# Claude Code prompts — First Run v2

Put this folder at `packages/design/handoff/first-run-v2/` in the repo. Run the phases in order, **one prompt per session**; each ends with typecheck, lint and a checklist. Paste everything below a line.

---

## Phase 0 · Read and plan (no edits)

You're implementing LyniaGo **First Run v2**. The spec is `packages/design/handoff/first-run-v2/README.md`, and the decisions are in `BRIEF.md`. Read both fully, then read `copy.ts` and the CSS block at the top of `design/fr-kit.js` (exact sizes and colours). The HTML in `design/` is a visual reference only: never import or ship it. Open `design/First Run v2 - All States.html?screen=<ID>` to see any frame.

Then read these files and report back **before changing anything**:
`app/permissions.tsx`, `src/logic/home-location.ts`, `src/push/ask-in-context.ts`, `app/send.tsx`, `app/food/checkout.tsx`, `app/force-update.tsx`, `app/settings/index.tsx`, `app/settings/personal.tsx`, `app/rider/documents.tsx`, `app/rider/(tabs)/index.tsx`, `src/ui/onboarding/rider.tsx`, `src/boot/splash/*`, `src/ui/index.tsx`, the colour tokens file.

Report:
1. Which existing primitives map to README §1 (Screen, Button, Sheet, Row, Field, Toggle, Icon, Toast) and what's missing.
2. Every place a permission is requested today (file:line).
3. The current KYC status enum and where it's mapped to UI.
4. A file-by-file plan for phases 1–6.

---

## Phase 1 · Shell parts and copy

Build the shared parts from README §1 in `src/ui/firstrun/` and export them from `src/ui/index.tsx`:
- `HeroPanel` (props `tone: 'mint'|'violet'|'danger'|'neutral'|'green'`, `height?`, `children`, `decor?: boolean`)
- `HeroDisc` (icon, sizes 104/84)
- `SplitTitle` (`a`, `b`, `tone`)
- `Body`
- `PinnedFooter` (primary 52 plus optional 44 link)
- `ExitButton` (44 white circle `x`)
- `StepList` (the 1-2-3 settings steps)
- `KycChecklist` (`step2: 'active'|'next'|'done'`, `label`)
- `TipChips`
- `TriesMeter`
- `SampleNotification`
- `InfoBox` (`ok|bad|n`)
- `SoftPill`
- `FirstRunToast`
- `SystemSettingsSteps`

Hero sizes respond to `useWindowDimensions` (≤340 wide → 160) and `PixelRatio.getFontScale()` (≥1.2 → 176). Use only the tokens in README §5. Add `dangerSun #F4D9D5` and `highlightWash #FFF6D6` with a comment pointing to BRIEF open questions.

Copy `copy.ts` verbatim to `src/ui/permissions/copy.ts`.

Build a dev-only gallery route `app/dev/first-run.tsx` that renders each part in every tone. Verify at 360×720, 320×640 and font scale 1.3. Report.

---

## Phase 2 · Customer permissions (A)

Implement PC1–PC11 per README §2A, using the Phase 1 parts and `PC` copy.
- `src/logic/home-location.ts`: one `askLocation()` state machine: undetermined → PC1, coarse → PC3, denied (`canAskAgain`) → PC4, blocked → PC5, GPS off → PC6, granted → PC7 toast. Wire it to the H6 card "Use my location" and the H5 sheet "Use my current location". PC1–PC6 are **sheets over Home**, not routes.
- `src/push/ask-in-context.ts`: show PC8 on the order-placed screen only if notifications are undetermined, `custNotifAsks < 3` and this is the order-placed moment. Wire both callers (`app/send.tsx`, `app/food/checkout.tsx`). PC10 after a decline.
- Settings: PC11 warn card plus the toggle row.
- Re-read the permission on `AppState` active; no Retry buttons anywhere.

Verify each state on a device or emulator (Android 14): grant precise, grant approximate, deny once, deny twice, GPS off, notifications allow and deny. Checklist ID → file → done.

---

## Phase 3 · Rider permission flow (B)

Rebuild `app/permissions.tsx` as the P1 → P3 → P9 → P13 flow per README §2B, with `RP` copy and violet tone. Include P4–P7 and P11–P12 branches, the P8 toast and the P13 "Go online".
- Insert the flow **after R3, before Go online** (G1). Persist `riderPermFlowDone` per install.
- Board (`app/rider/(tabs)/index.tsx`): J8 row → P9. G8 becomes the Empty States v2 mark → P1 (P14).
- Settings: Location and Job alerts rows reopen P1 / P9 (P15). Battery row → P16.
- P12: detect a muted `job-alerts` channel and open channel settings.
- NATIVE (next store build): foreground-service title/body from `RP.fgsTitle/fgsBody` in `src/realtime/background-location-task.ts`; manifest rationale `RP.manifestRationale` in `app.config.ts`. Flag these in the PR description.

Verify on Android 14: the full happy path, each "Not now" (lands on the next step, and the board shows J8/G8), denied for good → settings → back. Checklist.

---

## Phase 4 · App update (C) and splash (H)

- `app/force-update.tsx`: U1 (white screen, green hero, white mark, optional `whatsNew` from the server), U2 (no store link → WhatsApp), U3 (offline: disabled CTA, re-enables on reconnect). U5 = still on U1 after returning from Play.
- U4 soft banners on Home and the rider board behind `recommendedVersion` (NEEDS BACKEND; hide it if the field is absent), dismissed once per version.
- `src/boot/splash/*`: rider two-step card (`SP.r1/r2`); at 320×640 place the card at `navBarHeight + 16` and centre the wordmark in the remaining space; offline row. Use `react-native-safe-area-context` insets to get the nav-bar height (3-button vs gesture).

Verify at 360×720 and 320×640 with 3-button and gesture nav. Checklist.

---

## Phase 5 · Personal details (D) and Bike & documents (E)

- `app/settings/personal.tsx`: D2–D7. ID regex `^\d{2}-\d{6,7}[A-Z]\d{2}$` after normalising. 409 → D4. Inline "Saved" on the button for 1.5s (D3). A verified rider's ID is masked and read-only (D6). The keyboard keeps Save visible (D7). Add the "Personal details" row to Settings (D1).
- `app/rider/documents.tsx`: E1–E6. Photo: camera/gallery sheet → capture guide (dark full screen, oval guide) → preview → upload with progress → done; failure keeps the photo locally (E6). Plate sheet with regex `^[A-Z]{3}\s?\d{4}$`; save instantly; "Checking" pill until `plate_status=verified` (NEEDS BACKEND). Remove the WhatsApp "Re-verify my bike" button.

Checklist.

---

## Phase 6 · ID-check outcomes (F), rider entry (G), copy pass (I)

- Map `kycStatus` to F8, F1, F2, F3, F4a–d (by `declineReason`), F5, F6, F7, all in the one shell (`ExitButton` + `HeroPanel` + `SplitTitle` + `Body` + optional `KycChecklist` + one CTA). **No "Send a parcel" / "Order food" secondary on any F screen.** The exit `x` returns to the previous tab.
- These replace the Rider v2 board KYC gates during onboarding (`app/rider/(tabs)/index.tsx`, `src/ui/onboarding/rider.tsx`).
- G1: C1 "Ride with LyniaGo" → OTP → R1 directly; delete the "Earn with your bike" interstitial. G2: rewrite the Account card with `KY.becomeA/B/Body/Cta`. G3: Account toggle back to Rider → current F state.
- Copy pass: replace every ID-check time, "SMS", and "licence" mention in `src/ui/rider/copy.ts` and `src/ui/onboarding/copy.ts` with the `KY` strings. Add the free-job pushes `KY.notif1T/B` and `KY.notif0T/B` to the server notification templates (NEEDS BACKEND).

Final: typecheck, lint, and a full checklist of every ID in README §2 → file → done. Add a `docs/DESIGN-DEVIATIONS.md` entry (next free number) marking `LJ/RJ perm_loc`, `perm_notif` and `force_update` as superseded by `first-run-v2`, plus a matching CLAUDE.md authority line.
