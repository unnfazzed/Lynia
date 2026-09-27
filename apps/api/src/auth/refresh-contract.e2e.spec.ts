/**
 * The wire shape of POST /auth/refresh's failures — pinned because both clients key a SIGN-OUT off it.
 * apps/mobile/src/api/client.ts and apps/merchant/app/lib/api-client.ts treat a 401/403 from this route as
 * "the refresh token is dead" ONLY when the body is this API's error envelope (`statusCode` matching the
 * HTTP status, plus a `message`); anything else — a proxy/WAF/captive-portal page — is transient (SES-05).
 * If a future change reshaped these bodies, real revocations would stop signing users out and every
 * request would fail forever instead. Boots the real controller + the real global exception filter.
 */
import "reflect-metadata";
import { type INestApplication, UnauthorizedException } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../common/all-exceptions.filter";
import { buildAuthzApp } from "../common/testing/authz-e2e";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

Reflect.defineMetadata("design:paramtypes", [AuthService], AuthController);

const authService = { refresh: vi.fn() };
const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.secret";

describe("POST /auth/refresh — failure bodies the clients classify", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(
      [AuthController],
      [
        { provide: AuthService, useValue: authService },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    );
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(["Invalid or expired refresh token", "Malformed refresh token", "Account is not active"])(
    "a rejection (%s) is a 401 carrying the API envelope — the one shape clients sign out on",
    async (message) => {
      authService.refresh.mockRejectedValueOnce(new UnauthorizedException(message));
      const res = await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken: TOKEN });
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ statusCode: 401, message });
    },
  );

  it("an unexpected failure (a database blip) is a 500 — which clients treat as transient", async () => {
    authService.refresh.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    const res = await request(app.getHttpServer()).post("/auth/refresh").send({ refreshToken: TOKEN });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ statusCode: 500, message: "Internal server error" });
  });
});
