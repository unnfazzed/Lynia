# EXPORT-CHANGELOG — since the 2026-08-10 (rev 1) export

Baseline: the 2026-08-10 rev 1 export, anchored on `explorations/journey/All Screens Gallery.html`
(md5 `8e9c6238…`). This export: **2026-08-10 · rev 2** — the commissioned alignment work. Complete
listing; any file not named here is byte-identical to rev 1.

## 1 · ADDED — the shipped-states wave (SH·), 31 new screens

New registry files (screens append at gallery band ends only — **no pre-existing badge moved**):
- `explorations/journey/screens-shipped.jsx` (extends LJ)
- `explorations/journey/rider-screens-shipped.jsx` (extends RJM)
- `explorations/restaurants/r-merchant-shipped.jsx` (extends RM)
- `ui_kits/mobile/shipped-states.html` — handoff sheet (SH1–SH12): trigger/logic/CTA +
  normal/loading/error/empty coverage per state, 320⇄360 toggle, merchant slates.

Customer (LJ) — gallery badge · registry id:
- C1·11 `onboard_flag_off` — Onboarding · food off
- C1·12 `role_select_flag_off` — Choose your role · food off
- C2·4 `home_flag_off` — Home · Food tile soon
- C2·5 `order_restore` — Cold start · order running
- C2·6 `stale_cache` — Orders · saved copy
- C3·12 `draft_restored` — Draft restored
- C3·13 `addr_unavailable` — Address search down (pin fallback named honestly)
- C3·14 `map_failed` — Map didn't load
- C3·15 `loc_off` — Location off · composer
- C7·7 `rate_undo` — Rating sent · undo
- C8·7 `settings_perms` — Settings · real permissions (denied + ask-every-time)
- C8·8 `settings_perms_ok` — Settings · all granted
- C8·9 `privacy` — Privacy
- C8·10 `delete_account` — Delete account (step 1)
- C8·11 `delete_final` — Delete · final confirm (30-day grace)
- C8·12 `phone_masked` — Order ended · numbers masked
- C10·39 `conn_reconnecting` — Reconnecting banner
- C10·40 `stale_cache_empty` — Offline · nothing saved
- C10·41 `order_restore_error` — Restore failed
- C10·42 `draft_discard` — Discard draft · confirm

Rider (RJM):
- R3·5 `board_food_off` — Jobs · food dispatch off (flag-OFF board copy)
- R3·6 `board_empty_food_off` — Food off · nothing in range
- R5·19 `pickup_photo` — Proof of pickup · capture
- R5·20 `pickup_photo_preview` — Proof of pickup · preview
- R7·6 `strikes` — Reliability · strikes
- R9·31 `pickup_photo_failed` — Proof photo · upload failed (non-blocking)
- R9·32 `strikes_final` — One strike from a pause
(Flag-ON board = existing R3·2 `board`, unchanged — referenced on the sheet as SH8·1.)

Merchant (RM; RV = Restaurants Vertical badge):
- M3·10 `item_out` (RV M2·8) — Don't have an item (per-item control + live re-total)
- M3·11 `item_out_wait` (RV M2·9) — New total · customer confirming
- M4·9 `pickup_reveal` (RV M3·5) — Pickup code · hidden
- M4·10 `pickup_revealed` (RV M3·6) — Pickup code · revealed

Files edited to register the additions (append-only in each):
`explorations/journey/gallery-map.js` (tiles + header note) ·
`explorations/journey/All Screens Gallery.html` (3 script tags) ·
`explorations/restaurants/r-gallery-data.js` (M2·8/9, M3·5/6) ·
`explorations/restaurants/Restaurants Vertical.html` (1 script tag).

## 2 · CHANGED — WhatsApp → SMS OTP, per screen ID

- LJ `login` (C1·5): sub "We'll SMS a one-time code to this number." — `screens.jsx`
- LJ `otp` (C1·6, title now **SMS OTP**): heading "Check your messages", sub "…by SMS", hint
  "SMS can take a minute on a busy network." — `screens.jsx`
- LJ `register` (C1·8): phone hint "Verified by SMS ✓" — `screens.jsx`
- LJ `otp_cooldown` / `otp_resent` / `otp_locked` (C10·31–33 = safety-flows C·1–C·3): heading, sub,
  and "fresh code … check your messages" strip — `screens-safety.jsx`; sheet lead in
  `safety-flows.html`
- RJ `login` (R1·3) + RJ `otp` (R1·4, title now **SMS OTP**) — `rider-screens.jsx`
- Interactive kit login/OTP/registration states — `ui_kits/mobile/app.js` (4 strings)
- Labels/descriptions: `gallery-map.js` (2 titles), `map.jsx` (node 0·4 + band lead),
  `rider-map.jsx` (node 0·4), `ui_kits/mobile/README.md` (2), `ui_kits/mobile/index.html`
  (@dsCard subtitle), `COVERAGE.md` (1 row)
- Deliberately NOT changed: help/support routes to WhatsApp (a real product decision, not OTP);
  historical audit/review docs (record).

## 3 · CHANGED — defect fixes

- `tokens/colors.css`: `--action-primary` now `var(--cta-fill)` (was `var(--accent)`, contradicting
  Button). `--action-primary-pressed` left as-is (flagged in EXPORT-README §3).
- Same-origin `postMessage` guard (with "null"/file:// opaque-origin allowance): `support.js`,
  `templates/app-screen/support.js`, `templates/gate-state/support.js`, `templates/top-up/support.js`,
  `templates/wallet/support.js`, `ui_kits/admin/shell.js`, `handoff/google-play/src/tweaks-panel.jsx`.
- `explorations/store/play-export.jsx`: regex precedence `/^(cover|banner|dish|photo)$/i`.
- Stepper done node: **untouched**, per instruction.

## 4 · CHANGED — export documents

`EXPORT-README.md`, `EXPORT-MANIFEST.txt`, `EXPORT-CHANGELOG.md` rewritten for rev 2.

## 5 · REMOVED

Nothing. No screen, badge or id renamed, renumbered or reordered.

## 6 · Omitted from the archive (per request)

`uploads/`, `scraps/`, `store-assets/` (byte-identical copy already at your repo root).

## 7 · Generated files — may differ byte-wise without design meaning

`_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json`, `.thumbnail` files. In this
export the bundle predates the rev-2 source edits by one compile cycle (see EXPORT-README, last
section); authored sources are the truth. Diff screens, not these.
