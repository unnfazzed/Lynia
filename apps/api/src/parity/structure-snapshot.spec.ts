import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * Pixel-parity GUARDRAIL #4 — structural snapshot (CLAUDE.md "Pixel parity": "structure is the
 * look"). Token-conformance proves VALUES match and screen-inventory proves the right screens EXIST,
 * but neither asserts the component TREE matches — which is what silently drifts when a screen is
 * hand-tweaked away from its mock. This guard closes that gap for the owner who codes from a phone
 * and cannot eyeball a diff: it compares two NORMALIZED component trees per codegen-adopted screen —
 *
 *   EXPECTED = the mock component transpiled to RN (tools/parity/codegen) → normalized to shape.
 *   ACTUAL   = the committed apps/mobile <screen>.view.tsx the app renders → normalized the same way.
 *
 * and fails with a readable TREE-PATH diff (e.g. `root>BOX[1]>BOX[0]: expected FIELD, got BOX`). The
 * normalized form keeps element kind (BOX/TEXT/DS-name), nesting, child order and a few structural
 * style axes (row / align-center / absolute / border / flex1) — NOT exact colours/px (token-conformance
 * owns those) and NOT text/handlers (a benign data change never reddens it).
 *
 * Because the view is a MECHANICAL function of the mock (codegen), a green snapshot is structural
 * parity BY CONSTRUCTION. Screens not listed in tools/parity/codegen/adopted.mjs are not visited —
 * the guard no-ops for them (allowlist-driven, like screen-inventory), so it only gates screens
 * actually adopted via codegen. As the 275-state sweep adopts more screens, they join adopted.mjs and
 * are gated here automatically.
 *
 * The engine is ESM-only and lives outside this package's rootDir (tools/parity/codegen), so it is
 * loaded by runtime dynamic import (a file:// URL from an absolute path) — the same approach
 * screen-inventory.spec.ts uses for the parity .mjs sources.
 */
const CODEGEN_DIR = resolve(__dirname, "../../../../tools/parity/codegen");
const importCodegen = (file: string) => import(pathToFileURL(resolve(CODEGEN_DIR, file)).href);

type SnapshotResult = { key: string; ok: boolean; message: string; expected: string; actual: string | null; diff: string | null };

let results: SnapshotResult[];
let adopted: { key: string }[];

beforeAll(async () => {
  const snapshot = await importCodegen("snapshot.mjs");
  const registry = await importCodegen("adopted.mjs");
  adopted = registry.ADOPTED;
  results = snapshot.checkAll(ts);
});

describe("parity structural snapshot · adopted screens match their mock by construction", () => {
  it("has a coherent adopted-screen registry (may be empty; then this guard no-ops)", () => {
    expect(Array.isArray(adopted)).toBe(true);
    for (const s of adopted) expect(typeof s.key).toBe("string");
  });

  it("every codegen-adopted screen is structurally congruent with its mock", () => {
    // Join every failing screen's tree-path message; compare to "" so a drift prints the readable
    // path (Vitest shows the non-empty "received" string) instead of a bare boolean.
    const report = results.filter((r) => !r.ok).map((f) => f.message).join("\n\n");
    expect(report).toBe("");
  });
});
