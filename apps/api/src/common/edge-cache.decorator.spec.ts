import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import "reflect-metadata";
import { Controller, Get, Module, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { RestaurantsController } from "../merchant/restaurants.controller";
import { ShopsController } from "../merchant/shops.controller";

import { cacheHeaders } from "./cache-headers.middleware";
import { EDGE_CACHE_CONTROL, EdgeCache, EdgeCacheInterceptor } from "./edge-cache.decorator";

/** Nest's @UseInterceptors metadata key (@nestjs/common constants: INTERCEPTORS_METADATA). */
const INTERCEPTORS_METADATA = "__interceptors__";
const cacheControlOf = (fn: unknown): string | undefined =>
  ((Reflect.getMetadata(INTERCEPTORS_METADATA, fn as object) as unknown[] | undefined) ?? []).includes(EdgeCacheInterceptor)
    ? EDGE_CACHE_CONTROL
    : undefined;

/** The routes the owner approved for edge caching (option A, 2026-11-15): catalogue reads only. */
const EDGE_CACHED = {
  restaurants: ["list", "search", "searchPopular", "popular", "menu"],
  shops: ["list", "search", "popular", "catalogue"],
} as const;

describe("@EdgeCache — browse reads only (docs/AZURE-EXIT.md, Latency)", () => {
  it("lets Cloudflare hold the catalogue reads for 60 s while phones keep revalidating", () => {
    for (const m of EDGE_CACHED.restaurants) {
      expect(cacheControlOf(RestaurantsController.prototype[m]), `restaurants.${m}`).toBe("public, max-age=0, s-maxage=60");
    }
    for (const m of EDGE_CACHED.shops) {
      expect(cacheControlOf(ShopsController.prototype[m]), `shops.${m}`).toBe("public, max-age=0, s-maxage=60");
    }
  });

  it("never marks a customer-specific route shareable", () => {
    for (const m of ["getReopenReminder", "setReopenReminder", "clearReopenReminder"] as const) {
      expect(cacheControlOf(RestaurantsController.prototype[m]), `restaurants.${m}`).toBeUndefined();
    }
  });

  it("is used nowhere else: a new shared-cache route needs a deliberate allowlist change here", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith(".spec.ts")) files.push(p);
      }
    };
    walk(root);
    const uses = files.flatMap((f) => {
      const n = (readFileSync(f, "utf8").match(/@EdgeCache\(\)/g) ?? []).length;
      return n ? [`${relative(root, f)}:${n}`] : [];
    });
    expect(uses.sort()).toEqual(["merchant/restaurants.controller.ts:5", "merchant/shops.controller.ts:4"]);
  });
});

describe("@EdgeCache over real HTTP", () => {
  it("marks a success shareable but never a 404 or 503 (so the kill switches and missing menus are not cached)", async () => {
    @Controller("t")
    class T {
      @EdgeCache()
      @Get("ok")
      ok() {
        return { ok: true };
      }
      @EdgeCache()
      @Get("missing")
      missing() {
        throw new NotFoundException();
      }
      @EdgeCache()
      @Get("off")
      off() {
        throw new ServiceUnavailableException();
      }
    }

    @Module({ controllers: [T] })
    class M {}
    const app = await NestFactory.create(M, { logger: false });
    app.use(cacheHeaders);
    await app.init();
    try {
      const ok = await request(app.getHttpServer()).get("/t/ok");
      expect(ok.status).toBe(200);
      expect(ok.headers["cache-control"]).toBe("public, max-age=0, s-maxage=60");
      for (const path of ["/t/missing", "/t/off"]) {
        const res = await request(app.getHttpServer()).get(path);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.headers["cache-control"]).toBe("private, no-cache");
      }
    } finally {
      await app.close();
    }
  });
});
