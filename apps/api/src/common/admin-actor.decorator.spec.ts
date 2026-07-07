import { describe, expect, it } from "vitest";
import { resolveAdminActor } from "./admin-actor.decorator";

describe("resolveAdminActor", () => {
  it("prefers the forwarded operator over the token subject", () => {
    const req = { headers: { "x-operator": "alice@corp.com" }, user: { sub: "shared-admin-id" } };
    expect(resolveAdminActor(req)).toBe("alice@corp.com");
  });

  it("trims the operator and bounds its length", () => {
    const long = `${"a".repeat(400)}@corp.com`;
    const req = { headers: { "x-operator": `  ${long}  ` }, user: { sub: "shared-admin-id" } };
    expect(resolveAdminActor(req)).toHaveLength(320);
  });

  it("falls back to the token subject when no operator is forwarded", () => {
    const req = { headers: {}, user: { sub: "shared-admin-id" } };
    expect(resolveAdminActor(req)).toBe("shared-admin-id");
  });

  it("treats a blank operator header as absent", () => {
    const req = { headers: { "x-operator": "   " }, user: { sub: "shared-admin-id" } };
    expect(resolveAdminActor(req)).toBe("shared-admin-id");
  });
});
