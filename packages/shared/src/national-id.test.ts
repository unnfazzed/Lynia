import { describe, expect, it } from "vitest";
import { normalizeNationalId } from "./national-id";

describe("normalizeNationalId", () => {
  it("strips dashes and spaces so a punctuated ID collapses to one canonical value", () => {
    expect(normalizeNationalId("18-129766-R-27")).toBe("18129766R27");
    expect(normalizeNationalId("18 129766 R 27")).toBe("18129766R27");
    expect(normalizeNationalId("18129766R27")).toBe("18129766R27");
  });

  it("upper-cases the letter suffix so case never splits an identity", () => {
    expect(normalizeNationalId("63-123456-a-42")).toBe("63123456A42");
  });

  it("is idempotent and tolerates empty/garbage input", () => {
    expect(normalizeNationalId(normalizeNationalId("18-129766-R-27"))).toBe("18129766R27");
    expect(normalizeNationalId("")).toBe("");
    expect(normalizeNationalId("----")).toBe("");
  });
});
