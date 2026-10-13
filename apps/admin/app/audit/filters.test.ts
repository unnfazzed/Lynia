import { describe, expect, it } from "vitest";
import { auditApiPath, auditHref, changeSummary, readAuditFilters } from "./filters";

describe("audit viewer filters (console v2 §8)", () => {
  it("keeps known, non-empty values and only plain dates", () => {
    expect(
      readAuditFilters({ target: " abc ", actor: "", action: "rider.", from: "2026-10-01", to: "13/10/2026", junk: "x", targetType: ["a", "b"] }),
    ).toEqual({ target: "abc", action: "rider.", from: "2026-10-01" });
  });

  it("writes the same filters into console links and the API path", () => {
    const f = { targetType: "rider", from: "2026-10-01" };
    expect(auditHref(f)).toBe("/audit?targetType=rider&from=2026-10-01");
    expect(auditHref({}, "abc")).toBe("/audit?cursor=abc");
    expect(auditHref({})).toBe("/audit");
    expect(auditApiPath(f, "c1")).toBe("/admin/audit?targetType=rider&from=2026-10-01&cursor=c1");
  });

  it("summarises a before/after snapshot", () => {
    expect(changeSummary({ pilotEnabled: false }, { pilotEnabled: true })).toBe("pilotEnabled: false → true");
    expect(changeSummary(null, { status: "suspended" })).toBe("status: — → suspended");
    expect(changeSummary(null, null)).toBeNull();
  });
});
