/**
 * Client RUM ingest proof (POST /client-metrics). Mirrors the repo's int-spec style: the collaborators
 * are constructed by hand (vitest/esbuild doesn't emit the decorator metadata Nest DI needs), then the
 * REAL guard, REAL ZodBody pipe and REAL controller are exercised end-to-end against synthetic requests.
 * The MetricsService is the real one — NoopMeter-safe with no OTLP endpoint, so records are cheap no-ops.
 *
 * Covers the P0s: auth REQUIRED (401 without a bearer), 2xx happy path, `.strict` rejection of stray
 * fields, out-of-range `ms`/oversized `samples` rejection, and `dropped` acceptance. No DB, no server.
 */
import "reflect-metadata";
import { BadRequestException, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { ClientMetricsBatch as ClientMetricsBatchType } from "@lynia/shared";
import { ClientMetricsBatch } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { ClientMetricsController } from "./client-metrics.controller";
import { MetricsService } from "./metrics.service";

const ENV = { JWT_SIGNING_SECRET: "int-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env;
const tokens = new TokenService(ENV);
const guard = new JwtAuthGuard(tokens);
const controller = new ClientMetricsController(new MetricsService());
const pipe = new ZodBody(ClientMetricsBatch);
const bearer = `Bearer ${tokens.signAccess("profile-under-test", "customer")}`;

/** Minimal ExecutionContext exposing a request with the given headers — all the guard reads. */
function ctxWith(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

/** Run the full guard → pipe → controller path a real request would, returning the handler result. */
function ingest(body: unknown, auth = true): { ok: true } {
  const ctx = ctxWith({ authorization: auth ? bearer : undefined });
  guard.canActivate(ctx); // throws UnauthorizedException on a bad/absent token
  const parsed = pipe.transform(body) as ClientMetricsBatchType; // throws BadRequestException on invalid body
  return controller.ingest(parsed, "profile-under-test");
}

describe("POST /client-metrics — guard + ZodBody + controller", () => {
  it("401s (UnauthorizedException) without a bearer token — auth is REQUIRED (P0)", () => {
    const ctx = ctxWith({ authorization: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("accepts a valid bearer token", () => {
    expect(guard.canActivate(ctxWith({ authorization: bearer }))).toBe(true);
  });

  it("happy path: valid batch flows through and returns { ok: true }", () => {
    expect(
      ingest({
        role: "rider",
        appVersion: "1.4.2",
        samples: [
          { event: "position_glass", ms: 800 },
          { event: "board_glass", ms: 1200 },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it("accepts the three cold-start boot events, including boot_home_paint (RCA §1.2 wire addition)", () => {
    // boot_home_paint is the newest ClientMetricEvent member; the batch schema is .strict() with a
    // closed enum, so an API missing this mapping 400s the WHOLE batch — this pins the vocabulary
    // AND the histogram Record (compile-enforced) end to end.
    expect(
      ingest({
        role: "customer",
        appVersion: "0.40.1",
        samples: [
          { event: "boot_paint", ms: 2100 },
          { event: "boot_home", ms: 2600 },
          { event: "boot_home_paint", ms: 3400 },
        ],
      }),
    ).toEqual({ ok: true });
  });

  it("accepts an optional `dropped` count", () => {
    expect(
      ingest({
        role: "customer",
        samples: [{ event: "offer_glass", ms: 300 }],
        dropped: 7,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a stray field (proves .strict — no unbounded/PII field can reach an instrument)", () => {
    expect(() =>
      ingest({
        role: "customer",
        samples: [{ event: "apifetch", ms: 120 }],
        profileId: "spoofed",
      }),
    ).toThrow(BadRequestException);
  });

  it("rejects ms > 60000 (out-of-range sample)", () => {
    expect(() =>
      ingest({ role: "customer", samples: [{ event: "apifetch", ms: 60_001 }] }),
    ).toThrow(BadRequestException);
  });

  it("rejects more than 20 samples", () => {
    expect(() =>
      ingest({
        role: "customer",
        samples: Array.from({ length: 21 }, () => ({ event: "apifetch", ms: 100 })),
      }),
    ).toThrow(BadRequestException);
  });
});

describe("POST /client-metrics route throttle (F-19)", () => {
  // The only authenticated WRITE that previously carried no @Throttle — the global ThrottleGuard no-ops
  // without this metadata, so an authenticated account could spam batches and poison the RUM/SLO
  // histograms. Asserted at the decorator-metadata level (no Nest app needed) so it can't silently
  // regress if the handler is edited — mirrors AuthController's route-throttle spec.
  const throttleOf = (fn: unknown): ThrottleOptions | undefined =>
    Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | undefined;

  it("rate-limits the ingest handler under its own key", () => {
    const opts = throttleOf(ClientMetricsController.prototype.ingest);
    expect(opts).toBeDefined();
    expect(opts?.keyPrefix).toBe("client-metrics");
    // A low per-minute ceiling: a real client batches ≤20 samples/request and posts periodically.
    expect(opts?.limit).toBeGreaterThan(0);
    expect(opts?.limit).toBeLessThanOrEqual(20);
    expect(opts?.windowSec).toBeGreaterThan(0);
  });
});
