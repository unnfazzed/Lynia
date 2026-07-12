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

const throttleOf = (fn: unknown): ThrottleOptions | undefined =>
  Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

describe("AuthController route throttles", () => {
  it("rate-limits POST /auth/otp/verify per IP (bounds OTP / grace-window guessing)", () => {
    const opts = throttleOf(AuthController.prototype.verify);
    expect(opts).toBeDefined();
    expect(opts?.keyPrefix).toBe("otp-verify");
    // A tight-but-usable interactive cap: a handful of tries per code, no more.
    expect(opts?.limit).toBeGreaterThan(0);
    expect(opts?.limit).toBeLessThanOrEqual(15);
    expect(opts?.windowSec).toBeGreaterThan(0);
  });

  it("keeps the existing /auth/refresh throttle", () => {
    expect(throttleOf(AuthController.prototype.refresh)?.keyPrefix).toBe("refresh");
  });

  it("leaves the OTP-send route to AuthService's own send-rate limiter (no double @Throttle)", () => {
    // request() enforces per-phone/IP/global caps inside AuthService.requestOtp, so no route decorator.
    expect(throttleOf(AuthController.prototype.request)).toBeUndefined();
  });
});
