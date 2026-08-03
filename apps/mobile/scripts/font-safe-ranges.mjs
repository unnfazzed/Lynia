// font-safe-ranges.mjs — the single source of truth for which Unicode blocks the self-hosted Inter
// subset (apps/mobile/assets/fonts/*.ttf) carries glyphs for.
//
// Shared by two scripts that must never drift apart:
//   - subset-fonts.mjs        generates the committed .ttf assets from these ranges (pyftsubset input)
//   - check-font-charset.mjs  fails CI if any non-ASCII character newly appears in app source OUTSIDE
//                             these ranges (a codepoint the shipped font can't render — the user
//                             would see a tofu box for it)
//
// Range choice (A-O13 / LC-A05): Basic Latin + Latin-1 Supplement + Latin Extended-A/B (headroom for
// Shona/Ndebele diacritics — Zimbabwe's other official languages, both Latin-script) + the symbol/
// punctuation/math/arrow/box-drawing/dingbat blocks the app's UI (chrome, dividers, ratings, receipts)
// already uses, plus emoji blocks for headroom (cost-free: Inter ships no color-emoji glyphs in ANY
// range, so RN already renders emoji via system font-fallback regardless of what's in this list).
// Deliberately EXCLUDES Cyrillic/Greek/Vietnamese-extensions/CJK — confirmed zero real usage across
// apps/mobile/src+app (see docs/KNOWN_BUGS.md LC-A05); a user typing one of those scripts into a
// free-text field (name, order note, KYC) sees a tofu box for that one glyph, same as today for any
// character outside Inter's original charset.
export const FONT_SAFE_RANGES = [
  [0x0000, 0x024f], // Basic Latin + Latin-1 Supplement + Latin Extended-A + Latin Extended-B
  [0x2000, 0x206f], // General Punctuation (em/en dash, ellipsis, bullet, …)
  [0x2070, 0x209f], // Superscripts and Subscripts
  [0x20a0, 0x20cf], // Currency Symbols
  [0x2100, 0x214f], // Letterlike Symbols
  [0x2150, 0x218f], // Number Forms
  [0x2190, 0x21ff], // Arrows (→, ⇒)
  [0x2200, 0x22ff], // Mathematical Operators (−, ≈, ≤, ≥)
  [0x2300, 0x23ff], // Miscellaneous Technical
  [0x2500, 0x27bf], // Box Drawing + Block Elements + Geometric Shapes + Misc Symbols + Dingbats
  [0x2b00, 0x2bff], // Miscellaneous Symbols and Arrows
  [0xfe00, 0xfe0f], // Variation Selectors
  [0x1f300, 0x1f5ff], // Misc Symbols and Pictographs
  [0x1f600, 0x1f64f], // Emoticons
  [0x1f680, 0x1f6ff], // Transport and Map Symbols
  [0x1f900, 0x1f9ff], // Supplemental Symbols and Pictographs
];

/** pyftsubset --unicodes= value, e.g. "U+0000-024F,U+2000-206F,...". */
export function toPyftsubsetArg(ranges = FONT_SAFE_RANGES) {
  return ranges.map(([lo, hi]) => `U+${lo.toString(16).toUpperCase()}-${hi.toString(16).toUpperCase()}`).join(",");
}

/** True if the given Unicode codepoint (number) falls inside one of the safe ranges. */
export function isSafeCodepoint(cp, ranges = FONT_SAFE_RANGES) {
  return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}
