import { describe, expect, it } from "vitest";
import {
  evaluateLoginPageAccess,
  evaluateMerchantAccess,
  isPublicMerchantPath,
  isSafeMerchantRedirectPath,
} from "./merchant-access";

describe("isPublicMerchantPath", () => {
  it("lets the login screen, static assets, and the health probe through", () => {
    for (const p of [
      "/login",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/icon.png",
      "/brand/logo.svg",
      "/fonts/inter.woff2",
      "/api/healthz",
    ]) {
      expect(isPublicMerchantPath(p)).toBe(true);
    }
  });

  it("gates real dashboard routes", () => {
    for (const p of ["/", "/queue", "/catalog", "/shop"]) {
      expect(isPublicMerchantPath(p)).toBe(false);
    }
  });
});

describe("evaluateMerchantAccess", () => {
  it("allows a public path with no session", () => {
    expect(evaluateMerchantAccess({ pathname: "/login", hasSession: false })).toEqual({ allow: true });
  });

  it("allows a protected path when a session cookie is present", () => {
    expect(evaluateMerchantAccess({ pathname: "/queue", hasSession: true })).toEqual({ allow: true });
  });

  it("fails closed: no session on a protected path redirects to /login with a return target", () => {
    expect(evaluateMerchantAccess({ pathname: "/queue", hasSession: false })).toEqual({
      allow: false,
      redirectTo: "/login?next=%2Fqueue",
    });
  });
});

describe("evaluateLoginPageAccess", () => {
  it("lets a signed-out visitor see the login screen", () => {
    expect(evaluateLoginPageAccess({ hasSession: false })).toEqual({ allow: true });
  });

  it("bounces an already-signed-in merchant to the dashboard", () => {
    expect(evaluateLoginPageAccess({ hasSession: true })).toEqual({ allow: false, redirectTo: "/queue" });
  });
});

describe("isSafeMerchantRedirectPath (CWE-601 guard on the post-login `next` param)", () => {
  it("accepts ordinary in-app paths", () => {
    expect(isSafeMerchantRedirectPath("/queue")).toBe(true);
    expect(isSafeMerchantRedirectPath("/queue?tab=new")).toBe(true);
    expect(isSafeMerchantRedirectPath("/")).toBe(true);
  });

  it("rejects null/empty", () => {
    expect(isSafeMerchantRedirectPath(null)).toBe(false);
    expect(isSafeMerchantRedirectPath("")).toBe(false);
  });

  it("rejects a full external URL", () => {
    expect(isSafeMerchantRedirectPath("https://attacker.example/x")).toBe(false);
    expect(isSafeMerchantRedirectPath("attacker.example")).toBe(false);
  });

  it("rejects protocol-relative URLs that a plain startsWith('/') check would miss", () => {
    expect(isSafeMerchantRedirectPath("//attacker.example")).toBe(false);
    expect(isSafeMerchantRedirectPath("//attacker.example/phish")).toBe(false);
  });

  it("rejects a backslash-leading path some browsers normalize to protocol-relative", () => {
    expect(isSafeMerchantRedirectPath("/\\attacker.example")).toBe(false);
  });
});
