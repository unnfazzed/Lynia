import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { tokens } from "@lynia/shared";

/**
 * Pixel-parity GUARDRAIL — token conformance (CLAUDE.md "Pixel parity", authority-chain step 3:
 * VALUES). The design's token CSS (`packages/design/tokens/*.css`) is the source of truth. Three app
 * faces consume those tokens and must never diverge from it:
 *
 *   - MOBILE   `packages/shared/src/design-tokens.ts` (structured TS the RN app reads)
 *   - ADMIN    `apps/admin/app/globals.css`     (`:root` CSS vars)
 *   - MERCHANT `apps/merchant/app/globals.css`  (`:root` CSS vars)
 *
 * This asserts value-identity for EVERY token category the design defines (colour, spacing, radius,
 * type scale + weights + leading, icon sizing, touch targets, and — for the CSS faces — the literal
 * box-shadows and font stacks). If a face legitimately does not define a token it is skipped (we
 * never force presence); but any token a face DOES define must equal the design source. Fix the app
 * face to match `packages/design/tokens/*.css` — NEVER edit the design to match the app.
 *
 * Naming map (same value, two spellings — docs/DESIGN-SYSTEM.md "CSS ↔ TS token naming map"):
 *   `--cta-fill` ↔ `cta`, `--cta-fill-pressed` ↔ `ctaPressed`, `--accent-700` ↔ `accentPressed`,
 *   `--space-2xl`/`--space-3xl` ↔ `space.xxl`/`space.xxxl` (the CSS faces spell these `--space-xxl`).
 * The RN `shadow` tokens are documented multi-layer APPROXIMATIONS (RN can't render layered
 * box-shadows), so the TS face is checked for everything EXCEPT shadow; the CSS faces carry the
 * literal shadow and are checked for it.
 */
const REPO_ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(REPO_ROOT, p), "utf8");

/** Flatten `--name: value;` declarations out of a CSS file into a map (last write wins). */
function parseCssVars(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out[m[1]!] = m[2]!.trim();
  return out;
}

const isAlias = (v: string) => v.trim().startsWith("var(");
const norm = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
/** Strip a trailing `px` and parse to a number for comparing against the TS face's numeric tokens. */
const px = (v: string | undefined) => (v == null ? NaN : parseFloat(v.replace("px", "").trim()));

// ── Design source of truth ────────────────────────────────────────────────────────────────────
const DESIGN: Record<string, string> = {
  ...parseCssVars(read("packages/design/tokens/colors.css")),
  ...parseCssVars(read("packages/design/tokens/spacing.css")),
  ...parseCssVars(read("packages/design/tokens/typography.css")),
  ...parseCssVars(read("packages/design/tokens/icons.css")),
  ...parseCssVars(read("packages/design/tokens/fonts.css")),
};

// ── FACE 1 · MOBILE (design-tokens.ts) ──────────────────────────────────────────────────────────
// Explicit design-var → TS-value table. Numbers compare against the design value with `px` stripped;
// hex strings compare case-insensitively. Covers every category the TS face defines that the design
// also defines (shadow is intentionally excluded — documented approximation).
const TS_PAIRS: Array<[designVar: string, tsValue: string | number]> = [
  // colours (raw scale)
  ["ink", tokens.color.ink],
  ["muted", tokens.color.muted],
  ["bg", tokens.color.bg],
  ["surface", tokens.color.surface],
  ["line", tokens.color.line],
  ["accent", tokens.color.accent],
  ["accent-700", tokens.color.accentPressed],
  ["accent-text", tokens.color.accentText],
  ["accent-wash", tokens.color.accentWash],
  ["cta-fill", tokens.color.cta],
  ["cta-fill-pressed", tokens.color.ctaPressed],
  ["highlight", tokens.color.highlight],
  ["highlight-wash", tokens.color.highlightWash],
  ["highlight-ink", tokens.color.highlightInk],
  ["highlight-border", tokens.color.highlightBorder],
  ["danger", tokens.color.danger],
  ["danger-wash", tokens.color.dangerWash],
  ["danger-ink", tokens.color.dangerInk],
  ["success", tokens.color.success],
  ["on-accent", tokens.color.onAccent],
  // spacing (8pt)
  ["space-xs", tokens.space.xs],
  ["space-sm", tokens.space.sm],
  ["space-md", tokens.space.md],
  ["space-lg", tokens.space.lg],
  ["space-xl", tokens.space.xl],
  ["space-2xl", tokens.space.xxl],
  ["space-3xl", tokens.space.xxxl],
  ["space-screen", tokens.space.screen],
  // radius
  ["radius-input", tokens.radius.input],
  ["radius-card", tokens.radius.card],
  ["radius-button", tokens.radius.button],
  ["radius-pill", tokens.radius.pill],
  // type scale
  ["text-display", tokens.font.size.display],
  ["text-h1", tokens.font.size.h1],
  ["text-h2", tokens.font.size.h2],
  ["text-title", tokens.font.size.title],
  ["text-price", tokens.font.size.price],
  ["text-body-lg", tokens.font.size.bodyLg],
  ["text-body", tokens.font.size.body],
  ["text-caption", tokens.font.size.caption],
  ["text-label", tokens.font.size.label],
  ["text-micro", tokens.font.size.micro],
  // weights
  ["weight-regular", tokens.font.weight.regular],
  ["weight-medium", tokens.font.weight.medium],
  ["weight-semibold", tokens.font.weight.semibold],
  ["weight-bold", tokens.font.weight.bold],
  ["weight-extrabold", tokens.font.weight.extrabold],
  // line heights
  ["leading-tight", tokens.leading.tight],
  ["leading-snug", tokens.leading.snug],
  ["leading-body", tokens.leading.body],
  // icon sizing
  ["icon-size", tokens.icon.size],
  ["icon-size-lg", tokens.icon.sizeLg],
  ["icon-size-tile", tokens.icon.sizeTile],
  ["icon-stroke", tokens.icon.stroke],
  // touch targets
  ["target-min", tokens.touchTargetMin],
  ["target-primary", tokens.touchTargetPrimary],
];

