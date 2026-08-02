# LC-A report — 2026-08-02b (size & data diet)

Second LC-A increment today. Audit territory `A-T3` (bundled-asset inventory: fonts/images —
format, compression, necessity, dynamic-load candidates) swept this run;
`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane A ticked. Zero functional defects
found — this territory turned up one bundle-weight optimization, routed to the Lane A
optimization checklist (`A-O13`) per the audit/optimize split rather than fixed unattended this
run. No code changed in this PR; docs only.

## Method

Installed workspace deps (`pnpm install --frozen-lockfile`), built `@lynia/shared`, and ran a real
`pnpm exec expo export --platform android` so the asset inventory is grounded in the actual
Metro-resolved asset graph, not a guess from `require()` grep:

```
› Assets (26):
.../inter/400Regular/Inter_400Regular.ttf (342 kB)
.../inter/600SemiBold/Inter_600SemiBold.ttf (344 kB)
.../inter/700Bold/Inter_700Bold.ttf (344 kB)
.../@react-navigation/elements/.../back-icon-mask.png (653 B)
.../@react-navigation/elements/.../back-icon.png (4 variations | 152 B)
.../@react-navigation/elements/.../clear-icon.png (4 variations | 425 B)
.../@react-navigation/elements/.../close-icon.png (4 variations | 235 B)
.../@react-navigation/elements/.../search-icon.png (4 variations | 599 B)
.../expo-router/assets/error.png (469 B)
.../expo-router/assets/file.png (138 B)
.../expo-router/assets/forward.png (188 B)
.../expo-router/assets/pkg.png (364 B)
.../expo-router/assets/sitemap.png (465 B)
.../expo-router/assets/unmatched.png (4.75 kB)

