/**
 * Route-level rate-limit metadata for RidersController (DS13-06). In auto mode `POST /riders/become`
 * mints a fresh PAID Didit session per call (vendor.submit), so — like `POST /riders/kyc/retry` (F-13)
 * — it MUST carry a per-route @Throttle to blunt a parallel burst billing N sessions. Asserted at the
 * decorator-metadata level (no Nest app needed) so it can't silently regress if the handler is edited.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { KYC_PAID_MINT_LIMIT } from "./rider.service";
import { KYC_ROUTE_REQUEST_CAP, RidersController } from "./riders.controller";

const throttleOf = (fn: unknown): ThrottleOptions | undefined =>
  Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

describe("RidersController route throttles", () => {
  // The routes keep a request-flood guard; the PAID spend is bounded in RiderService, counting only sessions
  // actually bought (KYC_PAID_MINT_LIMIT). The old 5/hour cap counted free resumes and vendor 503s, so a Didit
  // blip locked an honest biker out of their own check for an hour.
  it("rate-limits POST /riders/become as a flood guard — high enough that 503s and replays don't lock a biker out", () => {
    const opts = throttleOf(RidersController.prototype.become);
    expect(opts).toBeDefined();
    expect(opts?.keyPrefix).toBe("become");
    expect(opts?.limit).toBe(KYC_ROUTE_REQUEST_CAP);
    expect(opts?.limit).toBeGreaterThan(KYC_PAID_MINT_LIMIT * 4);
    expect(opts?.limit).toBeLessThanOrEqual(60);
    expect(opts?.windowSec).toBe(3600);
  });

  it("the same flood guard on /riders/kyc/retry — well above the service's paid-mint ceiling, still bounded", () => {
    const opts = throttleOf(RidersController.prototype.retryKyc);
    expect(opts?.keyPrefix).toBe("kyc-retry");
    expect(opts?.limit).toBe(KYC_ROUTE_REQUEST_CAP);
    expect(opts?.windowSec).toBe(3600);
  });
});
