import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as barrel from "./index";
import { WS_EVENTS } from "./ws-events";

/**
 * MJ-RL24 (2026-10-07): every merchant web page, /login included, shipped zod and every API schema because
 * the signed-in shell imported one constant, WS_EVENTS, from contracts.ts. It lives in a module of its own
 * now, and the package says it has no side effects, so a bundler drops the schemas a page never uses.
 */
describe("WS_EVENTS is importable without zod (MJ-RL24)", () => {
  it("lives in a module that imports nothing", () => {
    const source = readFileSync(path.join(__dirname, "ws-events.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(/);
  });

  it("is still the same object from the package's root (contracts re-exports it)", () => {
    expect(barrel.WS_EVENTS).toBe(WS_EVENTS);
    expect(WS_EVENTS.foodQueueChanged).toBe("food:queue-changed");
    expect(WS_EVENTS.merchantQueueSubscribe).toBe("merchant:queue-subscribe");
  });

  it("the package declares no side effects, so unused modules (and zod with them) drop out of a bundle", () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { sideEffects?: unknown };
    expect(pkg.sideEffects).toBe(false);
  });

  it("no module in the package does anything at load time but declare (what sideEffects: false relies on)", () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const lines = readFileSync(path.join(dir, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        // A top-level statement that isn't a declaration, an import/export, a comment or a continuation.
        if (/^[A-Za-z_$][\w$.]*\s*\(/.test(line) && !/^(export|import|function|const|let|type|interface|class|enum|declare)\b/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
