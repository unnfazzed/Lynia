import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * Pixel-parity GUARDRAIL — screen inventory (CLAUDE.md "Pixel parity", authority-chain step 1: LOOK
 * — the gallery is the source of truth for WHICH screens exist). This deterministic guard replaces
 * per-screen human visual sign-off with a machine check that the app's screen registry always
 * reflects the current gallery and that NO screen is silently uncovered.
 *
 * Three assertions:
 *   1. NOT STALE     — re-running tools/parity/gen-manifest.mjs against the live gallery reproduces
 *                      the committed tools/parity/screens.generated.json byte-for-byte. A design
 *                      export that adds/retires/renames a screen reddens CI until the manifest is
 *                      regenerated (`node tools/parity/gen-manifest.mjs`) and committed.
 *   2. FULL COVERAGE — every screen key is EITHER wired in tools/parity/app-targets.mjs OR listed in
 *                      the tools/parity/parity-status.mjs allowlist as PENDING (adopted, not yet
 *                      wired) or BACKEND_GATED (⛔ needs a seeded backend, with a reason). No screen
 *                      may be uncovered by both.
 *   3. NO PHANTOMS   — every key in app-targets.mjs and in the allowlist exists in the manifest, so a
 *                      target can't quietly point at a retired/renamed screen; and no key is BOTH
 *                      wired and listed as pending/gated.
 *
 * The three .mjs sources are ESM-only and outside this package's rootDir, so they are loaded by
 * runtime dynamic import (a file:// URL built from an absolute path) rather than a static import —
 * that keeps tsc from trying to resolve/typecheck them while the guard still exercises the real
 * files CI and the render harness use.
 */
const PARITY_DIR = resolve(__dirname, "../../../../tools/parity");
const importParity = (file: string) => import(pathToFileURL(resolve(PARITY_DIR, file)).href);

type Screen = { key: string; src: string; id: string; title: string; category: string };
type StatusEntry = { status: "PENDING" | "BACKEND_GATED"; reason?: string };

let APP_TARGETS: Record<string, unknown>;
let PARITY_STATUS: Record<string, StatusEntry>;
let manifest: { count: number; screens: Screen[] };
let committedManifestText: string;
let regeneratedManifestText: string;

beforeAll(async () => {
  const targets = await importParity("app-targets.mjs");
  const status = await importParity("parity-status.mjs");
  const gen = await importParity("gen-manifest.mjs");
  APP_TARGETS = targets.APP_TARGETS;
  PARITY_STATUS = status.PARITY_STATUS;
  committedManifestText = readFileSync(resolve(PARITY_DIR, "screens.generated.json"), "utf8");
  manifest = JSON.parse(committedManifestText);
  const rebuilt = await gen.buildManifest();
  regeneratedManifestText = gen.serializeManifest(rebuilt);
});

describe("parity screen inventory · not stale", () => {
  it("committed screens.generated.json equals a fresh gen-manifest run", () => {
    // If this fails, the gallery changed: run `node tools/parity/gen-manifest.mjs` and commit.
    expect(regeneratedManifestText).toBe(committedManifestText);
  });

  it("has the expected screen count and shape", () => {
    expect(manifest.screens.length).toBe(manifest.count);
    expect(manifest.count).toBeGreaterThan(0);
    for (const s of manifest.screens) expect(s.key).toBe(`${s.src}.${s.id}`);
  });
});

describe("parity screen inventory · full coverage (no screen silently uncovered)", () => {
  it("every gallery screen is wired OR allowlisted (PENDING / BACKEND_GATED)", () => {
    const wired = new Set(Object.keys(APP_TARGETS));
    const allowlisted = new Set(Object.keys(PARITY_STATUS));
    const uncovered = manifest.screens
      .map((s) => s.key)
      .filter((k) => !wired.has(k) && !allowlisted.has(k));
    expect(
      uncovered,
      `screens covered by neither app-targets.mjs nor parity-status.mjs: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });

  it("no screen is both wired and allowlisted (a screen has one disposition)", () => {
    const wired = new Set(Object.keys(APP_TARGETS));
    const both = Object.keys(PARITY_STATUS).filter((k) => wired.has(k));
    expect(both, `keys in BOTH app-targets and parity-status: ${both.join(", ")}`).toEqual([]);
  });

  it("every allowlist entry has a valid status, and BACKEND_GATED carries a reason", () => {
    const bad: string[] = [];
    for (const [key, entry] of Object.entries(PARITY_STATUS)) {
      if (entry.status !== "PENDING" && entry.status !== "BACKEND_GATED") bad.push(`${key}: bad status ${entry.status}`);
      if (entry.status === "BACKEND_GATED" && !(entry.reason && entry.reason.trim())) bad.push(`${key}: BACKEND_GATED without reason`);
    }
    expect(bad, bad.join("; ")).toEqual([]);
  });
});

describe("parity screen inventory · no phantom targets", () => {
  it("every app-targets.mjs key exists in the manifest", () => {
    const keys = new Set(manifest.screens.map((s) => s.key));
    const phantom = Object.keys(APP_TARGETS).filter((k) => !keys.has(k));
    expect(phantom, `app-targets.mjs keys not in screens.generated.json: ${phantom.join(", ")}`).toEqual([]);
  });

  it("every parity-status.mjs key exists in the manifest", () => {
    const keys = new Set(manifest.screens.map((s) => s.key));
    const phantom = Object.keys(PARITY_STATUS).filter((k) => !keys.has(k));
    expect(phantom, `parity-status.mjs keys not in screens.generated.json: ${phantom.join(", ")}`).toEqual([]);
  });
});
