import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * GUARDRAIL — a ring with one differently coloured side is drawn with `ArcRing` / `ArcSpinner`
 * (src/ui/ArcSpinner.tsx), never as a bordered View.
 *
 * The kit draws its spinners as CSS `border: … ; border-top-color: …` on a circle. Copied into React
 * Native, that renders fine in tests and on iOS, but Android paints a rounded View whose sides have
 * different border colours as mitred trapezoids: the "arc" comes out as a thin, tapered, off-centre
 * sliver that wobbles as it turns (owner report 2026-10-07, the KYC "ID check · In review" marker; the
 * same construction sat in the F8 hero, the Orders "Loading older" row and the rider boot splash).
 *
 * So the rule is enforced on the source: a style object that sets a per-side border colour may not also
 * set the all-sides `borderColor`, nor be a full rounded ring (`borderWidth` + `borderRadius`). A plain
 * divider (`borderTopWidth` + `borderTopColor`) is untouched.
 */

const MOBILE_ROOT = resolve(__dirname, "../../..");
const SCAN_ROOTS = ["src", "app"];

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

/** The innermost `{ … }` around `at` — the style object literal a property belongs to. */
function enclosingObject(src: string, at: number): string {
  let depth = 0;
  let start = at;
  for (; start > 0; start--) {
    const c = src[start - 1];
    if (c === "}") depth++;
    else if (c === "{") {
      if (depth === 0) break;
      depth--;
    }
  }
  depth = 0;
  let end = at;
  for (; end < src.length; end++) {
    const c = src[end];
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0) break;
      depth--;
    }
  }
  return src.slice(start - 1, end + 1);
}

function sideColouredRings(src: string): number[] {
  const lines: number[] = [];
  for (const m of src.matchAll(/\bborder(?:Top|Right|Bottom|Left)Color\b/g)) {
    const obj = enclosingObject(src, m.index!);
    if (/\bborderColor\b/.test(obj) || (/\bborderWidth\b/.test(obj) && /\bborderRadius\b/.test(obj))) {
      lines.push(src.slice(0, m.index).split("\n").length);
    }
  }
  return lines;
}

describe("arc-ring guardrail", () => {
  it("flags the old bordered-View spinner and the split-style variant", () => {
    expect(sideColouredRings(`<View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: a, borderTopColor: b }} />`)).toEqual([1]);
    expect(sideColouredRings(`const s = { ringActive: { borderColor: a, borderTopColor: "transparent" } };`)).toEqual([1]);
    expect(sideColouredRings(`<View style={{ paddingTop: 4, borderTopWidth: 1, borderTopColor: line }} />`)).toEqual([]);
  });

  it("no source file draws a side-coloured ring as a bordered View", () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of tsxFiles(join(MOBILE_ROOT, root))) {
        for (const line of sideColouredRings(readFileSync(file, "utf8"))) offenders.push(`${relative(MOBILE_ROOT, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
