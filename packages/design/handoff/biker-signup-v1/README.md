# Handoff: LyniaGo biker sign-up (manual ID review)

**Date** 2026-11-12 · **Fidelity: high** · **Look:** First Run v2 shell, unchanged · **Replaces:** D-134 stop-gap (E1 list in sign-up mode, F3/F1 gating)

## 0. Files
- `design/Biker Sign-up.html`: every frame at 360×720, then 320×640 and font scale 1.3. `?screen=<ID>` opens one frame (`?screen=K5@320`, `?screen=K1-kb@fs13` for variants).
- `design/fr-kit.js`, `design/fr-copy.js`: First Run v2, copied untouched. `design/ks-states.js`: composition + the few new parts (§3). `design/ks-copy.js` = `copy.ts`.
- `screenshots/<ID>.png`: 1× render of every frame (68). Variants are `<ID>-320.png` and `<ID>-fs13.png`. `screenshots/index.html` is a contact sheet.
- No new tokens.

## 1. Flow
Pattern: the standard hosted ID-check sequence (intro with the step list → one capture per screen with a guide, live camera hint and a confirm-preview → review all → submit → status), built entirely from First Run v2 parts.

```
R1 Account card ─Start─▶ K0 5 steps
  ▶ 1 K1 ID number ─Next─▶ 2 K2 ID card: guide ▶ camera|gallery ▶ preview ─Use─▶ sending ─(auto)─▶
  ▶ 3 K3-num licence number (same page as K1) ▶ 4 K3 licence photo (same as K2) ▶ 5 K4 selfie with ID (front camera)
  ▶ K5 Check & send ─Send for review─▶ K6 Sent ─Done─▶ B-wait (F1)
                                                         ├─ approved ▶ R3 ▶ X1 photo ▶ X2 plate ▶ P1 permissions
                                                         └─ declined ▶ B-decl-* ▶ K-redo (only that step) ▶ K5-redo ─Send again─▶ K6
✕ anywhere ▶ board = K0 (nothing sent) / B-todo-half (resumes at the saved step)
```

## 2. Frames
| ID | State | What changed |
|---|---|---|
| R1 | Account "Earn with your bike" | Body now "Five quick steps. About 2 minutes." Start → K0 |
| K0 | What you'll need | New. F-shell, hero 168, the 5 steps as a compact list card (48 rows, not tappable), privacy line. Kept: the biker needs to fetch the licence *before* the camera opens. **Also the board's not-started state** (one screen, not two) |
| K1 / -kb / -done / -err-kb / -dup | ID number | New page, one field, 20/600 tabular. Dash auto-inserted after 2 digits; uppercase. Validate on Next (regex from D5). Hero hides with the keyboard up; CTA rides above the keyboard. Value stays visible on return (-done). 409 → -dup: CTA WhatsApp, link "Change number" |
| K3-num / -kb / -done / -err-kb / -dup | Licence number (step 3) | **New (owner, 2026-11-12): typed, like the ID number.** Same page and field as K1. Uppercase letters and digits, spaces stripped; validate 5–12 characters on Next (**confirm the real format with ops**). Error "Check the number on your licence". 409 → one-licence-one-account refusal with WhatsApp. **No expiry field**: ops read it off the photo |
| K2-guide | ID card guide | Replaces the E2a sheet. Guide line + 3 tips, CTA "Take photo", link "Choose from gallery" (always) |
| K2-cam / -cam-hint | Camera | Dark capture guide with a card frame (ID-1 ratio). Dashed white = searching, solid green + "Hold still" = ready. One live hint at a time ("Move closer", "Too dark…"). **Shutter is always live** (fixes the dead shutter in the field photo); auto-capture is a bonus, never required |
| K2-prev | Preview | "Can you read it?" Use photo / Retake |
| K2-up | Sending | Title "Sending your photo", bar under the photo, disabled CTA "Sending… 62%". Auto-advances to the next step at 100% |
| K2-fail | Send failed | Danger info box under the kept photo. Try again / Retake |
| K-blocked | Camera denied for good | Danger hero + 3 steps. Re-read permission on AppState `active` (no Retry, per BRIEF 7). Gallery still offered |
| K3-guide…-fail / K4-* | Licence photo (step 4) / selfie (step 5) | Same frames as K2. Selfie: front camera, face oval + ID frame |
| K5 | Check & send | ID number and licence number in full with Edit; 3 thumbnails with Retake. Header label "Check", all 5 bars full |
| K5-replace | One retake uploading | That row shows a bar; Send disabled until done |
| K6 | Sent | Filled check disc, checklist "In review". **Done** → board. First place "In review" appears |
| B-wait | Board, waiting | F1 exactly as shipped |
| B-todo-half | Board, part done | Replaces F1/F3 as the to-do. 5-step list with Done / Next; CTA "Continue" resumes at the first open step |
| B-decl-photo / -licence / -selfie | Declined | Danger hero, reason, the 5 steps with only the bad ones in a danger-wash row ("Redo"). CTA names the fix |
| K-redo / K-redo-licence / K5-redo | Re-entry | Licence expired marks number **and** photo; K-redo-licence starts at the number, header "1 of 2 to fix". One fix: header "1 to fix", one bar. K5 marks the new item "New", CTA "Send again" |
| R3 | Approved | Unchanged R3 |
| X1 / X2 / -kb / -err-kb | Extras | Shown once after R3, each with "Skip for now". Never shown again, never blocks Go online. Plate keeps E4's regex and "Checking" behaviour |

