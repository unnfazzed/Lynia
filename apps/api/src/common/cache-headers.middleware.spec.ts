import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { cacheHeaders } from "./cache-headers.middleware";

function run(method: string): { headers: Record<string, string>; next: ReturnType<typeof vi.fn> } {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => void (headers[k] = v) } as unknown as Response;
  const next = vi.fn();
  cacheHeaders({ method } as Request, res, next as unknown as NextFunction);
  return { headers, next };
}

describe("cacheHeaders", () => {
  it("marks GETs private + revalidate-before-reuse (pairs with the ETag/304 contract)", () => {
    const { headers, next } = run("GET");
    expect(headers["Cache-Control"]).toBe("private, no-cache");
    expect(next).toHaveBeenCalledOnce();
  });

  it("marks HEAD like GET", () => {
    expect(run("HEAD").headers["Cache-Control"]).toBe("private, no-cache");
  });

  it.each(["POST", "PATCH", "DELETE"])("forbids storing %s responses entirely", (method) => {
    expect(run(method).headers["Cache-Control"]).toBe("no-store");
  });
});
