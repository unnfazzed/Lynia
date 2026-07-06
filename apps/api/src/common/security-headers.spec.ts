import { describe, expect, it, vi } from "vitest";
import { securityHeaders } from "./security-headers.middleware";

function makeRes() {
  const headers = new Map<string, string>();
  return {
    headers,
    setHeader: (k: string, v: string) => headers.set(k.toLowerCase(), v),
    removeHeader: (k: string) => headers.delete(k.toLowerCase()),
  };
}

describe("securityHeaders", () => {
  it("sets the baseline hardening headers and calls next()", () => {
    const res = makeRes();
    const next = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    securityHeaders({} as any, res as any, next);

    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(res.headers.get("strict-transport-security")).toContain("includeSubDomains");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(next).toHaveBeenCalledOnce();
  });

  it("strips the X-Powered-By framework fingerprint", () => {
    const res = makeRes();
    res.setHeader("X-Powered-By", "Express");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    securityHeaders({} as any, res as any, vi.fn());
    expect(res.headers.has("x-powered-by")).toBe(false);
  });
});
