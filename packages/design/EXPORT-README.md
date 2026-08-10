# LyniaGo Design System — Export README

Export date: **2026-08-10**
Baseline for diffing: the **2026-08-05** export (`All Screens Gallery.html` md5 `8e9c6238…`).

This export is the **complete current state of the project** — every file, byte-identical to what
the design tool holds. Nothing was regenerated, reformatted, prettified, or "fixed" during export.
No design edits were made as part of this export (the WhatsApp-OTP wording is intentionally
untouched; the SMS substitution stays app-side in the deviations ledger). Verified: the current
`explorations/journey/All Screens Gallery.html` fingerprints to
`md5 8e9c62380c72af325dcf538f88fd5cd3` — **identical to the 2026-08-05 baseline**.

File-by-file sizes + SHA-256 and the full screen inventory: **`EXPORT-MANIFEST.txt`**.
What changed since 2026-08-05: **`EXPORT-CHANGELOG.md`** (short answer: nothing designed changed).

## Authority rules

1. **LOOK authority — `explorations/journey/All Screens Gallery.html`.**
   Every current screen for customer, rider and merchant, in journey order, rendered live from the
   design system. The standing rule (from `handoff/update-2026-07/README.md`): *if a screen is in
   the gallery it is current; if a screen is not in the gallery, it was retired.* Registry sources:
   `screens.jsx` (LJ), `screens-safety.jsx` (LJ safety), `rider-screens.jsx` (RJ),
   `rider-screens-wallet.jsx` / `rider-screens-safety.jsx` (RJ), `rider-one-app.jsx` (RJM),
   `../restaurants/r-customer-*.jsx` (RC), `r-rider.jsx` (RR), `r-merchant.jsx` (RM); band/badge
   map in `gallery-map.js` + `../restaurants/r-gallery-data.js`.
2. **INTERACTION authority — the `ui_kits/` interactive kits.**
   `ui_kits/mobile/` (sheet peek/expand snaps, tap-to-pin, auction stream, OTP entry, demo chips),
   `ui_kits/admin/` (modals, reason codes, states), `ui_kits/support/`. Where a kit and the gallery
   disagree on *appearance or IA*, the gallery wins (see intentional disagreements below).
3. **VALUE authority — `tokens/*.css`** (entry point `styles.css`). Never hardcode a value a token
   defines. `handoff/design-tokens.ts` mirrors them for the repo.
4. **Decision authority** for restaurants numbers/models: `RESTAURANTS-DECISIONS.md`; rider IA:
   `RIDER-ONE-APP-PLAN.md`; safety numbers (999, +263 77 883 1938, tel: support): `HANDOFF.md` +
   `ui_kits/mobile/safety-flows.html`.

### Intentional gallery ⇄ kit disagreements (gallery wins for LOOK)

- **Rider IA.** The interactive kit (`ui_kits/mobile/app.js`) still runs the pre-July rider flow
  (own board, wallet/top-up reached the old way). The merged one-app rider — Jobs · Money · Account
  tab bar, one tagged board, Money tab, top-up gate — is the current design (RJM screens in the
  gallery, built in `rider-one-app.jsx`). Align rider look/IA to RJM; the kit remains interaction
  authority for the mechanics both share (offer compose, job advance, OTP hand-off, gates).
- **2026 journey-review customer screens** (`ui_kits/mobile/new-flows.html`: address search, pin
  confirm, disclaimer, counter-offer, rider-cancelled re-broadcast, undelivered terminal, Maps
  route-sync) are designed but **not wired** into the interactive kit — the design sheets win.
- **`ui_kits/admin/cash.html`** shows the retired weekly-15% settlement model. Live model is
  prepaid, per-delivery, 0%→10% (see `RESTAURANTS-DECISIONS.md` R-10 area + update-2026-07 README).
  Keep the page's *visual* language; do not align business logic to it.
- **WhatsApp OTP wording** everywhere is intentional-known-deviation vs the shipped SMS app.

## Canonical design viewports

