/**
 * HTTP-level regression for DS18-05: GET /wallet/topups/:id must reject a malformed (non-UUID) id with a
 * clean 400, not a generic 500. TopUp.id is a Postgres @db.Uuid column, so before ParseUUIDPipe was added a
 * non-UUID string reached Prisma and threw an unhandled PrismaClientKnownRequestError (22P02) that
 * AllExceptionsFilter coerced into a 500. This boots the REAL WalletController + REAL JwtAuthGuard +
 * REAL ParseUUIDPipe over real HTTP (supertest), with only WalletService mocked — the same harness the
 * orders/offers authz e2e specs use. Guards run before pipes in Nest, so a valid bearer is minted first;
 * the malformed :id is then rejected by the pipe before WalletService is ever consulted.
 */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bearer, buildAuthzApp } from "../common/testing/authz-e2e";
import { WalletController } from "./wallet.controller";
import { WalletService } from "./wallet.service";

Reflect.defineMetadata("design:paramtypes", [WalletService], WalletController);

const RIDER_ID = "11111111-1111-4111-8111-111111111111";
const TOPUP_ID = "2f1e9b3c-0000-4000-8000-000000000001";

// getTopup is only reached on the well-formed-id path; on a malformed id the pipe rejects first, so this
// spy must NOT be called in the 400 case.
const wallet = {
  getTopup: vi.fn(async (_id: string, topupId: string) => ({ id: topupId, status: "pending" })),
};

describe("GET /wallet/topups/:id — ParseUUIDPipe (DS18-05)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp([WalletController], [{ provide: WalletService, useValue: wallet }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("401 when no Authorization header is sent (guard runs before the pipe)", async () => {
    const res = await request(app.getHttpServer()).get(`/wallet/topups/${TOPUP_ID}`);
    expect(res.status).toBe(401);
  });

  it("400 (not 500) for a malformed, non-UUID topup id", async () => {
    const res = await request(app.getHttpServer())
      .get("/wallet/topups/not-a-uuid")
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).toBe(400);
    // The pipe short-circuits before the service — a malformed id never reaches Prisma.
    expect(wallet.getTopup).not.toHaveBeenCalled();
  });

  it("passes a well-formed UUID through to the service (200)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/wallet/topups/${TOPUP_ID}`)
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: TOPUP_ID, status: "pending" });
    expect(wallet.getTopup).toHaveBeenCalledWith(RIDER_ID, TOPUP_ID);
  });
});
