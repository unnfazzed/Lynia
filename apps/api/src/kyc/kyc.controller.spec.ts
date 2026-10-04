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
 *  last event time passed (for the monotonic guard), the decline reason (IR26-07 score bands) and the
 *  vendor document number (IR26-04). `held` records recordHeldVerifiedId calls (D-75 item 2: a result
 *  held for review stores its document number); `heldUpdated` is the row count that call reports. */
function fakeRiders(updated = 1, heldUpdated = 1) {
  const calls: Array<[string, string]> = [];
  const held: Array<[string, string]> = [];
  let lastEventAt: Date | undefined;
  let lastReason: string | null | undefined;
  let lastDocNumber: string | null | undefined;
  const riders = {
    applyKycResult: async (ref: string, status: string, eventAt: Date, reason?: string | null, docNumber?: string | null) => {
      calls.push([ref, status]);
      lastEventAt = eventAt;
      lastReason = reason;
      lastDocNumber = docNumber;
      return { updated };
    },
    recordHeldVerifiedId: async (ref: string, docNumber: string) => {
      held.push([ref, docNumber]);
      return { updated: heldUpdated };
    },
  } as unknown as RiderService;
  return { riders, calls, held, eventAt: () => lastEventAt, reason: () => lastReason, docNumber: () => lastDocNumber };
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
    const { riders, calls, held } = fakeRiders();
    const raw = JSON.stringify({ session_id: "s_3", status: "In Review" });
    const res = await ctl(riders, {}).callback(req(raw));
    expect(res).toEqual({ ignored: true, status: "pending" });
    expect(calls).toEqual([]);
    // No document number in the payload, so there is nothing to store either (D-75 item 2).
    expect(held).toEqual([]);
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

  // IR26-07: our destination is V3, so the face match arrives as decision.face_matches[] on a 0–100
  // scale. These pin the KYC_THRESHOLDS bands on that shape end to end (sample data — no real session).
  const v3 = (session_id: string, status: string, score: number) =>
    JSON.stringify({
      session_id,
      status,
      webhook_type: "status.updated",
      decision: { status, face_matches: [{ node_id: "face_match_1", status, score, warnings: [] }] },
    });

  it("verifies a V3 Didit approval whose face match clears autoApprove", async () => {
    const { riders, calls } = fakeRiders();
    await ctl(riders, {}).callback(req(v3("s_v3a", "Approved", 96.1)));
    expect(calls).toEqual([["s_v3a", "verified"]]);
  });

  it("holds a V3 Didit approval whose face match is in the review band — no write, never verified", async () => {
    const { riders, calls } = fakeRiders();
    const res = await ctl(riders, {}).callback(req(v3("s_v3b", "Approved", 72)));
    expect(res).toEqual({ ignored: true, status: "pending" });
    expect(calls).toEqual([]);
  });

  it("declines a V3 Didit approval whose face match is below needsReview, with the face-mismatch reason", async () => {
    const { riders, calls, reason } = fakeRiders();
    await ctl(riders, {}).callback(req(v3("s_v3c", "Approved", 45)));
    expect(calls).toEqual([["s_v3c", "failed"]]);
    expect(reason()).toBe("face_mismatch");
  });

  it("never verifies a V3 Didit decline or abandoned session, however well the face matched", async () => {
    const declined = fakeRiders();
    await ctl(declined.riders, {}).callback(req(v3("s_v3d", "Declined", 97)));
    expect(declined.calls).toEqual([["s_v3d", "failed"]]);
    expect(declined.reason()).toBeNull();

    const abandoned = fakeRiders();
    const res = await ctl(abandoned.riders, {}).callback(req(v3("s_v3e", "Abandoned", 97)));
    expect(res).toEqual({ ignored: true, status: "pending" });
    expect(abandoned.calls).toEqual([]);
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

  // D-75 item 2 (IR26-09): a result held for review still carries the number Didit read from the
  // document. It's stored (recordHeldVerifiedId) for the reviewer and the hand approval that adopts it;
  // the decision stays unresolved, so applyKycResult never runs. Sample data, no real session.
  const heldV3 = (session_id: string, status: string, score: number | null, document = "63-123456-A-42") =>
    JSON.stringify({
      session_id,
      status,
      webhook_type: "status.updated",
      decision: {
        status,
        id_verifications: [{ node_id: "id_verification_1", status, document_number: document }],
        ...(score === null ? {} : { face_matches: [{ node_id: "face_match_1", status, score, warnings: [] }] }),
      },
    });

  describe("a result held for review (D-75 item 2)", () => {
    it("a Didit approval in the face-match review band stores the document number — still held, never applied", async () => {
      const { riders, calls, held } = fakeRiders();
      const res = await ctl(riders, {}).callback(req(heldV3("s_h1", "Approved", 72)));
      expect(held).toEqual([["s_h1", "63-123456-A-42"]]);
      expect(calls).toEqual([]);
      expect(res).toEqual({ ignored: true, status: "pending", verifiedIdStored: true });
    });

    it("Didit's In Review stores the document number too, whatever its spelling, with or without a score", async () => {
      for (const [status, score] of [
        ["In Review", null],
        ["In Review", 91],
        ["IN_REVIEW", 75],
      ] as const) {
        const { riders, calls, held } = fakeRiders();
        const res = await ctl(riders, {}).callback(req(heldV3("s_h2", status, score)));
        expect(held).toEqual([["s_h2", "63-123456-A-42"]]);
        expect(calls).toEqual([]);
        expect(res).toEqual({ ignored: true, status: "pending", verifiedIdStored: true });
      }
    });

    it("reports nothing stored when no undecided check has the session — still a 200, nothing applied", async () => {
      // A superseded or already-decided check, or an unknown session: the service matched no row.
      const { riders, calls, held } = fakeRiders(1, 0);
      const res = await ctl(riders, {}).callback(req(heldV3("s_h3", "Approved", 72)));
      expect(held).toEqual([["s_h3", "63-123456-A-42"]]);
      expect(calls).toEqual([]);
      expect(res).toEqual({ ignored: true, status: "pending", verifiedIdStored: false });
    });

    it("a held result with no document number stores nothing (approving it will adopt no number)", async () => {
      const { riders, calls, held } = fakeRiders();
      const res = await ctl(riders, {}).callback(req(v3("s_h4", "Approved", 72)));
      expect(held).toEqual([]);
      expect(calls).toEqual([]);
      expect(res).toEqual({ ignored: true, status: "pending" });
    });

    it("an unfinished session's partial data is not a judged result — its number is never stored", async () => {
      for (const status of ["Abandoned", "Expired", "In Progress", "Resubmitted", "Not Started"]) {
        const { riders, calls, held } = fakeRiders();
        const res = await ctl(riders, {}).callback(req(heldV3("s_h5", status, 97)));
        expect(held).toEqual([]);
        expect(calls).toEqual([]);
        expect(res).toEqual({ ignored: true, status: "pending" });
      }
    });

    it("an In Review whose face match is below needsReview is a decline, not a hold — applyKycResult takes it", async () => {
      const { riders, calls, held, reason } = fakeRiders();
      await ctl(riders, {}).callback(req(heldV3("s_h6", "In Review", 45)));
      expect(held).toEqual([]);
      expect(calls).toEqual([["s_h6", "failed"]]);
      expect(reason()).toBe("face_mismatch");
    });

    it("a clean Didit approval is applied, not held — the held path never sees it", async () => {
      const { riders, calls, held, docNumber } = fakeRiders();
      await ctl(riders, {}).callback(req(heldV3("s_h7", "Approved", 96)));
      expect(held).toEqual([]);
      expect(calls).toEqual([["s_h7", "verified"]]);
      expect(docNumber()).toBe("63-123456-A-42");
    });

    it("the signature and replay guards run first: a forged or stale held result stores nothing", async () => {
      const forged = fakeRiders();
      const raw = heldV3("s_h8", "Approved", 72);
      await expect(
        ctl(forged.riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(req(raw, { "x-signature-v2": "deadbeef", "x-timestamp": freshTs() })),
      ).rejects.toThrow(/invalid webhook signature/i);
      expect(forged.held).toEqual([]);

      const stale = fakeRiders();
      const old = String(Math.floor(Date.now() / 1000) - 600);
      await expect(
        ctl(stale.riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(req(raw, { "x-signature-v2": signV2(raw), "x-timestamp": old })),
      ).rejects.toThrow(/stale webhook timestamp/i);
      expect(stale.held).toEqual([]);

      // And a validly signed, fresh one is stored.
      const signed = fakeRiders();
      await ctl(signed.riders, { DIDIT_WEBHOOK_SECRET: SECRET }).callback(
        req(raw, { "x-signature-v2": signV2(raw), "x-timestamp": freshTs() }),
      );
      expect(signed.held).toEqual([["s_h8", "63-123456-A-42"]]);
    });

    it("a failed write is not swallowed — the webhook errors, so Didit retries the delivery", async () => {
      const { riders } = fakeRiders();
      (riders as unknown as { recordHeldVerifiedId: unknown }).recordHeldVerifiedId = async () => {
        throw new Error("db down");
      };
      await expect(ctl(riders, {}).callback(req(heldV3("s_h9", "Approved", 72)))).rejects.toThrow(/db down/);
    });
  });
});

describe("KycController.returnPage", () => {
  it("serves the branded post-verification landing with the app-scheme bounce", () => {
    const html = ctl(fakeRiders().riders, {}).returnPage();
    // The two halves the page exists for: a human-readable "go back to the app" landing, and the
    // lynia:// redirect that closes an in-app browser tab on older builds.
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Back to LyniaGo");
    expect(html).toContain('href="lynia://"');
    expect(html).toContain('location.href = "lynia://"');
  });

  it("reflects no request data — the page is a static constant", () => {
    const c = ctl(fakeRiders().riders, {});
    // Two calls, byte-identical: nothing about the caller can reach the markup.
    expect(c.returnPage()).toBe(c.returnPage());
  });
});