- **Phone registries (LJ, RC, RJ, RJM, RR — customer + rider):** designed at **360 × 720** logical
  px, with the mandatory **320 × 640 entry-phone variant** (design rule: 320-first, verify at 360;
  the mobile kit's `320 · entry phone` toggle renders it exactly).
- **Merchant tablet (RM):** **1024 × 680** (gallery `TabletFrame` renders 1024×680 scaled ×0.52).
- **Admin console:** fluid desktop pages, content column `max-width: 1180px` + sidebar — screenshot
  at **1440 × 900** (gallery thumbnails are 1280×800 ×0.375, presentation only).
- **Frame chrome in the sheets** (outer, includes the black bezel border):
  All Screens Gallery phone tiles 300×600 (tall screens 720; display 780; 7px bezel) — a
  presentation size of the same 360-designed fluid screens;
  `new-flows.html` / `safety-flows.html` phones 336×640 (8px bezel);
  `ui_kits/support` frames 300×620 (9px bezel);
  `ui_kits/mobile` runs the real 360×720 / 320×640 frame.
  For pixel parity against the app, use the 360/320 kit sizes; gallery/sheet frames are for
  look parity at tile size.

## Deprecated / superseded — never align to these

**Retired screens** (listed in the `gallery-map.js` header): `LJ home_launcher` (the Food home IS
the app home — RC `home`); `RJ rider_offline`, `online_empty`, `board` (→ RJM board);
`RJ offer_compose` (→ RJM `offer_parcel`); `RJ earnings`, `earnings_new` (weekly-settlement model
retired); `RJ wallet` (→ RJM `money`); `RJ profile` (→ RJM `account`); `RJ gate_commission`
(→ RJM `gate_topup`).

**Superseded files** (kept as record): `explorations/Wallet Journey.html`,
`WALLET-HANDOFF-README.md`, `handoff/WALLET-CLAUDE-CODE-PROMPT.md` (wallet rules hold, but the
wallet UI now lives inside the rider Money tab); `handoff/CLAUDE-CODE-PROMPT.md` (the 2026-07-04
refresh — done; superseded by `handoff/update-2026-07/`); `ui_kits/admin/cash.html` business model
(above).

**Not parity targets at all:** `explorations/LyniaGo Paper Dove.html` + `LyniaGo Dove Cross.html`
(brand design record), `explorations/store/` + `store-assets/` + `handoff/google-play/` (Play-Store
marketing assets), `scraps/` and `uploads/` (working material), `guidelines/*.card.html` +
`components/*.card.html` (design-tab specimen cards), `templates/` (authoring scaffolds),
`thumbnail.html` / `.thumbnail` (tool tiles).

## Offline rendering — read before headless screenshotting

All **fonts, icons and images are bundled** with relative paths (`assets/fonts/*.woff2`,
`assets/lynia-icons.js`, `assets/icons/`, food photos in `explorations/store/_food/`). However,
the React-based pages were authored against **pinned CDN scripts and were NOT rewritten for this
export** — rewriting them would have broken rule 1 (byte-identity with the 2026-08-05 baseline,
which contained the same references). A plain Chromium with **no network will not render those
frames** as-is. The exact per-file audit is in `EXPORT-MANIFEST.txt` → EXTERNAL URL AUDIT. Hosts:

- `unpkg.com` — pinned `react@18.3.1`, `react-dom@18.3.1`, `@babel/standalone@7.29.0` (all
  SRI-locked), plus `leaflet@1.9.4` on the two galleries with real Harare maps.
- `tile.openstreetmap.org` — live map tiles on those same real-map frames (the tiles are runtime
  imagery, not design; the kits' `FauxMap` frames are fully local).
- `fonts.googleapis.com` — only in the two brand-record explorations (`LyniaGo Paper Dove.html`,
  `LyniaGo Dove Cross.html`), which are not parity targets; all product surfaces use the
  self-hosted fonts in `assets/fonts/`.
- `maps.google.com` (deep-link URLs in copy, never fetched) and `unsplash.com` /`github.com`
  (comments & doc links) appear in the audit but are not render dependencies.

For the parity pipeline, either allow those two hosts, or serve a local mirror / request-intercept
mapping `unpkg.com/...` to vendored copies. If you want a **vendored offline variant** of this
export (local react/babel/leaflet + rewritten script tags, as a separate clearly-diffable change),
ask — it was deliberately not done inside this export.

`_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` are **generated** by the design
tooling (the kits load the bundle for previews); they're included for completeness and may be
regenerated between exports without design meaning — diff screens, not these.
