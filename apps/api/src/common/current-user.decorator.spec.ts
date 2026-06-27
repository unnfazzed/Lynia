import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { resolveCurrentUser } from "./current-user.decorator";

const reqWith = (over: { sub?: string; xUserId?: string }) => ({
  headers: over.xUserId ? { "x-user-id": over.xUserId } : {},
  user: over.sub ? { sub: over.sub } : undefined,
});

describe("resolveCurrentUser", () => {
  it("returns the JWT subject when present", () => {
    expect(resolveCurrentUser(reqWith({ sub: "rider-1" }), "production")).toBe("rider-1");
  });

  it("prefers the JWT subject over a spoofed x-user-id even in dev", () => {
    expect(resolveCurrentUser(reqWith({ sub: "rider-1", xUserId: "attacker" }), "development")).toBe("rider-1");
  });

  it("falls back to x-user-id outside production", () => {
    expect(resolveCurrentUser(reqWith({ xUserId: "rider-2" }), "development")).toBe("rider-2");
    expect(resolveCurrentUser(reqWith({ xUserId: "rider-2" }), "test")).toBe("rider-2");
  });

  it("ignores x-user-id in production (no JWT → unauthenticated)", () => {
    expect(() => resolveCurrentUser(reqWith({ xUserId: "attacker" }), "production")).toThrow(UnauthorizedException);
  });

  it("throws when there is no identity at all", () => {
    expect(() => resolveCurrentUser(reqWith({}), "development")).toThrow(UnauthorizedException);
  });
});
