# LyniaGo Design System — Export README

Export date: **2026-08-10 · rev 2** (second export of 2026-08-10).
Baseline for diffing: the **2026-08-10 (rev 1)** export (`All Screens Gallery.html` md5 `8e9c6238…`).

Unlike rev 1 (a pure snapshot), this export **contains commissioned design work**: the shipped-states
alignment wave (SH·), the WhatsApp→SMS OTP substitution, and three code-defect fixes. Everything
added or changed is listed **per screen ID** in `EXPORT-CHANGELOG.md`; every file not named there is
byte-identical to rev 1 — nothing was regenerated, reformatted or prettified during export.

File-by-file sizes + SHA-256 and the full screen inventory: **`EXPORT-MANIFEST.txt`**.

## Authority rules

1. **LOOK authority — `explorations/journey/All Screens Gallery.html`.**
   Every current screen for customer, rider and merchant, in journey order, rendered live from the
   design system. The standing rule (from `handoff/update-2026-07/README.md`): *if a screen is in
   the gallery it is current; if a screen is not in the gallery, it was retired.* Registry sources:
   `screens.jsx` (LJ), `screens-safety.jsx` (LJ safety), `screens-shipped.jsx` (LJ shipped-states,
   NEW), `rider-screens.jsx` (RJ), `rider-screens-wallet.jsx` / `rider-screens-safety.jsx` (RJ),
   `rider-one-app.jsx` (RJM), `rider-screens-shipped.jsx` (RJM shipped-states, NEW),
   `../restaurants/r-customer-*.jsx` (RC), `r-rider.jsx` (RR), `r-merchant.jsx` +
   `r-merchant-shipped.jsx` (RM); band/badge map in `gallery-map.js` + `../restaurants/r-gallery-data.js`.
   The 2026-08 additions were **appended at band ends only**, so no pre-existing generated badge
   (C·, R·, M·) moved.
2. **INTERACTION authority — the `ui_kits/` interactive kits.**
   `ui_kits/mobile/` (sheet peek/expand snaps, tap-to-pin, auction stream, OTP entry, demo chips),
   `ui_kits/admin/` (modals, reason codes, states), `ui_kits/support/`. Where a kit and the gallery
   disagree on *appearance or IA*, the gallery wins (see intentional disagreements below).
   **`ui_kits/mobile/shipped-states.html` (NEW)** is the handoff sheet for the SH· wave: per-state
   trigger/logic/CTA notes, the normal/loading/error/empty coverage, and a 320⇄360 width toggle.
3. **VALUE authority — `tokens/*.css`** (entry point `styles.css`). Never hardcode a value a token
   defines. `handoff/design-tokens.ts` mirrors them for the repo. NOTE rev 2 fixes the semantic
   alias `--action-primary` → `var(--cta-fill)` (it pointed at `--accent`, contradicting the shipped
   Button). `--action-primary-pressed` still points at `--accent-700`; the component paints
   `--cta-fill-pressed` — flagged, deliberately left untouched pending your call.
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
- **The SH· shipped states** (this wave) are likewise designed but **not wired** into the
  interactive kit's state machine — `shipped-states.html` + the gallery win.
- **`ui_kits/admin/cash.html`** shows the retired weekly-15% settlement model. Live model is
  prepaid, per-delivery, 0%→10% (see `RESTAURANTS-DECISIONS.md` R-10 area + update-2026-07 README).
  Keep the page's *visual* language; do not align business logic to it.
- **WhatsApp OTP — RESOLVED in rev 2.** Every OTP surface (LJ/RJ otp, the C·1–C·3 resend states,
  the mobile kit, labels and maps) now says **SMS**; the app-side deviation ledger entry can be
  closed. Historical review docs (audits, DESIGN-IMPROVEMENTS) keep their original WhatsApp wording
  as record — they are not parity targets.

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
  `shipped-states.html` phones 336×640 (8px bezel, i.e. the **320 entry width**) with an on-sheet
  toggle to 376×736 (the 360 designed width); its merchant slates render 1024×680 scaled ×0.508;
  `ui_kits/support` frames 300×620 (9px bezel);
  `ui_kits/mobile` runs the real 360×720 / 320×640 frame.
  For pixel parity against the app, use the 360/320 kit sizes; gallery/sheet frames are for
  look parity at tile size.

