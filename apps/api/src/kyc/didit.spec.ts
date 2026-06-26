import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapDiditStatus, verifyDiditSignature } from "./didit";

describe("mapDiditStatus", () => {
  it("maps Didit statuses to rider kyc_status", () => {
    expect(mapDiditStatus("Approved")).toBe("verified");
    expect(mapDiditStatus("approved")).toBe("verified");
    expect(mapDiditStatus("Declined")).toBe("failed");
    expect(mapDiditStatus("Expired")).toBe("failed");
    expect(mapDiditStatus("In Review")).toBe("pending");
    expect(mapDiditStatus("In Progress")).toBe("pending");
    expect(mapDiditStatus("Not Started")).toBe("pending");
  });
});

describe("verifyDiditSignature", () => {
  const secret = "whsec_test_0123456789";
  const body = JSON.stringify({ session_id: "s_1", status: "Approved" });
  const good = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyDiditSignature(body, good, secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyDiditSignature(body + " ", good, secret)).toBe(false);
  });
  it("rejects a wrong/missing signature", () => {
    expect(verifyDiditSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyDiditSignature(body, undefined, secret)).toBe(false);
  });
});
