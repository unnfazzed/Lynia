# Claude Code prompt: Download QR popup + iPhone install tip

Put this folder at `handoff/download-qr-install-tip-2026-10/` in the repo, then paste everything below the line into Claude Code at the repo root.

---

Build two things from `handoff/download-qr-install-tip-2026-10/README.md`. Read it fully first. `Download QR and Install Tip.html` is the visual reference (do not ship it). `copy.ts` holds every string, verbatim.

## Steps
1. **Read first:** README.md, copy.ts, the website `site/index.html`, and the customer app's Home screen plus whatever serves `app.lyniago.com`. Report: the three "Download the app" buttons you found, whether a `/download` redirect exists, and the Home file + web entry you'll touch. Wait for my OK.
2. **Website QR popup** (README §1):
   - Copy `site-assets/download-qr-2026-10.svg` to `site/assets/download-qr-2026-10.svg` (new filename, cache-busting).
   - Change the three buttons' `href="#app"` to `href="/download"` and add `data-download`. Change nothing else on the page: no CSS values, copy, classes or layout. The `#app` card stays identical.
   - Add the popup markup at the end of `<body>`, CSS in the existing `<style>`, and a small vanilla inline script. Open only when `(min-width: 900px) and (hover: hover) and (pointer: fine)`; otherwise let the link navigate.
   - Exact sizes and colours from §1. `role="dialog"`, `aria-modal`, focus to ✕, focus trap, Esc / scrim / ✕ close, return focus, body scroll lock, 160/200ms motion, reduced-motion = none.
3. **`/download` redirect** (README §3): if it's missing, add it where the site is hosted. Android → Google Play `zw.co.lynia`, iPhone/iPad → `https://app.lyniago.com/?install=1`, else → `https://lyniago.com/#app`. Ask me if the hosting setup is unclear.
4. **iPhone install tip** (README §2):
   - Add `src/…/installTipCopy.ts` from copy.ts (strings verbatim).
   - Add a `useInstallTip()` hook implementing the "When it shows" table exactly (iOS Safari only, standalone never, the `?install=1` gate, three localStorage keys, `history.replaceState` to strip the param, `APP_STORE_URL` config for the launched variant).
   - Build the `InstallTipSheet` (variants `default | small | launched`) and the `InstallPinRow` per §2.1–2.5, using existing tokens, `Text`, Lucide (`x`, `share`, `square-plus`, `check`, `bike`, `ellipsis`) and existing button components where they match (52 primary on `--cta-fill`, 44 icon buttons).
   - Mount both on Home only. The small variant is used when the window width < 360.
5. **Rules:** Inter 400/600/700 only; no white text under 24px on `#00B14F`; touch targets ≥ 44; no Apple/Google logos; no emoji; no dates. Don't alter the QR artwork.
6. **Verify:**
   - Website at 1280 and 1440: clicking each of the three buttons opens the popup; Esc, scrim and ✕ close it; Tab stays inside. At 390 and 768 the buttons navigate to `/download`. Diff the rest of the page against the current reference: nothing else changed.
   - App: render sheet default at 360×720, small at 320×640, launched, pin row, and installed (standalone, where nothing shows). Nothing clips; the sheet respects the bottom safe area.
   - Typecheck + lint. Report a checklist: README section → file → done, and remind me to test-scan the QR from the popup on a real Android and iPhone.
