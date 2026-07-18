import { describe, expect, it } from "vitest";
import {
  consoleAuthRequired,
  evaluateConsoleAccess,
  isPublicConsolePath,
  normalizeOperator,
  resolveProxyOperator,
} from "./console-auth";

/**
 * The console access gate is the whole reason it is safe to expose a token that can approve KYC, ban
 * riders, and record cash on a public URL. It fails CLOSED: production with no verified operator = 401.
 * These are pure-function tests — no Next, no network — so the allow/deny truth table is pinned exactly.
 */

describe("isPublicConsolePath", () => {
  it("lets framework internals and static assets through", () => {
    for (const p of [
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/icon.png",
      "/brand/logo.svg",
      "/fonts/inter.woff2",
      "/robots.txt",
    ]) {
      expect(isPublicConsolePath(p)).toBe(true);
    }
  });

  it("gates real console routes", () => {
    for (const p of ["/", "/riders", "/cash", "/actions/ban"]) {
      expect(isPublicConsolePath(p)).toBe(false);
    }
  });
});

describe("normalizeOperator", () => {
  it("strips the IAP issuer prefix", () => {
    expect(normalizeOperator("accounts.google.com:alice@corp.com")).toBe("alice@corp.com");
  });
  it("passes a bare email through and trims whitespace", () => {
    expect(normalizeOperator("  bob@corp.com  ")).toBe("bob@corp.com");
  });
});

describe("consoleAuthRequired", () => {
  it("is false for public paths regardless of env", () => {
    expect(
      consoleAuthRequired({ nodeEnv: "production", requireAuthOverride: undefined, pathname: "/_next/x" }),
    ).toBe(false);
  });
  it("defaults ON in production and OFF otherwise", () => {
    expect(consoleAuthRequired({ nodeEnv: "production", requireAuthOverride: undefined, pathname: "/" })).toBe(
      true,
    );
    expect(consoleAuthRequired({ nodeEnv: "development", requireAuthOverride: undefined, pathname: "/" })).toBe(
      false,
    );
  });
  it("honors the explicit override in both directions", () => {
    expect(consoleAuthRequired({ nodeEnv: "development", requireAuthOverride: true, pathname: "/" })).toBe(true);
    expect(consoleAuthRequired({ nodeEnv: "production", requireAuthOverride: false, pathname: "/" })).toBe(false);
  });
});

describe("resolveProxyOperator", () => {
  const header = (value: string | null) => ({
    proxyHeaderName: "x-goog-authenticated-user-email",
    getHeader: (name: string) => (name === "x-goog-authenticated-user-email" ? value : null),
  });

  it("normalizes a present identity", () => {
    expect(resolveProxyOperator(header("accounts.google.com:alice@corp.com"))).toBe("alice@corp.com");
  });
  it("returns null when the header is absent or blank", () => {
    expect(resolveProxyOperator(header(null))).toBeNull();
    expect(resolveProxyOperator(header("   "))).toBeNull();
  });
});

describe("evaluateConsoleAccess", () => {
  const base = { nodeEnv: "production", requireAuthOverride: undefined, pathname: "/riders" };

  it("allows public paths with no operator", () => {
    const d = evaluateConsoleAccess({ ...base, pathname: "/_next/x", operator: null });
    expect(d.allow).toBe(true);
    expect(d.operator).toBeNull();
  });

  it("allows through in dev (auth not required) with no operator", () => {
    const d = evaluateConsoleAccess({ ...base, nodeEnv: "development", operator: null });
    expect(d.allow).toBe(true);
    expect(d.operator).toBeNull();
  });

  it("FAILS CLOSED in production when no operator was resolved", () => {
    const d = evaluateConsoleAccess({ ...base, operator: null });
    expect(d.allow).toBe(false);
    expect(d.status).toBe(401);
    expect(d.message).toMatch(/authenticated operator/i);
  });

  it("FAILS CLOSED when the operator resolves to blank", () => {
    const d = evaluateConsoleAccess({ ...base, operator: "   " });
    expect(d.allow).toBe(false);
    expect(d.status).toBe(401);
  });

  it("allows and attributes a resolved operator in production", () => {
    const d = evaluateConsoleAccess({ ...base, operator: "alice@corp.com" });
    expect(d.allow).toBe(true);
    expect(d.operator).toBe("alice@corp.com");
  });

  it("respects an explicit require-auth override even outside production", () => {
    const d = evaluateConsoleAccess({
      ...base,
      nodeEnv: "development",
      requireAuthOverride: true,
      operator: null,
    });
    expect(d.allow).toBe(false);
    expect(d.status).toBe(401);
  });
});
