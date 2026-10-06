/**
 * First Run v2 F · the ID-check outcome mapping (ledger D-80): every server KYC state lands on exactly one
 * page — F1–F8, R2 (the automated check, Calm Mint v2 stays) or R1 (no rider record, G1) — and the non-KYC
 * gates are left to their Rider v2 walls.
 */
import { KycDeclineReason } from "@lynia/shared";
import { resolveKycGate, type KycGateRider } from "../gates";
import { declineVariant, kycScreenFor } from "../kyc-outcome";
import { resolveGate } from "../rider-gate";

/** The board's own pipeline: rider → KYC wall → gate → screen. */
function screen(rider: KycGateRider | null, opts: { launch?: "completed" | "failed" | "cancelled" | null; server?: Parameters<typeof resolveGate>[0]["server"] } = {}) {
  const launch = opts.launch ?? null;
  const verified = rider?.kycStatus === "verified";
  const kyc = verified ? null : resolveKycGate(rider, launch);
  const gate = resolveGate({ kyc, server: opts.server ?? null, locDenied: false });
  return kycScreenFor({ gate, kyc, launch, declineReason: rider?.kycDeclineReason });
}

const auto = { kycMode: "auto" as const };

describe("kycScreenFor — server state → First Run v2 page", () => {
  it("no rider record → R1 (G1: the board's 'Earn with your bike' interstitial is gone)", () => {
    expect(screen(null)).toEqual({ kind: "become" });
  });

  it("F8: a check the rider just submitted (fresh completed launch), before R2", () => {
    expect(screen({ kycStatus: "pending", ...auto, kycPendingState: "unfinished" }, { launch: "completed" })).toEqual({ kind: "outcome", id: "F8" });
    expect(screen({ kycStatus: "pending", ...auto, kycPendingState: "in_flight" }, { launch: "completed" })).toEqual({ kind: "outcome", id: "F8" });
  });

  it("R2 stays while the automated check is with the vendor (no fresh launch)", () => {
    expect(screen({ kycStatus: "pending", ...auto, kycPendingState: "in_flight" })).toEqual({ kind: "r2" });
  });

  it("F1: manual (ops) review", () => {
    expect(screen({ kycStatus: "pending", kycMode: "manual" })).toEqual({ kind: "outcome", id: "F1" });
  });

  it("F2: held for a person — outranks a fresh launch and the vendor's in-flight read", () => {
    expect(screen({ kycStatus: "pending", ...auto, kycHeld: true, kycPendingState: "in_flight" })).toEqual({ kind: "outcome", id: "F2" });
    expect(screen({ kycStatus: "pending", ...auto, kycHeld: true }, { launch: "completed" })).toEqual({ kind: "outcome", id: "F2" });
  });

  it("F3: unfinished — and an API that sends no pending state", () => {
    expect(screen({ kycStatus: "pending", ...auto, kycPendingState: "unfinished" })).toEqual({ kind: "outcome", id: "F3" });
    expect(screen({ kycStatus: "pending", ...auto })).toEqual({ kind: "outcome", id: "F3" });
    expect(screen({ kycStatus: "pending", ...auto }, { launch: "cancelled" })).toEqual({ kind: "outcome", id: "F3" });
  });

  it("F4a–d: a decline below the lock, by reason", () => {
    const declined = (reason: string | null) => screen({ kycStatus: "failed", ...auto, kycAttempts: 1, kycDeclineReason: reason });
    expect(declined("id_unreadable")).toEqual({ kind: "outcome", id: "F4a" });
    expect(declined("face_mismatch")).toEqual({ kind: "outcome", id: "F4b" });
    expect(declined("liveness_failed")).toEqual({ kind: "outcome", id: "F4b" });
    expect(declined("id_expired")).toEqual({ kind: "outcome", id: "F4c" });
    expect(declined("doc_tampered")).toEqual({ kind: "outcome", id: "F4c" });
    expect(declined("name_mismatch")).toEqual({ kind: "outcome", id: "F4d" });
    expect(declined("duplicate")).toEqual({ kind: "outcome", id: "F4d" });
    expect(declined("other")).toEqual({ kind: "outcome", id: "F4d" });
    expect(declined(null)).toEqual({ kind: "outcome", id: "F4d" });
  });

  it("every shared decline reason maps to one of the four variants", () => {
    for (const r of Object.values(KycDeclineReason)) expect(["F4a", "F4b", "F4c", "F4d"]).toContain(declineVariant(r));
    expect(declineVariant("a-reason-a-newer-server-added")).toBe("F4d");
  });

  it("F5: both tries used — whatever the reason", () => {
    expect(screen({ kycStatus: "failed", ...auto, kycAttempts: 2, kycDeclineReason: "id_unreadable" })).toEqual({ kind: "outcome", id: "F5" });
  });

  it("F6: the ID expired — from the record, or from the server's go-online refusal", () => {
    expect(screen({ kycStatus: "expired", ...auto })).toEqual({ kind: "outcome", id: "F6" });
    expect(screen({ kycStatus: "verified", ...auto }, { server: "kyc_expired" })).toEqual({ kind: "outcome", id: "F6" });
  });

  it("F3 for the server's plain KYC refusal on a rider the app still thinks verified", () => {
    expect(screen({ kycStatus: "verified", ...auto }, { server: "kyc" })).toEqual({ kind: "outcome", id: "F3" });
  });

  it("F7: the check couldn't open on this phone", () => {
    expect(screen({ kycStatus: "pending", ...auto, kycPendingState: "unfinished" }, { launch: "failed" })).toEqual({ kind: "outcome", id: "F7" });
  });

  it("a terminal decline outranks the last launch (the rider must see the decline)", () => {
    expect(screen({ kycStatus: "failed", ...auto, kycAttempts: 1, kycDeclineReason: "face_mismatch" }, { launch: "completed" })).toEqual({ kind: "outcome", id: "F4b" });
  });

  it("non-KYC gates and a clear board are not ID-check pages", () => {
    expect(screen({ kycStatus: "verified", ...auto })).toBeNull();
    for (const server of ["suspended", "banned", "on_hold", "cooldown", "out_of_area", "location_required", "commission_low_balance"] as const) {
      expect(screen({ kycStatus: "verified", ...auto }, { server })).toBeNull();
    }
  });
});