## 3. Consistency rules
- **Hero height:** 168 on any page that also carries a list or chips (K0, guides, B-todo, B-decl, K-blocked); the shell's 232 on pure outcome pages (K6, B-wait, R3, X1, X2). Hidden whenever the keyboard is up.
- **Exit:** step pages (K1–K5) use the step header (Back + ✕). Board and outcome pages use the shell's floating ✕ only. Camera uses a 44 ✕ on dark.
- **Status words:** "Done" for steps the biker finished, "Next" for the step to resume, "OK" / "Redo" only after our team has looked (B-decl), "In review" only after Send.
- **Footer:** one 52 CTA; at most two 44 links under it (X1 is the only frame with two).
- **Photo actions:** "Retake" everywhere a sent photo can be replaced; "Edit" only for the typed ID number.

## 4. New parts (built from existing tokens)
- **Step header**: 56 tall, 24 below the status bar. 44 back (`#F6F7F8`) · N bars 6dp radius 3 gap 4 (`#00B14F` done/current, `#E2E6EA` open) · label 14/600 muted "2 of 4" · 44 ✕. Back = previous step; ✕ = save and go to board. Required steps only (5).
- **Step hero**: the shell hero at 168 (124 at 320, 136 at fs 1.3).
- **Card frame / face frame** (camera): 3dp border, `rgba(255,255,255,.7)` dashed or `#00B14F` solid, radius 16. Hint pill: 36 min, `rgba(255,255,255,.14)`, green fill when ready. Gallery pill 44 bottom-left, shutter 76 centre, ✕ 44.
- **Thumbnail**: 52×40, radius 6 (tag radius), striped placeholder.
- **Keyboard**: drawn at 300 (270 at 320) per the brief, instead of fr-kit's 236.

## 5. State
`signup: {step: 1..5|'check', idNumber?, licenceNumber?, photos: {idFront, licence, selfie}: {localUri, status: 'none'|'sending'|'sent'|'failed', pct}}`, persisted (AsyncStorage) on every change; photos stay in app storage until the server confirms. Server: `kycStatus` adds `todo` (nothing sent) and `declined{fields: ['idFront'|'licenceNumber'|'licence'|'selfie']}`. `todo` → B-todo; `submitted|manual_review` → B-wait.

## 6. Open
- Licence number format (Zimbabwe): the design accepts 5–12 letters/digits until ops confirm a pattern. Check for duplicates server-side like the ID (409).
- This reverses the brief's "never ask for the licence number by hand" at the owner's request; expiry is still not asked.
- Confirm the decline payload can name the field(s), not just a reason string.
- `rgba(255,255,255,.14)` hint pill and `.12` buttons on dark come from E2b chips; no new token.
