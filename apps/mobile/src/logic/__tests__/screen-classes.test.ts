import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * N-04 / D1 — the `held` screen class has exactly one member, and that is a decision, not an accident.
 *
 * `back={false}` removes a drawn chevron and says nothing about Android's hardware back button, so two
 * different intentions were wearing one prop. `docs/DESIGN.md` § Screen classes names them:
 *
 *   dismissible  drawn back, hardware back allowed  — every ordinary pushed screen
 *   directed     no drawn back, hardware back allowed — gate_topup, the KYC walls, the active job
 *   held         no drawn back, hardware back BLOCKED — food checkout while placing, and nothing else
 *
 * Blocking the OS back gesture is a serious thing to do to someone. It is justified where a payment is
 * in flight and leaving risks a double charge or a silently-lost order; it is NOT justified merely
 * because a screen would prefer not to be left. `usePlacingGuard` is the only implementation, so
 * asserting on its call sites pins the whole class — a second `held` screen cannot appear without this
 * failing, which forces the decision (and the DESIGN.md table) to be updated on purpose.
 *
 * Source-level rather than render-level deliberately: the claim is about which screens are in the
 * class, and no amount of rendering one screen can prove something about the others.
 */
const APP_DIR = join(__dirname, "..", "..", "..", "app");

function screenFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : screenFiles(full);
    return /\.tsx?$/.test(entry) && !entry.endsWith(".test.tsx") ? [full] : [];
  });
}

describe("screen classes (N-04 / D1)", () => {
  const callers = screenFiles(APP_DIR).filter((f) => /usePlacingGuard\s*\(/.test(readFileSync(f, "utf8")));
  const relative = callers.map((f) => f.slice(APP_DIR.length + 1).replace(/\\/g, "/")).sort();

  it("food checkout is `held` — it actually mounts the guard, not just promises to", () => {
    expect(relative).toContain("food/checkout.tsx");
  });

  it("and it is the ONLY held screen — adding another is a decision, not a refactor", () => {
    expect(relative).toEqual(["food/checkout.tsx"]);
  });

  // The guard is only correct while the mutation is in flight: holding someone on a screen after the
  // work finished is a trap, not a protection. Pin that it is driven by the in-flight flag rather than
  // hard-coded true, which would block back for the whole life of the screen.
  it("holds only while the placement is in flight", () => {
    const src = readFileSync(join(APP_DIR, "food", "checkout.tsx"), "utf8");
    expect(src).toMatch(/usePlacingGuard\(\s*busy\s*\)/);
    expect(src).not.toMatch(/usePlacingGuard\(\s*true\s*\)/);
  });
});
