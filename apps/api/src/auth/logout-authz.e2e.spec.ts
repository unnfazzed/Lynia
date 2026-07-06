/**
 * HTTP-level authorization e2e for POST /auth/logout (gate LR1). Boots the REAL AuthController with the
 * REAL method-level JwtAuthGuard over real HTTP, with AuthService mocked. Regression net for logout
 * scoping: a valid bearer token is required — an unauthenticated caller cannot revoke a session.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bearer, buildAuthzApp } from "../common/testing/authz-e2e";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

Reflect.defineMetadata("design:paramtypes", [AuthService], AuthController);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const authService = { logout: vi.fn(async () => ({ ok: true })) };

describe("POST /auth/logout — HTTP authz", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp([AuthController], [{ provide: AuthService, useValue: authService }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 without a bearer token (logout requires a valid token)", async () => {
    const res = await request(app.getHttpServer()).post("/auth/logout").send({ sessionId: SESSION_ID });
    expect(res.status).toBe(401);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it("reaches the handler (non-401) with a valid bearer token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", bearer(USER_ID))
      .send({ sessionId: SESSION_ID });
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(201); // Nest POST default success status
    expect(authService.logout).toHaveBeenCalledWith(SESSION_ID, USER_ID);
  });
});
