import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every build-context COPY in the image Dockerfiles must name a path that is in the repo. No PR job
 * builds these images (the staging tier is unarmed), so a missing source first fails in the
 * production release: the SDK 54 upgrade deleted the last file in patches/, git dropped the
 * directory, and every API release after it died at `COPY patches/ patches/` ("/patches": not found)
 * before a revision was created. patches/.gitkeep keeps the directory; this test keeps it honest.
 */
const REPO_ROOT = resolve(__dirname, "../../..");
const DOCKERFILES = ["apps/api/Dockerfile", "apps/admin/Dockerfile"];

/** Sources of each COPY/ADD that reads the build context. `--from=` copies read another stage. */
function copySources(dockerfile: string): string[] {
  const text = readFileSync(resolve(REPO_ROOT, dockerfile), "utf8").replace(/\\\r?\n/g, " ");
  const sources: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:COPY|ADD)\s+(.+)$/i);
    if (!m || /(^|\s)--from=/.test(m[1])) continue;
    const args = m[1].trim().split(/\s+/).filter((a) => !a.startsWith("--"));
    sources.push(...args.slice(0, -1)); // the last argument is the destination
  }
  return sources;
}

/** A plain path must exist; a glob (`pnpm-lock.yaml*`) must match at least one entry. */
function sourceExists(source: string): boolean {
  const path = resolve(REPO_ROOT, source);
  if (!/[*?]/.test(source)) return existsSync(path);
  const dir = dirname(path);
  const escaped = path.slice(dir.length + 1).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
  return existsSync(dir) && readdirSync(dir).some((name) => pattern.test(name));
}

describe("Dockerfile COPY sources", () => {
  it.each(DOCKERFILES)("%s copies only paths that exist in the repo", (dockerfile) => {
    const sources = copySources(dockerfile);
    expect(sources).toContain("patches/"); // the parser sees the COPY that broke the release
    expect(sources.filter((source) => !sourceExists(source))).toEqual([]);
  });
});
