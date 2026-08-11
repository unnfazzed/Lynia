# Phase 6 — Merchant tablet alignment (RM.login + gated-route assessment)

Pixel-parity (structure-first) alignment of the merchant **tablet** login against its current gallery
mock, plus a read-only structural assessment of the three gated routes (queue / menu / shop) that the
offline parity harness cannot shoot. Merchant is a **Next.js** app rendered via Playwright on a
running `next dev` server (`tools/parity/serve-web.mjs merchant`, :4312), not react-native-web — the
web parity lane (`docs/SCREENSHOT-LANE.md` → "Web app side"). The gallery/mock wins over any code
comment.

- **Side-by-side:** `tools/parity/out/phase6_merchant.png`
  (`cd tools/parity && node serve-web.mjs merchant &` then
  `node pair.mjs --keys "RM.login" --out out/phase6_merchant` → prints `RM.login: mock ok · app ok`).
- **Result:** `pnpm --filter @lynia/merchant typecheck` clean, `lint` (oxlint) clean,
  `test` **182/182** pass.

Layout/type/colour only. No auth logic changed — `requestOtp`/`verifyOtp`, the AudioContext-arming
`getAlarmController().arm()` on sign-in (D-05), the CWE-601 `next`-redirect guard, the step machine,
the focus-management effect, and the `code`/`phone` state all preserved verbatim.

**The web parity lane rendered successfully — this validates the lane end-to-end for the merchant
surface** (mock served hermetically from the design mirror; app screenshotted from a live `next dev`
server at the 1024×680 tablet viewport). It confirms `docs/SCREENSHOT-LANE.md`'s merchant path works
in this container.

---

## The beat the harness can shoot (honest, not faked)

`RM.login` is a **frozen OTP (code) step**: it draws the six-box code entry with four digits filled,
the alarm notice, and the "Sign in & start the alarm" button. The app's `/login` is a **two-step**
machine (phone → code); the offline harness only navigates to `/login` and cannot submit a phone
number (the API is down offline, so `requestOtp` never advances the step). **The parity picture
therefore pairs the mock's code step against the app's default phone step** — an inherent
beat/harness difference, the same class as Phase 5's `kyc_intro`-vs-`become.tsx` pairing. The two
steps share the aligned card chrome (card, lockup, title, primary button), which is what the picture
verifies; the code step's segmented boxes are code-verified and would be picture-verified against a
seeded/interactive follow-up.

---

## RM.login → `apps/merchant/app/login/page.tsx` (the aligned target)

