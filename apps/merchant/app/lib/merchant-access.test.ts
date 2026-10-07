import { describe, expect, it } from "vitest";
import {
  evaluateLoginPageAccess,
  evaluateMerchantAccess,
  isPublicMerchantPath,
  isSafeMerchantRedirectPath,
} from "./merchant-access";

describe("isPublicMerchantPath", () => {
  it("lets the login screen, static assets and the hand-over link through", () => {
    for (const p of [
      "/login",
      "/_next/static/chunk.js",
      "/favicon.ico",
      "/icon.png",
      "/brand/logo.svg",
      "/fonts/inter.woff2",
      "/h",
      "/h/a1b20000-0000-4000-8000-000000000000.1790000000.0123456789abcdef0123456789abcdef",
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

  it("keeps the query string in the return target (an order's id lives there)", () => {
    expect(evaluateMerchantAccess({ pathname: "/queue/order", search: "?id=o1", hasSession: false })).toEqual({
      allow: false,
      redirectTo: "/login?next=%2Fqueue%2Forder%3Fid%3Do1",
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

  // MJ-M5 (2026-10-07): the WHATWG URL parser strips tab/CR/LF and reads `\` as `/`, so these
  // all resolved off-site while passing the old `next[1] !== "/"` test. `decodeURIComponent` mirrors
  // what `useSearchParams().get("next")` hands the login page.
  it.each([
    "/%09/evil.example",
    "/%0a/evil.example",
    "/%0d/evil.example",
    "/%0d%0a/evil.example",
    "%09//evil.example",
    "//evil.example",
    "/%5Cevil.example",
    "/%5C%5Cevil.example",
    "%5C%5Cevil.example",
    "/%2F/evil.example",
    "/%00/evil.example",
    "/%7f/evil.example",
    "https:%2F%2Fevil.example",
    "javascript:alert(1)",
  ])("rejects the decoded bypass %s", (encoded) => {
    const next = decodeURIComponent(encoded);
    expect(isSafeMerchantRedirectPath(next)).toBe(false);
    expect(isSafeMerchantRedirectPath(next, "https://merchant.lyniago.com")).toBe(false);
  });

  it("rejects a backslash or control character anywhere in the path", () => {
    expect(isSafeMerchantRedirectPath("/queue\\evil")).toBe(false);
    expect(isSafeMerchantRedirectPath("/\\/evil.example")).toBe(false);
    expect(isSafeMerchantRedirectPath("/queue\n")).toBe(false);
    expect(isSafeMerchantRedirectPath("/\t\t/evil.example")).toBe(false);
  });

  it("accepts still-encoded text, which the parser keeps on the same origin", () => {
    // A double-encoded `%09` arrives as the literal "%09": a harmless same-origin path segment.
    expect(isSafeMerchantRedirectPath("/%09/evil.example", "https://merchant.lyniago.com")).toBe(true);
    expect(isSafeMerchantRedirectPath("/queue/order?id=o1&b=%2F%2Fx", "https://merchant.lyniago.com")).toBe(true);
  });

  it("resolves against the given origin and keeps only same-origin paths", () => {
    expect(isSafeMerchantRedirectPath("/queue", "https://merchant.lyniago.com")).toBe(true);
    expect(isSafeMerchantRedirectPath("/./queue", "https://merchant.lyniago.com")).toBe(true);
  });
});
