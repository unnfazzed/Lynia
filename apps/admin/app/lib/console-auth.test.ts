import { describe, expect, it } from "vitest";
import {
  consoleAuthRequired,
  evaluateConsoleAccess,
  isPublicConsolePath,
  EASY_AUTH_SIGNOUT_URL,
  IAP_SIGNOUT_URL,
  isEasyAuthProxyHeader,
  normalizeOperator,
  parseOperatorAllowlist,
  resolveProxyOperator,
  resolveSignOutUrl,
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

describe("parseOperatorAllowlist", () => {
  it("is null when unset or empty", () => {
    expect(parseOperatorAllowlist(undefined)).toBeNull();
    expect(parseOperatorAllowlist("")).toBeNull();
    expect(parseOperatorAllowlist(" , ,")).toBeNull();
  });
  it("splits on commas, trims, lower-cases and drops blanks", () => {
    expect(parseOperatorAllowlist(" Alice@Corp.com, bob@corp.com ,,")).toEqual(["alice@corp.com", "bob@corp.com"]);
  });
});

describe("isEasyAuthProxyHeader", () => {
  it("matches the Easy Auth header case-insensitively", () => {
    expect(isEasyAuthProxyHeader("x-ms-client-principal-name")).toBe(true);
    expect(isEasyAuthProxyHeader("X-MS-CLIENT-PRINCIPAL-NAME")).toBe(true);
  });
  it("does not match the IAP header", () => {
    expect(isEasyAuthProxyHeader("x-goog-authenticated-user-email")).toBe(false);
  });
});

describe("evaluateConsoleAccess — operator allowlist", () => {
  const base = { nodeEnv: "production", requireAuthOverride: undefined, pathname: "/riders" };
  const allow = parseOperatorAllowlist("alice@corp.com,Ops.Lead@corp.onmicrosoft.com");

  it("admits a listed operator, case-insensitively, and attributes them", () => {
    const d = evaluateConsoleAccess({ ...base, operator: "ALICE@corp.com", allowedOperators: allow });
    expect(d.allow).toBe(true);
    expect(d.operator).toBe("ALICE@corp.com");
    expect(
      evaluateConsoleAccess({ ...base, operator: "ops.lead@CORP.onmicrosoft.com", allowedOperators: allow }).allow,
    ).toBe(true);
  });

  it("FAILS CLOSED (403) for an authenticated operator not on the list", () => {
    const d = evaluateConsoleAccess({ ...base, operator: "mallory@corp.com", allowedOperators: allow });
    expect(d.allow).toBe(false);
    expect(d.operator).toBeNull();
    expect(d.status).toBe(403);
  });

  it("does not match on a substring or suffix", () => {
    expect(evaluateConsoleAccess({ ...base, operator: "lice@corp.com", allowedOperators: allow }).allow).toBe(false);
    expect(evaluateConsoleAccess({ ...base, operator: "alice@corp.com.evil", allowedOperators: allow }).allow).toBe(
      false,
    );
  });

  it("admits a listed operator under Easy Auth", () => {
    const d = evaluateConsoleAccess({
      ...base,
      operator: "alice@corp.com",
      allowedOperators: allow,
      requireAllowlist: true,
    });
    expect(d.allow).toBe(true);
  });

  it("keeps the GCP behaviour when unset: any authenticated operator is admitted", () => {
    const d = evaluateConsoleAccess({ ...base, operator: "anyone@corp.com", allowedOperators: null });
    expect(d.allow).toBe(true);
    expect(d.operator).toBe("anyone@corp.com");
  });

  it("FAILS CLOSED under Easy Auth when the allowlist is unset", () => {
    const d = evaluateConsoleAccess({
      ...base,
      operator: "anyone@corp.com",
      allowedOperators: null,
      requireAllowlist: true,
    });
    expect(d.allow).toBe(false);
    expect(d.operator).toBeNull();
    expect(d.status).toBe(403);
    expect(d.message).toMatch(/ADMIN_CONSOLE_ALLOWED_OPERATORS/);
  });

  it("still 401s an anonymous request before the allowlist is consulted", () => {
    const d = evaluateConsoleAccess({ ...base, operator: null, allowedOperators: allow, requireAllowlist: true });
    expect(d.allow).toBe(false);
    expect(d.status).toBe(401);
  });

  it("is not consulted when auth is off (dev) or for public paths", () => {
    expect(
      evaluateConsoleAccess({
        ...base,
        nodeEnv: "development",
        operator: null,
        allowedOperators: allow,
        requireAllowlist: true,
      }).allow,
    ).toBe(true);
    expect(
      evaluateConsoleAccess({
        ...base,
        pathname: "/api/healthz",
        operator: null,
        allowedOperators: null,
        requireAllowlist: true,
      }).allow,
    ).toBe(true);
  });
});

describe("resolveSignOutUrl", () => {
  it("defaults to the IAP cookie-clear URL (unchanged GCP behaviour)", () => {
    expect(IAP_SIGNOUT_URL).toBe("/?gcp-iap-mode=CLEAR_LOGIN_COOKIE");
    expect(resolveSignOutUrl({ configured: undefined, proxyHeaderName: undefined })).toBe(IAP_SIGNOUT_URL);
    expect(resolveSignOutUrl({ configured: undefined, proxyHeaderName: "x-goog-authenticated-user-email" })).toBe(
      IAP_SIGNOUT_URL,
    );
  });
  it("follows Easy Auth when the proxy header is the Easy Auth one", () => {
    expect(EASY_AUTH_SIGNOUT_URL).toBe("/.auth/logout");
    expect(resolveSignOutUrl({ configured: undefined, proxyHeaderName: "x-ms-client-principal-name" })).toBe(
      EASY_AUTH_SIGNOUT_URL,
    );
  });
  it("lets ADMIN_CONSOLE_SIGNOUT_URL win, ignoring a blank value", () => {
    expect(resolveSignOutUrl({ configured: "/custom/logout", proxyHeaderName: "x-ms-client-principal-name" })).toBe(
      "/custom/logout",
    );
    expect(resolveSignOutUrl({ configured: "  ", proxyHeaderName: undefined })).toBe(IAP_SIGNOUT_URL);
  });
});