describe("token conformance · MOBILE (design-tokens.ts ↔ packages/design/tokens)", () => {
  it("covers every non-alias, non-shadow design token exactly once (no silent gaps)", () => {
    // Every raw design token the mobile face is expected to mirror is in TS_PAIRS. This catches a
    // design export ADDING a token that the table (and therefore the app) never picked up.
    const covered = new Set(TS_PAIRS.map(([d]) => d));
    // The design tokens a structured TS face is expected to mirror: colours + the numeric scales.
    // Exclude semantic aliases (var(...) indirections), the multi-layer shadows, and the font
    // stacks (the TS face stores just the family name, not the CSS fallback stack).
    const EXPECTED = Object.keys(DESIGN).filter((k) => {
      if (isAlias(DESIGN[k]!)) return false;
      if (k.startsWith("shadow-")) return false;
      if (k.startsWith("font-")) return false; // font-sans / font-family / font-wordmark stacks
      if (k === "numeric-tabular") return false; // css keyword, not a scalar the TS face mirrors
      return true;
    });
    const missing = EXPECTED.filter((k) => !covered.has(k));
    expect(missing, `design tokens not asserted against the mobile face: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(TS_PAIRS)("--%s == design source", (designVar, tsValue) => {
    const designValue = DESIGN[designVar];
    expect(designValue, `design source missing --${designVar}`).toBeDefined();
    if (typeof tsValue === "number") {
      expect(tsValue).toBe(px(designValue));
    } else {
      expect(tsValue.toLowerCase()).toBe(norm(designValue!));
    }
  });
});

// ── FACES 2 & 3 · ADMIN + MERCHANT (:root CSS vars) ─────────────────────────────────────────────
// Data-driven off what each face ACTUALLY declares: for every `--var` a face defines, map its name
// back to the design source and assert equality. A face may legitimately omit tokens (skipped) or
// declare local `var(...)` aliases (skipped) — but any concrete value it shares with the design must
// match. This direction also catches a face declaring a token the design later dropped.
const FACE_NAME_MAP: Record<string, string> = {
  // CSS faces spell the two top spacing steps without the numeral the design tool emits.
  "space-xxl": "space-2xl",
  "space-xxxl": "space-3xl",
};

const CSS_FACES: Array<[label: string, path: string]> = [
  ["ADMIN", "apps/admin/app/globals.css"],
  ["MERCHANT", "apps/merchant/app/globals.css"],
];

for (const [label, path] of CSS_FACES) {
  const face = parseCssVars(read(path));
  // Rows this face shares (by mapped name) with the design source, and that are concrete on both.
  const rows = Object.entries(face)
    .filter(([, v]) => !isAlias(v))
    .map(([name, v]) => [name, FACE_NAME_MAP[name] ?? name, v] as const)
    .filter(([, designName]) => designName in DESIGN && !isAlias(DESIGN[designName]!));

  describe(`token conformance · ${label} (globals.css :root ↔ packages/design/tokens)`, () => {
    it("shares real tokens with the design source (guard is not vacuous)", () => {
      expect(rows.length).toBeGreaterThan(20);
    });

    it.each(rows.map((r) => [r[0], r[1], r[2]] as [string, string, string]))(
      "--%s (design --%s) matches",
      (_faceVar, designName, faceValue) => {
        expect(norm(faceValue)).toBe(norm(DESIGN[designName]!));
      },
    );
  });
}
