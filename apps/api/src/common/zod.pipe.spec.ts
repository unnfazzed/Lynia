import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ZodBody } from "./zod.pipe";

// Regression guard (UX-2026-07-15): a Nest HttpException body is used VERBATIM as the HTTP response
// when it's a plain object — the old `flatten()`-only body had no top-level `message`, so the mobile
// client's `friendlyMessage()` (which only ever reads `message`) fell through to a generic "check your
// connection" string for EVERY zod-rejected request app-wide, even though the request reached the
// server fine. `message` must now be present and actionable.
describe("ZodBody", () => {
  const schema = z.object({ etaMinutes: z.number().int().positive().max(180) });

  it("passes through valid data unchanged", () => {
    const pipe = new ZodBody(schema);
    expect(pipe.transform({ etaMinutes: 20 })).toEqual({ etaMinutes: 20 });
  });

  it("throws a BadRequestException whose body carries a top-level, field-qualified message", () => {
    const pipe = new ZodBody(schema);
    try {
      pipe.transform({ etaMinutes: 200 });
      throw new Error("expected transform to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const body = (e as BadRequestException).getResponse() as { message?: string; fieldErrors?: unknown };
      expect(typeof body.message).toBe("string");
      expect(body.message).toMatch(/^etaMinutes:/);
      // The full flatten() shape survives too — still useful for API logs/ops tooling.
      expect(body.fieldErrors).toBeDefined();
    }
  });

  it("still carries a message for a top-level (non-field) schema failure", () => {
    const pipe = new ZodBody(z.object({}).strict());
    try {
      pipe.transform({ unexpected: true });
      throw new Error("expected transform to throw");
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as { message?: string };
      expect(typeof body.message).toBe("string");
      expect(body.message!.length).toBeGreaterThan(0);
    }
  });
});
