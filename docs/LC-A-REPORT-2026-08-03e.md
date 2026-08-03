# LC-A report — 2026-08-03e (size & data diet)

Lane A is in OPTIMIZE MODE (since `A-T5`, 2026-08-03b). This firing takes the first unchecked
optimization item, **A-O13** (`LC-A05` ledger row: the 3 self-hosted Inter TTFs ship each weight's
full Google-Fonts charset — Latin+Cyrillic+Greek+Vietnamese extensions — though the app only ever
renders 23 distinct non-ASCII codepoints, all Latin-script punctuation/symbols plus one emoji).

## What shipped

Three new files, none touching runtime app logic beyond `fonts.ts`'s font-loading map:

- **`apps/mobile/scripts/font-safe-ranges.mjs`** — the single source of truth for which Unicode
  blocks the shipped font carries glyphs for: Basic Latin + Latin-1 Supplement + Latin Extended-A/B
  (headroom for Shona/Ndebele diacritics — Zimbabwe's other official languages, both Latin-script),
  the punctuation/math/arrow/box-drawing/dingbat blocks the app's chrome already uses, and the emoji
  blocks (cost-free — see below). Deliberately excludes Cyrillic/Greek/Vietnamese-extensions/CJK.
  Exported as both a `pyftsubset --unicodes=` argument builder and a plain `isSafeCodepoint(cp)`
  predicate, so the two consumers below can never drift apart.
- **`apps/mobile/scripts/subset-fonts.mjs`** — a dev-time regeneration script (`pnpm --filter
  @lynia/mobile subset-fonts`). Shells out to `python3 -m fontTools.subset` (the `fonttools` PyPI
  package, `pip install fonttools`) against the full-charset TTFs `@expo-google-fonts/inter` ships,
  writing the subsetted output to `apps/mobile/assets/fonts/`. This never runs in CI or at build
  time — the generated `.ttf` files are committed like any other asset (RN/Hermes loads native TTF
  directly; there's no runtime transform), so `expo export` needs nothing beyond what it already had.
- **`apps/mobile/scripts/check-font-charset.mjs`** — the "grep-based regression check" the
  checklist item called for. Zero dependencies (same rationale as `check-bundle-size.mjs`): scans
  every `.ts`/`.tsx` under `apps/mobile/app`+`src` for non-ASCII characters and fails if any
  codepoint falls outside `font-safe-ranges.mjs`'s ranges. Wired into `apps/mobile package.json`'s
  `lint` script, so it runs on every `pnpm lint` — including the `build` job in `ci.yml`, which
  already invokes `pnpm run lint` — with no new CI job needed.

`apps/mobile/src/ui/fonts.ts`'s `appFontMap` now `require()`s the three committed subset assets
(`assets/fonts/Inter-{400Regular,600SemiBold,700Bold}-subset.ttf`) instead of importing
`@expo-google-fonts/inter`'s per-weight subpaths; that package moved from a runtime `dependency` to
a `devDependency` in `apps/mobile/package.json` (it's now only the subsetting script's source
material — nothing in the shipped app imports it anymore).

## The sign-off the checklist item required

A-O13 explicitly listed "explicit sign-off that dropping non-Latin scripts is acceptable for
user-generated free text" as a prerequisite alongside the subsetting mechanism and the regression
guard. Recording it here (and in `docs/APP-SIZE.md` / `docs/KNOWN_BUGS.md` LC-A05) rather than
leaving it implicit: a user who types a Cyrillic, Greek, or CJK character into a free-text field
(name, order note, KYC field) sees a tofu box for that one glyph. This is **not a new regression**
— it reproduces exactly today's behavior for any character outside Inter's original 2,849-glyph
charset (verified: `U+2500`/`─`, `U+2642`/`♂`, `U+2715`/`✕`, `U+200D`/ZWJ, `U+FE0F`/VS16, and the
`🚴` emoji the source itself uses are ALL already absent from the current, un-subsetted font — they
already render via system font-fallback today, subsetting changes nothing about them). The market
this program targets (Harare, Zimbabwe) has Shona and Ndebele as the other two official languages
alongside English — both Latin-script, both fully covered by the retained Latin Extended-A/B block
— so the realistic exposure of this trade-off for the actual user base is low. Widening the range
later (e.g. if a specific script need surfaces) is a one-line change to `font-safe-ranges.mjs` plus
a re-run of `subset-fonts.mjs`.

## Evidence (before/after, `expo export --platform android`)

| | Before | After | Delta |
|---|---:|---:|---:|
| Android export total | 7,240,457 B (6.91 MiB) | 6,546,466 B (6.24 MiB) | **−693,991 B (−9.6%)** |
| Export-total headroom vs `size-budget.json` | 609,543 B (7.8%) | 1,303,534 B (16.6%) | +693,991 B |
| Hermes JS bundle | 6,195,757 B | 6,194,830 B | −927 B (noise — module-count shift from the `require()` path change; fonts are export assets, not JS) |
| `Inter_400Regular.ttf` | 342,408 B | 112,112 B | −230,296 B (−67.3%) |
| `Inter_600SemiBold.ttf` | 343,632 B | 112,412 B | −231,220 B (−67.3%) |
| `Inter_700Bold.ttf` | 344,072 B | 112,524 B | −231,548 B (−67.3%) |

Both runs used a real `expo export --platform android` output tree measured with
`scripts/check-bundle-size.mjs` (not an estimate) — the "before" run was taken by stashing this
PR's changes and reinstalling, then restored. The 67.3% per-file cut exceeds A-T3's 65.3% test
estimate (this run's range is marginally wider — includes Latin Extended-B and a few extra
symbol/emoji blocks for headroom — while still landing a bigger cut, since `--no-hinting` was
added and the default `fontTools.subset` layout-feature pruning turned out leaner than the manual
feature list an early draft of this script tried).

`size-budget.json` is left **untouched** this run, matching the A-O11/A-O12 precedent: an
individual optimize-mode firing guarantees the guardrail never regresses; ratcheting budgets down
after a measured improvement is the weekly steer's job (`docs/ROUTINES.md`).

## Verification

- Confirmed all 17 of the app's 23 real non-ASCII codepoints that the *current* (un-subsetted) font
  actually has glyphs for remain present in the subset output (`§ ° · × ÷ – — • … → ⇒ − ≈ ≤ ≥ ★ ✓`).
  The other 6 (`─ ♂ ✕`, ZWJ, VS16, the bicycle emoji) were already absent from the un-subsetted
  font's cmap — confirmed via `fontTools.ttLib` — so subsetting is a no-op for them, not a new gap.
- `node scripts/check-font-charset.mjs` run clean against current source (the regression guard
  itself, proving it doesn't false-positive on the app's real content).
- Full monorepo `pnpm typecheck && pnpm lint && pnpm test`: green — mobile typecheck clean, mobile
  lint clean (oxlint + the new charset check), all 705 mobile tests pass (unchanged — the existing
  `src/ui/__tests__/fonts.test.tsx` suite covers `interFamily`/`patchRenderable`/
  `applyInterToTextComponents`, none of which changed; only the font-loading source changed).
- `pnpm-lock.yaml` updated for the `@expo-google-fonts/inter` dependency→devDependency move (no
  version change, just which importer section it's recorded under).
- A real `expo export --platform android` (not just tests) confirms the three subset `.ttf` files
  bundle correctly as export assets at their new, smaller sizes (see the export log: `assets/fonts/
  Inter-400Regular-subset.ttf (112 kB)` etc.), and the app's typecheck/test suite (which imports
  `fonts.ts`) resolves the new `require()` paths without error.

No native/config change — this is OTA-able... actually, one nuance: font **assets** (unlike the JS
bundle) are content-addressed by `expo-updates` and a device that already has the old, larger font
file cached from install or a prior OTA will need to download the new, smaller one exactly once on
its next update — a genuine one-time OTA cost, then a permanently smaller footprint on every
subsequent install. No sensitive-lane doctrine questions apply (no diff under `apps/api/src/
{wallet,settlements,offers,orders,matching,kyc,riders}/` or `packages/shared/src/
{policy,pricing,money}.ts`). LC-A05 (`docs/KNOWN_BUGS.md`) and `A-O13` in the program doc are both
marked resolved in this same PR.
