/**
 * Shared harness for the HTTP-level authorization e2e specs (gate LR1).
 *
 * These specs boot a REAL Nest HTTP app (via NestFactory) with the REAL controllers, REAL guards
 * (JwtAuthGuard/AdminGuard) and REAL service authz logic, and drive it over real HTTP with supertest.
 * Only the data layer (PrismaService) and external deps are mocked, so the suite needs NO database,
 * Redis, BullMQ or Socket.IO — it runs under the normal `vitest` unit run.
 *
 * Why the manual `design:paramtypes`: vitest transforms with esbuild, which does NOT emit the
 * `emitDecoratorMetadata` `design:paramtypes` that Nest's reflective DI reads to resolve constructor
 * dependencies (the repo's existing *.int.spec.ts files sidestep this by hand-wiring collaborators).
 * We restore just enough metadata — for the shared auth classes here, and per-controller in each spec —
 * so Nest can construct the graph and the guards run in the real request pipeline. This is TEST-ONLY
 * metadata set at spec load; it never touches production code (which is compiled by tsc with metadata).
 */
import "reflect-metadata";
import { type INestApplication, Module, type Provider, type Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AdminGuard } from "../../auth/admin.guard";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { TokenService } from "../../auth/token.service";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";

/** A test env with a known signing secret — the guard verifies JWTs against this exact secret. */
export const TEST_ENV = {
  JWT_SIGNING_SECRET: "e2e-authz-test-secret-0123456789",
  ACCESS_TTL_SECONDS: 900,
} as Env;

/** The same TokenService (same signing path + secret) the guards verify against, used to mint tokens. */
export const tokens = new TokenService(TEST_ENV);

/** Mint a `Bearer <jwt>` header value for a given subject (profile id) and role. */
export function bearer(sub: string, role = "customer"): string {
  return `Bearer ${tokens.signAccess(sub, role)}`;
}

// Restore constructor-param metadata esbuild dropped, for the auth classes shared by every spec.
// TokenService injects ENV via @Inject(ENV) (self-declared token) — it just needs a paramtypes slot.
Reflect.defineMetadata("design:paramtypes", [Object], TokenService);
Reflect.defineMetadata("design:paramtypes", [TokenService], JwtAuthGuard);

/** Providers that satisfy the real JwtAuthGuard/AdminGuard graph — include in every module. */
export const authProviders: Provider[] = [
  { provide: ENV, useValue: TEST_ENV },
  TokenService,
  JwtAuthGuard,
  AdminGuard,
];

/**
 * Boot a minimal real Nest HTTP app with the given controller(s) + provider(s). Callers must have
 * already set `design:paramtypes` for their controller(s) (see each spec). Returns the initialised app.
 */
export async function buildAuthzApp(
  controllers: Type[],
  providers: Provider[],
): Promise<INestApplication> {
  @Module({ controllers, providers: [...authProviders, ...providers] })
  class AuthzTestModule {}

  const app = await NestFactory.create(AuthzTestModule, { logger: false });
  await app.init();
  return app;
}
