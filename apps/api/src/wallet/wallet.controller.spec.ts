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
  // getLedger is only reached on the well-formed-cursor path; a malformed ?cursor= is rejected by the
  // optional ParseUUIDPipe before the service is consulted.
  getLedger: vi.fn(async (_id: string, _cursor?: string) => ({ entries: [], nextCursor: undefined })),
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

// The ?cursor= query param is a ledger-row @db.Uuid id. Before the optional ParseUUIDPipe, a malformed
// cursor reached Prisma and 500'd (same class as DS18-05, but the query-param vector DS18-05 did not cover).
describe("GET /wallet/ledger?cursor — optional ParseUUIDPipe", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp([WalletController], [{ provide: WalletService, useValue: wallet }]);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("400 (not 500) for a malformed, non-UUID cursor", async () => {
    wallet.getLedger.mockClear();
    const res = await request(app.getHttpServer())
      .get("/wallet/ledger?cursor=not-a-uuid")
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).toBe(400);
    expect(wallet.getLedger).not.toHaveBeenCalled();
  });

  it("200 with no cursor (first page)", async () => {
    wallet.getLedger.mockClear();
    const res = await request(app.getHttpServer())
      .get("/wallet/ledger")
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).toBe(200);
    expect(wallet.getLedger).toHaveBeenCalledWith(RIDER_ID, undefined);
  });

  it("200 and forwards a well-formed UUID cursor to the service", async () => {
    wallet.getLedger.mockClear();
    const res = await request(app.getHttpServer())
      .get(`/wallet/ledger?cursor=${TOPUP_ID}`)
      .set("Authorization", bearer(RIDER_ID, "rider"));
    expect(res.status).toBe(200);
    expect(wallet.getLedger).toHaveBeenCalledWith(RIDER_ID, TOPUP_ID);
  });
});
