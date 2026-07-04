import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { tokens } from "@lynia/shared";

/**
 * Guards the CSS↔TS token contract (docs/DESIGN-SYSTEM.md "Keeping tokens in sync"). The palette
 * lives in three hand-synced faces — `packages/design/tokens/colors.css` (design source of truth),
 * `packages/shared/src/design-tokens.ts` (what the apps consume), and `apps/admin/app/globals.css`.
 * This asserts the first two never drift on the load-bearing colours. If it fails, a token was
 * changed in one face but not the other — fix both (and the admin globals) before shipping.
 */
const REPO_ROOT = resolve(__dirname, "../../..");
const colorsCss = readFileSync(resolve(REPO_ROOT, "packages/design/tokens/colors.css"), "utf8");

/** Pull a `--var: #hex;` value out of the CSS, normalised to lowercase (ignores `var(--…)` aliases). */
function cssVar(name: string): string | null {
  const m = colorsCss.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
  return m ? m[1]!.toLowerCase() : null;
}

// CSS var ↔ TS key. Names differ by design (docs/DESIGN-SYSTEM.md "CSS ↔ TS token naming map").
const PAIRS: Array<[cssVar: string, tsValue: string]> = [
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
  ["danger", tokens.color.danger],
  ["danger-wash", tokens.color.dangerWash],
  ["on-accent", tokens.color.onAccent],
];

describe("design token drift: colors.css ↔ design-tokens.ts", () => {
  it.each(PAIRS)("--%s matches its TS token (%s)", (name, tsValue) => {
    expect(cssVar(name)).toBe(tsValue.toLowerCase());
  });
});
