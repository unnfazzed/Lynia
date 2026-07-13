/**
 * Route-level rate-limit metadata for RidersController (DS13-06). In auto mode `POST /riders/become`
 * mints a fresh PAID Didit session per call (vendor.submit), so — like `POST /riders/kyc/retry` (F-13)
 * — it MUST carry a per-route @Throttle to blunt a parallel burst billing N sessions. Asserted at the
 * decorator-metadata level (no Nest app needed) so it can't silently regress if the handler is edited.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { RidersController } from "./riders.controller";

const throttleOf = (fn: unknown): ThrottleOptions | undefined =>
  Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

describe("RidersController route throttles", () => {
  it("rate-limits POST /riders/become (paid Didit session per call — DS13-06)", () => {
    const opts = throttleOf(RidersController.prototype.become);
    expect(opts).toBeDefined();
    expect(opts?.keyPrefix).toBe("become");
    expect(opts?.limit).toBeGreaterThan(0);
    expect(opts?.limit).toBeLessThanOrEqual(15);
    expect(opts?.windowSec).toBeGreaterThan(0);
  });

  it("keeps the existing /riders/kyc/retry throttle (same paid-vendor-session cost, F-13)", () => {
    expect(throttleOf(RidersController.prototype.retryKyc)?.keyPrefix).toBe("kyc-retry");
  });
});
