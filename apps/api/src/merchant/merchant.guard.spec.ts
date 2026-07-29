import { describe, expect, it } from "vitest";
import { MerchantGuard } from "./merchant.guard";

function ctx(user?: { role?: string }) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as Parameters<
    MerchantGuard["canActivate"]
  >[0];
}

describe("MerchantGuard", () => {
  it("allows a caller with role=merchant", () => {
    expect(new MerchantGuard().canActivate(ctx({ role: "merchant" }))).toBe(true);
  });

  it("refuses a customer, a rider, an admin, and no user at all (fail-closed)", () => {
    const g = new MerchantGuard();
    expect(() => g.canActivate(ctx({ role: "customer" }))).toThrow(/merchant only/i);
    expect(() => g.canActivate(ctx({ role: "rider" }))).toThrow(/merchant only/i);
    expect(() => g.canActivate(ctx({ role: "admin" }))).toThrow(/merchant only/i);
    expect(() => g.canActivate(ctx(undefined))).toThrow(/merchant only/i);
  });
});
