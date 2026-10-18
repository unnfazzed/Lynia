import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The anti-zoom floor (iOS Safari zooms the page when a focused field's text is under 16px). It sat
 * inside `@container merchant`, which only matches inside the phone frame, so the ringing screen's
 * sheets (they open over the frame, outside it) kept a 15px note field and zoomed mid-countdown. jsdom
 * evaluates neither media nor container queries, so this guards where the rule lives.
 */
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

/** The body of the first top-level at-rule whose prelude matches, braces balanced. */
function block(prelude: string): string {
  const start = css.indexOf(`${prelude} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  return "";
}

describe("globals.css: the 16px field floor", () => {
  it("applies on any touch screen, overlays included", () => {
    const touch = block("@media (pointer: coarse)");
    expect(touch).toMatch(/input,\s*select,\s*textarea\s*\{\s*font-size: 16px !important;/);
  });

  it("is not scoped to the phone frame's container any more", () => {
    for (const m of css.matchAll(/@container merchant[^{]*\{/g)) {
      expect(block(m[0].slice(0, -2))).not.toMatch(/font-size: 16px !important/);
    }
  });

  it("is a floor: C5's 18px time fields keep their drawn size", () => {
    expect(block("@media (pointer: coarse)")).toMatch(/\.m-in\.m-time:not\(\.m-sm\) input \{\s*font-size: 18px !important;/);
  });
});
