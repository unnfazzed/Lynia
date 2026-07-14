/**
 * Route-level rate-limit metadata for ReportsController. POST /orders/:orderId/report INSERTs a row and
 * (like the sibling POST /orders/:orderId/issues) can amplify to ops — unthrottled it is the same
 * push-flood / unbounded-row-growth surface the repo caps elsewhere. Asserted at the decorator-metadata
 * level (no Nest app needed) so it can't silently regress if the handler is edited.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { ReportsController } from "./reports.controller";

const throttleOf = (fn: unknown): ThrottleOptions | undefined =>
  Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

describe("ReportsController route throttle", () => {
  it("rate-limits POST /orders/:orderId/report (mirrors the issue-raise cap)", () => {
    const opts = throttleOf(ReportsController.prototype.report);
    expect(opts).toBeDefined();
    expect(opts?.keyPrefix).toBe("order-report");
    // Same order of magnitude as the issue-raise cap (10/min) — bounds the flood without hurting a
    // legitimate report or two after a bad trip.
    expect(opts?.limit).toBeGreaterThan(0);
    expect(opts?.limit).toBeLessThanOrEqual(30);
    expect(opts?.windowSec).toBeGreaterThan(0);
  });
});