| # | Mock rule (`r-merchant.jsx` `RM.login`, lines 80-100) | File change that satisfies it |
|---|---|---|
| 1 | Lockup = `Dove size=32 on="white"` + **`Wordmark size=22`** — Fredoka 600, `"Lynia"` ink + `"Go"` in `--accent-700` | The dove keeps the real brand master `/brand/lyniago-mark.svg` (the asset `Dove` is derived from — equivalent, and the shipped convention). The **wordmark** was a plain Inter-800 single-colour `<span>`; now renders `font-family: var(--font-wordmark)` (Fredoka 600) with `"Go"` in `var(--accent-700)`, exactly like the DS `Wordmark`. Required three new merchant tokens/assets (below). **Visible in the picture — matches the mock.** |
| 2 | Card `width 420, padding 28`, radius-card, shadow-card | Unchanged — already `width: 420, padding: 28, borderRadius: 16, boxShadow: var(--shadow-card)`. |
| 3 | Title `"Kitchen sign-in"` 22/800 | Unchanged — already 22/800, copy verbatim. |
| 4 | Code = **six 52×60 segmented boxes**, gap 8, radius 12, the **next-empty box** carrying the accent border, digits 26/700 tabular | Replaced the single letter-spaced `<input>` with six box cells (52×60, radius 12, `1.5px` border — accent on `i === min(code.length,5)`, else `--line`, `fontVariantNumeric: tabular-nums`) under a **transparent full-cover `<input>`** that captures typing and focus. The `code` state, the `\D`-strip `onChange`, `maxLength={6}`, `inputMode="numeric"`, `inputRef` focus, and `submitCode` are all unchanged — the boxes are only the input's view. (Not in the default shot — appears after a phone submit.) |
| 5 | Alarm notice: `volume-2` accent-text 17 + copy, accent-wash, radius 12, `marginBottom 4` | Copy + layout already matched; corrected `marginBottom` 14 → **4** (the mock's drawn value). |
| 6 | `Button label="Sign in & start the alarm"` — `--target-primary` pill, `--text-body-lg`/semibold | Unchanged — the app's primary is a 52px `--radius-button` pill, 16/600, `--cta-fill`, white label. Copy verbatim. |

### Supporting token/asset additions (`apps/merchant/app/globals.css` + `public/fonts/`)

The merchant app shipped **Inter-only** and had no wordmark face or `--accent-700` (admin renders the
same plain-Inter wordmark). To render the wordmark the design source-of-truth mandates
(`packages/design/readme.md`, `2026-07-27-merchant-design-brief.md`: "the wordmark is 'LyniaGo' in
Fredoka 600 ('Go' in `--accent-700`)"), added — mirroring `packages/design/tokens/*.css` values:

- `--accent-700: #009d3b` (from `tokens/colors.css`).
- `--font-wordmark: "Fredoka", "Baloo 2", "Trebuchet MS", var(--font-sans)` (from `tokens/typography.css`).
- `@font-face Fredoka 600` → `/fonts/fredoka-600.woff2`, copied from
  `packages/design/assets/fonts/fredoka-600.woff2` (the self-hosted face `tokens/fonts.css` names).

No test asserted the old login structure (the merchant suite's "login" hits are redirect-path tests in
`hours`/`menu`/`shop`/`merchant-access`, unrelated to the login DOM). Nothing to update.

**Honest deviations (not faked):**
- **The dove is the brand master SVG, not the inline DS `Dove` polygon.** `lyniago-mark.svg` is the
  master the `Dove` component is derived from (`packages/design/readme.md`) and is the shipped
  convention in both web apps; it renders the same green paper dove. Kept rather than inlining a
  lookalike polygon. Candidate for `docs/DESIGN-DEVIATIONS.md` if a byte-exact dove is ever required.
- **A phone-entry step precedes the code step (the mock draws only the code step).** You must enter a
  phone to receive a code; that step is undrawn-but-necessary chrome, and it is the app's default
  landing (what the offline picture shows). Not a divergence in the drawn beat — a superset the mock
  omits.

---

## Gated routes (queue / menu / shop) — assessed, flagged for a seeded shoot

Per `docs/SCREENSHOT-LANE.md`, **only `/login` renders in the offline harness.** The gated routes
(`/queue`, `/menu`, `/shop`, plus `/hours`, `/setup`, `/statement`) client-redirect to sign-in
without a seeded `PARITY_MERCHANT_URL`: `lib/web.mjs` can present a dummy session cookie to reach the
shell, but their data comes from API calls that 401 offline, so they paint an empty shell, not the
populated mock states (`queue_board`, `catalog`, `shop`, …). **They cannot be honestly shot in this
container** and are left ⬜ in the tracker with a seeded-instance note. To shoot them: point
`PARITY_MERCHANT_URL` at a seeded instance and add their `app-targets.mjs` entries.

**Read-only structural check against `docs/plans/2026-07-27-merchant-design-brief.md` (§4B) + the RM
mocks — no edits made** (the routes are gated + unshootable, so speculative structural edits couldn't
be visually validated; anything below is a follow-up for the seeded pass):

- **`/queue` (`(app)/queue/page.tsx`, 161 lines)** — structurally built to the mock and cites it
  (M1·1 grammar: `Orders` heading + kitchen-name sub, `r-merchant.jsx:148`). Renders loading /
  not-a-merchant / error / ready via `QueueBoard`; wires the D-05 alarm loop (rings while any order is
  `awaiting_accept`), the §3 reconnect/backfill banner, the auto-retry-on-reachability, and the
  "Play the alarm to test it" ghost. No obvious structural gap from the brief's queue requirements;
  the takeover/board/list live in `components/queue/QueueBoard`, unassessed here (needs the seeded
  shot to compare `queue_new`/`queue_board` geometry).
- **`/menu` (`(app)/menu/page.tsx`, 374 lines)** — the M5 catalog: category/dish grouping
  (`menu-groups`), the `CategoryEditorSheet` / `DishEditorSheet` / `OosSheet` sheet family, loading /
  error / ready states. Matches the mock's IA (grouped-by-category catalog + editor sheets). Geometry
  parity (`catalog`, `category_manage`, `item_edit`, `oos_sheet`) needs the seeded shot.
- **`/shop` (`(app)/shop/page.tsx`, 383 lines)** — the M6 shop front: name/description, banner/logo
  `PhotoPicker` (250 KiB budget mirroring the API), and the "How riders pay you" cash-rule cards that
  quote `r-merchant.jsx:816-838` (M5·4) verbatim. Matches the mock's IA. Banner-crop / upload states
  (`shop_crop`, `shop_upload*`) need the seeded shot.

All three carry explicit mock line-references in-code and read as genuine structural builds, not
copy-only stubs — but that is a **read**, not a verified pixel match. The pixel verdict for every
gated screen waits on a seeded `PARITY_MERCHANT_URL` render.
