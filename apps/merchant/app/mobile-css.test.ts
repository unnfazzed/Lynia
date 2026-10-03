import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * mobile.css is one flat stylesheet, so a class declared twice is silently merged: the later rule wins
 * every property the two share. Order flow v2 reused `.m-sec` (the B1 / D1 / C3 section label) for a
 * secondary button and `.m-trk` (D1's mint pill tracker) for the four-step track, which turned "Waiting
 * for rider" and "Out for delivery" into grey centred pills and every booking tracker grey. A class gets
 * one top-level rule; one that adds to an earlier rule on purpose is listed here with its reason.
 */
const AUGMENTED: Readonly<Record<string, string>> = {
  ".m-li": "E2 / E4: position: relative, so a row's stretched link can sit under a link of its own",
};

const css = readFileSync(new URL("./mobile.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {\n`);
  return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
}

describe("mobile.css", () => {
  it("declares each top-level single-class rule once", () => {
    const seen = new Map<string, number>();
    for (const m of css.matchAll(/^(\.[a-z][a-z0-9-]*) \{$/gm)) seen.set(m[1]!, (seen.get(m[1]!) ?? 0) + 1);
    const twice = [...seen].filter(([cls, n]) => n > 1 && !(cls in AUGMENTED)).map(([cls]) => cls);
    expect(twice).toEqual([]);
  });

  it("keeps .m-sec a plain section label, and the secondary button its own class", () => {
    expect(ruleBody(".m-sec")).toContain("font-weight: 700");
    expect(ruleBody(".m-sec")).not.toMatch(/background|min-height|justify-content: center/);
    expect(ruleBody(".m-btn-sec")).toContain("min-height: var(--target-min)");
  });

  it("keeps D1's tracker a mint pill, and the four-step track its own class", () => {
    expect(ruleBody(".m-trk")).toContain("background: var(--accent-wash)");
    expect(ruleBody(".m-track")).toContain("background: var(--surface)");
  });
});
