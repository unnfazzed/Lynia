import { createHmac } from "node:crypto";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { RiderService } from "../riders/rider.service";
import { canonicalizeDiditBody } from "./didit";
import { KycController } from "./kyc.controller";

const SECRET = "whsec_test_0123456789";

/** Fake req carrying the raw body the HMAC is computed over, plus headers. */
function req(raw: string, headers: Record<string, string> = {}): RawBodyRequest<Request> {
  return { rawBody: Buffer.from(raw, "utf8"), headers } as unknown as RawBodyRequest<Request>;
}

/** Legacy X-Signature: HMAC over the raw bytes. */
function sign(raw: string): string {
  return createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
}
/** X-Signature-V2: HMAC over the canonical body. */
function signV2(raw: string): string {
  return createHmac("sha256", SECRET).update(canonicalizeDiditBody(raw), "utf8").digest("hex");
}
/** A current X-Timestamp (Unix seconds) so the fail-closed freshness check passes. */
const freshTs = (): string => String(Math.floor(Date.now() / 1000));

/** Records applyKycResult calls so we can assert it fires only for terminal statuses. */
function fakeRiders() {
  const calls: Array<[string, string]> = [];
  const riders = {
    applyKycResult: async (ref: string, status: string) => {
      calls.push([ref, status]);
      return { updated: 1 };
    },
  } as unknown as RiderService;
  return { riders, calls };
}

const ctl = (riders: RiderService, env: Partial<Env>) => new KycController(riders, env as Env);

describe("KycController.callback", () => {
  it("applies a terminal status when no webhook secret is configured (signature skipped)", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_1", status: "Approved" });
    const res = await ctl(riders, { DIDIT_WEBHOOK_SECRET: undefined }).callback(req(raw));
    expect(res).toEqual({ updated: 1 });
    expect(calls).toEqual([["s_1", "verified"]]);
  });

  it("rejects a bad signature when a secret is set", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_1", status: "Approved" });
    await expect(
      ctl(riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(req(raw, { "x-signature": "deadbeef" })),
    ).rejects.toThrow(/invalid webhook signature/i);
    expect(calls).toEqual([]);
  });

  it("accepts a valid X-Signature-V2 + fresh timestamp and applies the result", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_2", status: "Declined" });
    const res = await ctl(riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(
      req(raw, { "x-signature-v2": signV2(raw), "x-timestamp": freshTs() }),
    );
    expect(res).toEqual({ updated: 1 });
    expect(calls).toEqual([["s_2", "failed"]]);
  });

  it("accepts the legacy raw X-Signature when no V2 header is present", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_2b", status: "Approved" });
    const res = await ctl(riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(
      req(raw, { "x-signature": sign(raw), "x-timestamp": freshTs() }),
    );
    expect(res).toEqual({ updated: 1 });
    expect(calls).toEqual([["s_2b", "verified"]]);
  });

  it("rejects a valid signature with a stale timestamp (replay guard)", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_2c", status: "Approved" });
    const stale = String(Math.floor(Date.now() / 1000) - 600); // 10 min old
    await expect(
      ctl(riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(
        req(raw, { "x-signature-v2": signV2(raw), "x-timestamp": stale }),
      ),
    ).rejects.toThrow(/stale webhook timestamp/i);
    expect(calls).toEqual([]);
  });

  it("rejects an invalid JSON body", async () => {
    const { riders } = fakeRiders();
    await expect(ctl(riders, {}).callback(req("not-json"))).rejects.toThrow(/invalid json/i);
  });

  it("rejects a body missing session_id or status", async () => {
    const { riders } = fakeRiders();
    await expect(ctl(riders, {}).callback(req(JSON.stringify({ status: "Approved" })))).rejects.toThrow(/missing/i);
  });

  it("ignores a non-terminal status without touching the rider", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_3", status: "In Review" });
    const res = await ctl(riders, {}).callback(req(raw));
    expect(res).toEqual({ ignored: true, status: "pending" });
    expect(calls).toEqual([]);
  });
});
