/**
 * Golden-matrix tripwire: merchant surfaces are DEAD while the vertical is disabled
 * (docs/plans/2026-07-26-merchant-verticals-plan.md §0b.4; audit doc
 * docs/plans/2026-07-27-status-keyed-query-audit.md "P0 exit-gate status").
 *
 * Boots a real Nest HTTP app on the no-DB authz harness (runs in the unit CI job on every PR).
 * Two assertions, in load-bearing order:
 *   1. GET /app/feature-flags publicly reports the merchant block DISABLED under a default env —
 *      the assertion that actually means something in P0 (any garbage route 404s; the flags
 *      endpoint reporting "off" is what proves the vertical is dark by configuration).
 *   2. No controller anywhere in the real AppModule graph claims a /merchant route — asserted by
 *      walking the module metadata with Reflect (no app instantiation, no DB), so the moment a
 *      merchant module registers a controller in AppModule outside its flag gate, this reddens.
 *      (The HTTP 404 probe below pins only the booted health surface; the metadata walk is the
 *      actual tripwire. Import-coupling is separately enforced by the depcruise
 *      express-no-merchant-coupling rule.)
 *
 * TODO(P1, plan §0b.4): seeded-cohort leg — when the Merchant cohort gating fields
 * (`Merchant.pilotEnabled`) and first flag consumers land, extend the matrix with a leg that
 * seeds a pilot cohort and asserts flag-on behavior. Tracking record: the audit doc's
 * "P0 exit-gate status" section.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { MerchantFeatureFlagsResponse } from "@lynia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAuthzApp } from "../common/testing/authz-e2e";
import { AppModule } from "../app.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

/** Walk the static module graph (handles dynamic-module `{ module, imports, controllers }` shapes)
 *  and collect every controller class, without instantiating anything. */
function collectControllers(mod: unknown, seen = new Set<unknown>()): Array<{ name: string; path: string }> {
  if (!mod || seen.has(mod)) return [];
  seen.add(mod);
  const cls = (mod as { module?: unknown }).module ?? mod;
  const dynamic = mod as { controllers?: unknown[]; imports?: unknown[] };
  const controllers = [
    ...((Reflect.getMetadata("controllers", cls) as unknown[] | undefined) ?? []),
    ...(dynamic.controllers ?? []),
  ];
  const imports = [
    ...((Reflect.getMetadata("imports", cls) as unknown[] | undefined) ?? []),
    ...(cls === mod ? [] : (dynamic.imports ?? [])),
  ];
  const found = controllers.map((c) => ({
    name: (c as { name?: string }).name ?? "anonymous",
    path: String(Reflect.getMetadata("path", c as object) ?? ""),
  }));
  return [...found, ...imports.flatMap((m) => collectControllers(m, seen))];
}

Reflect.defineMetadata("design:paramtypes", [HealthService, Object], HealthController);

const healthService = { check: async () => ({ status: "ok", db: true, redis: true, provider: "test" }) };

describe("merchant surfaces are dead when disabled (golden matrix, plan §0b.4)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // TEST_ENV carries no merchant flag vars at all — the flags-absent leg. The controller's
    // `=== "true"` reads make absent and explicitly-"false" indistinguishable by construction.
    app = await buildAuthzApp([HealthController], [{ provide: HealthService, useValue: healthService }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("GET /app/feature-flags is public and reports every merchant flag OFF under a default env", async () => {
    const res = await request(app.getHttpServer()).get("/app/feature-flags");
    expect(res.status).toBe(200);
    // Parse through the strict shared contract — shape drift fails here before any client sees it.
    expect(MerchantFeatureFlagsResponse.parse(res.body)).toEqual({
      restaurantsEnabled: false,
      merchantDispatchAutoEnabled: false,
      merchantWalletEnabled: false,
    });
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("no controller in the real AppModule graph claims a merchant route (metadata walk, the tripwire)", () => {
    const controllers = collectControllers(AppModule);
    // Sanity: the walk actually sees the app (health controller must be present) — guards against
    // this assertion passing vacuously if Nest ever changes its metadata keys.
    expect(controllers.some((c) => c.name === "HealthController")).toBe(true);
    const merchantRoutes = controllers.filter((c) => /^\/?merchant/i.test(c.path));
    expect(merchantRoutes, "merchant controllers must not register in AppModule while dormant").toEqual([]);
  });

  it("no /merchant* route exists on the booted health surface (404, not 401/403)", async () => {
    for (const path of ["/merchant", "/merchant/orders", "/merchant/catalog", "/merchant/config"]) {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status, `${path} must be absent while the vertical is dormant`).toBe(404);
    }
  });
});
