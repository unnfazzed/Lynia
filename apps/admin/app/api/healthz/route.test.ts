import { describe, expect, it } from "vitest";
import { isPublicConsolePath } from "../../lib/console-auth";
import { GET } from "./route";

describe("GET /api/healthz", () => {
  it('returns 200 {status:"ok"}', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("is exempt from the operator gate (the probe carries no identity)", () => {
    expect(isPublicConsolePath("/api/healthz")).toBe(true);
    // Exact match: nothing else under /api/ rides along.
    expect(isPublicConsolePath("/api/healthz/x")).toBe(false);
    expect(isPublicConsolePath("/api/other")).toBe(false);
  });
});
