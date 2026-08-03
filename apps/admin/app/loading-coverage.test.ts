import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// D-T1 (LC loop D, 2026-08-03): every async server-component page in this console does
// `await adminFetchResult(...)` before it can render anything, so on a slow/weak connection it
// otherwise shows a blank page for the full round trip. The established fix — see
// orders/[id]/loading.tsx — is a route-colocated loading.tsx wrapping the shared PageSkeleton.
// merchants/page.tsx, merchants/[id]/page.tsx, merchants/disputes/page.tsx, and
// riders/[id]/kyc/page.tsx shipped without one and silently fell back to an ancestor's
// loading.tsx meant for a different page (root "Overview" / "Rider profile"). This test makes
// the gap structural: it fails the moment a new async page.tsx lands without a sibling
// loading.tsx, instead of relying on every future page author remembering the convention.

const APP_DIR = __dirname;

function findPageFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const pages: string[] = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...findPageFiles(full));
    } else if (entry.name === "page.tsx") {
      pages.push(full);
    }
  }
  return pages;
}

function isAsyncServerComponent(pageFile: string): boolean {
  const src = fs.readFileSync(pageFile, "utf8");
  if (/^\s*["']use client["']/m.test(src)) return false;
  return /export default async function/.test(src);
}

describe("admin console route-level loading states", () => {
  it("gives every async server-component page.tsx its own sibling loading.tsx", () => {
    const pageFiles = findPageFiles(APP_DIR);
    expect(pageFiles.length).toBeGreaterThan(0);

    const missing = pageFiles
      .filter(isAsyncServerComponent)
      .filter((pageFile) => !fs.existsSync(path.join(path.dirname(pageFile), "loading.tsx")))
      .map((pageFile) => path.relative(APP_DIR, pageFile));

    expect(missing).toEqual([]);
  });
});