› android bundles (1):
_expo/static/js/android/entry-....hbc (6.43 MB)
```

```
Android export total : 7.13 MiB (7,476,013 bytes) | budget 7.49 MiB | headroom 4.8% (373,987 B)
Hermes JS bundle      : 6.13 MiB (6,431,313 bytes) | budget 6.16 MiB | headroom 0.4% (23,687 B)
```

This is the authoritative bundled-asset list — anything not in it costs zero export/OTA bytes, no
matter what's sitting in `apps/mobile/assets/` or a dependency's `node_modules` tree.

## Confirmed clean — fonts already correctly scoped, no format/compression waste

The 3 Inter TTFs (`src/ui/fonts.ts`'s per-weight subpath imports, A-T1's fix) are the only
substantial app-content asset in the export. Checked whether the per-weight subpath `require()`
also drags in the sibling `.ttf.png` glyph-specimen preview image each weight directory ships
(`400Regular/Inter_400Regular.ttf.png`, 88.5 KB — a font-family sample image, not used at
runtime): it does not — each subpath's generated `index.js` is a single `require('./X.ttf')` line,
confirmed by reading the actual generated file, and the real `expo export` Assets list above shows
zero `.png` under any `inter/` path. No waste here.

## Confirmed clean — native-only launcher assets cost zero OTA/export bytes

`apps/mobile/assets/icon.png` (48 KB), `adaptive-icon.png` (16 KB), `splash-icon.png` (48 KB) are
referenced only from `app.config.ts`'s `icon`/`expo-splash-screen` plugin config — consumed by
`expo prebuild`/EAS build to bake native Android mipmap/drawable resources, never `require()`'d
from JS. Confirmed absent from the `expo export` asset list above. Their cost is a **native
binary** question (A-T5's unmeasured territory while EAS is dormant), not a [size]/OTA one — no
action from this territory.

## Confirmed clean — `packages/design`'s brand/rail assets never enter the mobile bundle

`packages/design/assets/` holds 9 brand PNGs/SVGs, 4 payment-rail icons (ecocash/innbucks/omari,
up to 140 KB for `innbucks.jpg`), 33 per-glyph icon SVGs, and 9 Play-listing handoff screenshots
(up to 268 KB each). None of it is a mobile-bundle risk: `apps/mobile/package.json` has no
`@lynia/design` dependency at all, and a repo-wide grep found zero `@lynia/design` imports
anywhere under `apps/mobile`. These assets serve the admin/web/marketing surfaces or are pure
design-system source files — out of Lane A's [size]/[data] scope for the mobile app.

## Confirmed clean — no dynamic-load candidate

The only thing that could theoretically move off the install bundle onto a lazy fetch is the font
weights, and that would be a regression, not a win: `useAppFonts()` gates the native splash
(B-T1's boot-path trace), so first paint already depends on the fonts being available with zero
network round-trips. Fetching them remotely would add a round-trip to the exact cold-boot path
the program's §2 budget ("cold boot interactive in ≤3 sequential round-trips") is trying to keep
short — the opposite of the desired outcome on a 300-600 ms RTT link.

## New finding — LC-A05 / A-O13: Inter TTFs ship unused glyph coverage

Each Inter TTF is Google Fonts' full static build — Latin, Latin Extended, Cyrillic, Greek,
Vietnamese-specific combining marks, etc. A repo-wide scan of every literal character actually
appearing in `apps/mobile/src/**/*.ts*` and `apps/mobile/app/**/*.ts*` found only 23 distinct
non-ASCII codepoints, all common punctuation/symbols (`§ ° · × ÷ – — • … → ⇒ − ≈ ≤ ≥ ─ ★ ♂ ✓ ✕`,
a ZWJ + variation-selector pair, and one emoji `🚴`) — zero non-Latin script anywhere in the UI
copy.

To turn that into real evidence rather than a guess, installed `fonttools`/`pyftsubset` and ran an
actual subset against each of the 3 shipped weights, using a deliberately generous keep-range
(Basic Latin + Latin-1 Supplement + Latin Extended-A + General Punctuation + Currency Symbols +
Arrows + Math Operators + Box Drawing + Misc Symbols + Dingbats + variation selectors + a broad
emoji block) — headroom well beyond the 23 codepoints actually found, to be conservative about a
change that would affect user-generated text (names, order notes, KYC fields), not just static UI
strings:

| Weight | Original | Subsetted | Reduction |
|---|---:|---:|---:|
| Inter_400Regular | 342,408 B | 118,960 B | 65.3% |
| Inter_600SemiBold | 343,632 B | 119,168 B | 65.3% |
| Inter_700Bold | 344,072 B | 119,260 B | 65.3% |
| **Total** | **1,030,112 B** | **357,388 B** | **−672,724 B (−65.3%)** |

That's ~657 KiB off the current 7.13 MiB export — a ~9% cut to install/first-OTA size, at zero
Hermes-line impact (fonts are a plain asset, not part of the `.hbc`).

**Why this is an optimization ticket, not a same-run fix:** the bar for a same-run defect fix is a
live bug; this is working-as-intended behavior that's simply not byte-optimal, exactly the
audit/optimize split the program charter draws. It also carries a real product-facing trade-off a
territory sweep shouldn't decide unilaterally — subsetting away non-Latin script glyphs means any
user-typed free text containing one (a foreign name, a pasted character, a KYC field) would render
a tofu box for that glyph instead of falling back gracefully, since Inter itself would no longer
have it (though the system font stack may still substitute depending on RN's fallback behavior,
which wasn't verified here). Appended as `A-O13`, ranked #3 — below `A-O11`/`A-O12` because those
shrink the Hermes bundle (a cost repaid on **every** OTA), while font bytes are effectively a
one-time install cost: `expo-updates` diffs OTA asset manifests by content hash and skips
re-downloading anything the device already has cached from install or a prior update, so a stable
font isn't repeatedly re-paid for the way Hermes bytecode is. Full rationale, effort caveats
(needs a subsetting build step + a codified safe-range regression check + explicit non-Latin-glyph
sign-off), and the emoji-is-probably-moot note (Inter carries no color-emoji glyphs; Android's
font-fallback chain already handles emoji via the system font regardless of what's in the app's
own TTF) are in the checklist entry itself.

## Ledger

- `LC-A05` added to `docs/KNOWN_BUGS.md` "Day-0 LC sweep" table, `OPEN → LC-A (A-O13)`.
- `A-O13` appended to the Lane A optimization checklist in
  `docs/plans/2026-08-01-low-connectivity-program.md` §5, inserted at position #3 (after
  `A-O11`/`A-O12`, before the pre-existing seeded `A-O1`) since it's net-new evidence from this run
  and the only other item on the list that shrinks a [size] budget line, not a [data]/round-trip
  one.

## Next firing

`A-T3` is ticked; Lane A's next firing takes the first remaining unchecked item — `A-T4` (wire-
bytes profile: trace every request+response of the customer order journey and one rider
steady-state hour, set the §2 session-data budgets from evidence).
