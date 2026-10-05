import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Merchant v2 follow-ups (ledger D-77, owner D2): every tappable control is drawn at least 44px tall
 * (`--target-min`), and the app never pads a smaller drawn control with an invisible hit area. This
 * fails when a mobile.css rule styling a pressable — a class used on a <button>, <a>, <Link> or <label>,
 * or a `button` / `a` element selector — sets a height or min-height under 44px, or when a pressable
 * class grows an `::after` hit-area hack again. A real exception is listed with its reason.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  ".m-sw": "the 44×26 switch, as every handoff draws it; its row is the target (upstream ask, D-77 §4)",
  ".m-seg button": "a segment inside the 44px track (T2 Today / This week), as drawn",
  ".m-days button": "the hours day chips — a restyle-only settings screen (D-77: the restyle stands)",
};

const root = fileURLToPath(new URL(".", import.meta.url));
const css = readFileSync(join(root, "mobile.css"), "utf8");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : tsxFiles(p);
    return f.endsWith(".tsx") && !f.includes(".test.") ? [p] : [];
  });
}

const pressable = new Set<string>();
for (const file of tsxFiles(root)) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/<(?:button|a|Link|label)\b[^>]*?className=(?:"([^"]+)"|\{`([^`]+)`\})/gs)) {
    for (const c of (m[1] ?? m[2] ?? "").split(/\s+/)) if (/^m-[\w-]+$/.test(c)) pressable.add(c);
  }
}

/** The rule's selectors whose last compound targets a pressable. */
function pressableSelectors(selector: string): string[] {
  return selector
    .split(",")
    .map((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim())
    .filter((s) => {
      const last = s.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
      if (/::?(after|before)/.test(last)) return false;
      if (/^(button|a)\b/.test(last)) return true;
      return [...last.matchAll(/\.(m-[\w-]+)/g)].some((c) => pressable.has(c[1]!));
    });
}

describe("tap targets (D-77)", () => {
  it("finds the app's pressables", () => {
    expect(pressable.has("m-btn")).toBe(true);
    expect(pressable.has("m-problem")).toBe(true);
  });

  it("draws every pressable at least 44px tall", () => {
    const under: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const h = /(?:^|[;\s])(min-height|height):\s*(\d+(?:\.\d+)?)px/.exec(m[2]!);
      if (!h || Number(h[2]) >= 44) continue;
      for (const sel of pressableSelectors(m[1]!)) if (!(sel in ALLOWED)) under.push(`${sel} → ${h[1]} ${h[2]}px`);
    }
    expect(under).toEqual([]);
  });

  it("pads no pressable with an invisible hit area", () => {
    const hacks = [...css.matchAll(/\.(m-[\w-]+)::after\s*\{[^}]*inset:\s*-\d/g)].map((m) => m[1]).filter((c) => pressable.has(c!));
    expect(hacks).toEqual([]);
  });
});
