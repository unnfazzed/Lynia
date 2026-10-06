/**
 * Route-level rate-limit metadata for AuthController. The unauthenticated POST /auth/otp/verify is a
 * code-guess surface — the live OTP record is capped at 5 attempts, but the post-verify 60s grace
 * path carries no attempt counter by design — so the route MUST carry a per-route @Throttle like
 * /auth/refresh does. Asserted at the decorator-metadata level (no Nest app needed) so it can't
 * silently regress if the handler is edited.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { AuthController } from "./auth.controller";

const throttleOf = (fn: unknown): ThrottleOptions | ThrottleOptions[] | undefined =>
  Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | ThrottleOptions[] | undefined;
const rulesOf = (fn: unknown): ThrottleOptions[] => {
  const meta = throttleOf(fn);
  return meta === undefined ? [] : Array.isArray(meta) ? meta : [meta];
};
const rule = (fn: unknown, keyPrefix: string): ThrottleOptions | undefined =>
  rulesOf(fn).find((r) => r.keyPrefix === keyPrefix);

describe("AuthController route throttles", () => {
  it("rate-limits POST /auth/otp/verify per PHONE (bounds OTP / grace-window guessing from any IP)", () => {
    const opts = rule(AuthController.prototype.verify, "otp-verify");
    expect(opts).toBeDefined();
    // A tight-but-usable interactive cap: a handful of tries per code, no more.
    expect(opts?.limit).toBeGreaterThan(0);
    expect(opts?.limit).toBeLessThanOrEqual(15);
    expect(opts?.windowSec).toBeGreaterThan(0);
    // Keyed by the E.164 phone, however it was typed; a body with no usable phone skips this rule.
    expect(opts?.key?.({ body: { phone: "+263 77 000 0001" }, ip: "1.1.1.1" })).toBe("+263770000001");
    expect(opts?.key?.({ body: { phone: "0770000001" }, ip: "2.2.2.2" })).toBe("+263770000001");
    expect(opts?.key?.({ body: {}, ip: "1.1.1.1" })).toBeUndefined();
    expect(opts?.key?.({ ip: "1.1.1.1" })).toBeUndefined();
  });

  it("E2E 2026-10-05 FS-1: keeps a per-IP verify ceiling ~10x the per-phone cap (a carrier NAT is many riders)", () => {
    const ip = rule(AuthController.prototype.verify, "otp-verify-ip");
    const phone = rule(AuthController.prototype.verify, "otp-verify");
    expect(ip?.key?.({ body: { phone: "+263770000001" }, ip: "9.9.9.9" })).toBe("9.9.9.9");
    expect(ip!.limit).toBeGreaterThanOrEqual(phone!.limit * 10);
  });

  it("E2E 2026-10-05 FS-1: throttles /auth/refresh per session, with a looser per-IP ceiling", () => {
    const session = rule(AuthController.prototype.refresh, "refresh");
    const ip = rule(AuthController.prototype.refresh, "refresh-ip");
    const sid = "0b7e9a62-4f0c-4a5e-9d8e-2f3c1b6a7d90";
    expect(session?.key?.({ body: { refreshToken: `${sid}.secret` }, ip: "1.1.1.1" })).toBe(sid);
    expect(session?.key?.({ body: { refreshToken: "no-dot-here" }, ip: "1.1.1.1" })).toBeUndefined();
    expect(ip?.key?.({ body: {}, ip: "1.1.1.1" })).toBe("1.1.1.1");
    expect(ip!.limit).toBeGreaterThanOrEqual(session!.limit * 10);
  });

  it("leaves the OTP-send route to AuthService's own send-rate limiter (no double @Throttle)", () => {
    // request() enforces per-phone/IP/global caps inside AuthService.requestOtp, so no route decorator.
    expect(throttleOf(AuthController.prototype.request)).toBeUndefined();
  });
});
