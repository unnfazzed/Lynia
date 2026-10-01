import { kycTriesLeft, resolveGate } from "../rider-gate";

describe("resolveGate (Rider v2 G1–G14 priority, ledger D-54)", () => {
  const none = { kyc: null, server: null, locDenied: false } as const;

  it("no wall for a verified rider with nothing refused", () => {
    expect(resolveGate(none)).toBeNull();
  });

  it.each([
    [{ kind: "not_a_rider" }, "notRider"],
    [{ kind: "expired" }, "expired"],
    [{ kind: "locked", reasonLabel: null }, "failed2"],
    [{ kind: "declined", reasonLabel: null }, "failed"],
    [{ kind: "cant_start" }, "cantOpen"],
    [{ kind: "manual_review" }, "pending"],
    [{ kind: "in_flight" }, "pending"],
    [{ kind: "unfinished" }, "unfinished"],
  ] as const)("KYC %o → %s", (kyc, id) => {
    expect(resolveGate({ ...none, kyc })).toBe(id);
  });

  it("KYC outranks every server refusal and the GPS wall", () => {
    expect(resolveGate({ kyc: { kind: "in_flight" }, server: "banned", locDenied: true })).toBe("pending");
  });

  it.each([
    ["kyc_expired", "expired"],
    ["kyc", "unfinished"],
    ["banned", "banned"],
    ["suspended", "suspended"],
    ["on_hold", "hold"],
    ["cooldown", "cooldown"],
    ["out_of_area", "area"],
    ["commission_low_balance", "topup"],
  ] as const)("server %s → %s", (server, id) => {
    expect(resolveGate({ ...none, server })).toBe(id);
  });

  it("no GPS sits between out-of-area and the balance floor", () => {
    expect(resolveGate({ kyc: null, server: "out_of_area", locDenied: true })).toBe("area");
    expect(resolveGate({ kyc: null, server: "commission_low_balance", locDenied: true })).toBe("gps");
    expect(resolveGate({ kyc: null, server: null, locDenied: true })).toBe("gps");
  });
});

describe("kycTriesLeft", () => {
  it("counts down from two and never goes negative", () => {
    expect(kycTriesLeft(undefined)).toBe(2);
    expect(kycTriesLeft(1)).toBe(1);
    expect(kycTriesLeft(5)).toBe(0);
  });
});
