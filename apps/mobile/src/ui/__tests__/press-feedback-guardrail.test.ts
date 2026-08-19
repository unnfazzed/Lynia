import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * GUARDRAIL — every tappable control must acknowledge the touch.
 *
 * This is the test that would have caught the reported bug. 90 of the app's 127 `<Pressable>` call
 * sites rendered a byte-identical frame on touch-down, so nothing changed until the action itself
 * completed and the whole of the action's latency read as "the button didn't work" (the owner report
 * of 2026-08-19; docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §1.1). Nothing in the suite
 * noticed, because every one of those screens rendered, navigated and passed its own assertions
 * perfectly — the defect was in a frame nobody asserted on.
 *
 * So the rule is structural, and it is enforced on the source: a raw `<Pressable>` must carry its own
 * press feedback — either a `({ pressed })` style callback or a real `android_ripple` — and anything
 * that does not should be a `<Tappable>` (src/ui/Tappable.tsx), which supplies feedback by
 * construction. New code gets one of the two or this fails.
 */

const MOBILE_ROOT = resolve(__dirname, "../../..");
const SCAN_ROOTS = ["src", "app"];

/**
 * The primitive itself is the one legitimate raw `<Pressable>` with no inline feedback: it IS the
 * thing that supplies it, on the branch below the one this scan can see.
 */
const ALLOWED = new Set(["src/ui/Tappable.tsx"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules") out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The opening tag starting at `from`. Tracks brace depth and skips strings and comments, because a
 * JSX attribute can hold an arrow function, a nested object, or a comment containing an apostrophe —
 * all of which defeat a naive scan to the next `>`.
 */
function openingTag(src: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (depth > 0 && c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      if (nl === -1) break;
      i = nl;
      continue;
    }
    if (depth > 0 && c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

/** A `<Pressable>` acknowledges the touch if it styles on `pressed` or sets a non-null ripple. */
function hasFeedback(tag: string): boolean {
  return /\(\s*\{\s*pressed/.test(tag) || /android_ripple=\{(?!null\})/.test(tag);
}

describe("press-feedback guardrail", () => {
  const files = SCAN_ROOTS.flatMap((r) => tsxFiles(join(MOBILE_ROOT, r)));

  it("scans a realistic number of component files (the walker itself still works)", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("has no <Pressable> that leaves a touch unacknowledged", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(MOBILE_ROOT, file);
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/<Pressable\b/g)) {
        const index = match.index ?? 0;
        if (!hasFeedback(openingTag(src, index))) {
          const line = src.slice(0, index).split("\n").length;
          offenders.push(`${rel}:${line}`);
        }
      }
    }
    // Named in full so a failure says exactly which control went silent, not just how many.
    expect(offenders).toEqual([]);
  });

  it("routes the great majority of controls through the Tappable primitive", () => {
    let tappable = 0;
    for (const file of files) tappable += [...readFileSync(file, "utf8").matchAll(/<Tappable\b/g)].length;
    // A floor, not an exact count — new screens add controls. It fails loudly if a refactor ever
    // unpicks the primitive and scatters raw Pressables back across the app.
    expect(tappable).toBeGreaterThanOrEqual(80);
  });
});
