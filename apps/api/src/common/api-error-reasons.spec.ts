import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { API_ERROR_REASONS, defaultErrorReason } from "@lynia/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiError, normalizeErrorBody } from "./api-error";
import { ZodBody } from "./zod.pipe";

/** Every non-spec .ts file under apps/api/src. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.includes(".spec.") ? [path] : [];
  });
}

/** `reason: "x"` inside an exception's body literal: `new XException({ … reason: "x" … })` or `HttpException({ … })`. */
const THROWN_REASON = /(?:new\s+\w*Exception|HttpException)\(\s*\{[^{}]*?reason:\s*"([a-z0-9_]+)"/gs;
/** `apiError(status, "x", …)`. */
const HELPER_REASON = /apiError\(\s*\d+,\s*"([a-z0-9_]+)"/g;

describe("API error reasons (R-2 registry, @lynia/shared API_ERROR_REASONS)", () => {
  const registered = new Set(API_ERROR_REASONS);
  const thrown = new Map<string, string>();
  for (const file of sources(join(__dirname, ".."))) {
    const text = readFileSync(file, "utf8");
    for (const re of [THROWN_REASON, HELPER_REASON]) {
      for (const m of text.matchAll(re)) thrown.set(m[1]!, file);
    }
  }

  it("finds the thrown reasons (the scan itself works)", () => {
    expect(thrown.size).toBeGreaterThan(50);
  });

  it("registers every reason the API throws, so a new one is a reviewed addition", () => {
    const missing = [...thrown].filter(([reason]) => !registered.has(reason)).map(([reason, file]) => `${reason} (${file})`);
    expect(missing).toEqual([]);
  });

  it("gives every common status a default reason", () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) expect(registered.has(defaultErrorReason(status))).toBe(true);
    expect(defaultErrorReason(418)).toBe("bad_request");
    expect(defaultErrorReason(504)).toBe("internal_error");
  });
});

describe("apiError / normalizeErrorBody", () => {
  it("apiError builds the one body shape", () => {
    const e = apiError(409, "already_taken", "Someone took it", { orderId: "o1" });
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toEqual({ orderId: "o1", statusCode: 409, reason: "already_taken", message: "Someone took it" });
  });

  it("wraps odd bodies instead of sending them raw", () => {
    expect(normalizeErrorBody(400, null)).toEqual({ statusCode: 400, reason: "bad_request", message: "Request failed" });
    expect(normalizeErrorBody(404, "Order not found")).toEqual({ statusCode: 404, reason: "not_found", message: "Order not found" });
  });

  it("a schema failure is invalid_request and keeps formErrors / fieldErrors", () => {
    const pipe = new ZodBody(z.object({ amount: z.number() }));
    const err = (() => {
      try {
        pipe.transform({ amount: "x" });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      reason: "invalid_request",
      fieldErrors: { amount: expect.any(Array) },
    });
  });
});
