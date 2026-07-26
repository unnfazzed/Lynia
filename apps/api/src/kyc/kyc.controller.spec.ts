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

/** Records applyKycResult calls so we can assert it fires only for terminal statuses, plus the
 *  last event time passed (for the monotonic guard) and the vendor document number (IR26-04). */
function fakeRiders(updated = 1) {
  const calls: Array<[string, string]> = [];
  let lastEventAt: Date | undefined;
  let lastDocNumber: string | null | undefined;
  const riders = {
    applyKycResult: async (ref: string, status: string, eventAt: Date, _reason?: string | null, docNumber?: string | null) => {
      calls.push([ref, status]);
      lastEventAt = eventAt;
      lastDocNumber = docNumber;
      return { updated };
    },
  } as unknown as RiderService;
  return { riders, calls, eventAt: () => lastEventAt, docNumber: () => lastDocNumber };
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

  // IR26-04: the vendor-verified document number rides the decision payload into applyKycResult, so the
  // service can dedupe on what the vendor SAW rather than what the applicant typed. Absent → null, and
  // the service degrades to typed-ID-only behavior.
  it("passes the extracted document number through to applyKycResult (null when the payload omits it)", async () => {
    const withDoc = fakeRiders();
    const rawDoc = JSON.stringify({
      session_id: "s_doc",
      status: "Approved",
      decision: { id_verification: { document_number: "63-123456-A-42" } },
    });
    await ctl(withDoc.riders, { DIDIT_WEBHOOK_SECRET: undefined }).callback(req(rawDoc));
    expect(withDoc.docNumber()).toBe("63-123456-A-42");

    const withoutDoc = fakeRiders();
    const rawBare = JSON.stringify({ session_id: "s_bare", status: "Approved" });
    await ctl(withoutDoc.riders, { DIDIT_WEBHOOK_SECRET: undefined }).callback(req(rawBare));
    expect(withoutDoc.docNumber()).toBeNull();
  });

  it("maps Didit's \"Kyc Expired\" to the terminal `expired` state (1·b2)", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_exp", status: "Kyc Expired" });
    const res = await ctl(riders, { DIDIT_WEBHOOK_SECRET: undefined }).callback(req(raw));
    expect(res).toEqual({ updated: 1 });
    expect(calls).toEqual([["s_exp", "expired"]]);
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

  it("refuses to process unsigned webhooks when KYC_PROVIDER=didit but no secret is set (fail-closed)", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_4", status: "Approved" });
    await expect(
      ctl(riders, { KYC_PROVIDER: "didit", DIDIT_WEBHOOK_SECRET: undefined }).callback(req(raw)),
    ).rejects.toThrow(/not configured/i);
    expect(calls).toEqual([]);
  });

  it("refuses an unsigned webhook in PRODUCTION even for a non-didit provider (F-N3 fail-closed widening)", async () => {
    const { riders, calls } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_4b", status: "Approved" });
    // Prod permits KYC_PROVIDER=stub + KYC_MODE=manual; the callback must still refuse an unsigned body
    // rather than let anyone flip a rider by session_id.
    await expect(
      ctl(riders, { NODE_ENV: "production", KYC_PROVIDER: "stub", DIDIT_WEBHOOK_SECRET: undefined }).callback(req(raw)),
    ).rejects.toThrow(/not configured/i);
    expect(calls).toEqual([]);
  });

  it("passes the signed event timestamp through as the monotonic-guard event time", async () => {
    const { riders, eventAt } = fakeRiders();
    const ts = 1_750_000_000; // Unix seconds
    const raw = JSON.stringify({ session_id: "s_5", status: "Approved", timestamp: ts });
    await ctl(riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(
      req(raw, { "x-signature-v2": signV2(raw), "x-timestamp": freshTs() }),
    );
    expect(eventAt()).toEqual(new Date(ts * 1000));
  });
});