## Deprecated / superseded — never align to these

**Retired screens** (listed in the `gallery-map.js` header): `LJ home_launcher` (the Food home IS
the app home — RC `home`); `RJ rider_offline`, `online_empty`, `board` (→ RJM board);
`RJ offer_compose` (→ RJM `offer_parcel`); `RJ earnings`, `earnings_new` (weekly-settlement model
retired); `RJ wallet` (→ RJM `money`); `RJ profile` (→ RJM `account`); `RJ gate_commission`
(→ RJM `gate_topup`). Unchanged in rev 2.

**Superseded files** (kept as record): `explorations/Wallet Journey.html`,
`WALLET-HANDOFF-README.md`, `handoff/WALLET-CLAUDE-CODE-PROMPT.md` (wallet rules hold, but the
wallet UI now lives inside the rider Money tab); `handoff/CLAUDE-CODE-PROMPT.md` (the 2026-07-04
refresh — done; superseded by `handoff/update-2026-07/`); `ui_kits/admin/cash.html` business model
(above).

**Not parity targets at all:** `explorations/LyniaGo Paper Dove.html` + `LyniaGo Dove Cross.html`
(brand design record), `explorations/store/` + `handoff/google-play/` (Play-Store marketing
assets), `guidelines/*.card.html` + `components/*.card.html` (design-tab specimen cards),
`templates/` (authoring scaffolds), `thumbnail.html` / `.thumbnail` (tool tiles). Historical
review/audit docs keep pre-SMS and pre-SH wording as record.

## Omitted from this export (deliberately)

- `uploads/` and `scraps/` — working material (per the standing handoff instruction).
- `store-assets/` — 14 MB, byte-identical to the copy already at your repo root.
Everything else mirrors the project layout exactly; drop the archive into `packages/design/` as-is.

## Offline rendering — read before headless screenshotting

All **fonts, icons and images are bundled** with relative paths (`assets/fonts/*.woff2`,
`assets/lynia-icons.js`, `assets/icons/`, food photos in `explorations/store/_food/`). The
React-based pages are authored against **pinned CDN scripts** (per your note: your pipeline can
reach unpkg and OSM tiles, so no vendored offline variant is included). Hosts:

- `unpkg.com` — pinned `react@18.3.1`, `react-dom@18.3.1`, `@babel/standalone@7.29.0` (all
  SRI-locked), plus `leaflet@1.9.4` on the two galleries with real Harare maps.
  `shipped-states.html` uses the same pinned react/babel set.
- `tile.openstreetmap.org` — live map tiles on those same real-map frames (the tiles are runtime
  imagery, not design; the kits' `FauxMap` frames are fully local).
- `fonts.googleapis.com` — only in the two brand-record explorations (`LyniaGo Paper Dove.html`,
  `LyniaGo Dove Cross.html`), which are not parity targets; all product surfaces use the
  self-hosted fonts in `assets/fonts/`.
- `maps.google.com` (deep-link URLs in copy, never fetched) and `unsplash.com` /`github.com`
  (comments & doc links) appear in the audit but are not render dependencies.

The exact per-file audit is in `EXPORT-MANIFEST.txt` → EXTERNAL URL AUDIT.

`_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json` are **generated** by the design
tooling (the kits load the bundle for previews); they're included for completeness and may be
regenerated between exports without design meaning — **diff screens, not these**. In this export
the bundle predates the rev-2 source edits by one compile cycle (its inlined preview copies of
e.g. `gallery-map.js` may still read "WhatsApp OTP"); the authored source files are the truth and
carry the SMS wording. Every page loads `gallery-map.js` etc. directly, so nothing renders stale.
