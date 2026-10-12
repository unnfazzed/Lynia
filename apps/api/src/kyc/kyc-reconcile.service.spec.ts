import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { RiderService } from "../riders/rider.service";
import type { MetricsService } from "../observability/metrics.service";
import { KycPendingStateService } from "./kyc-pending-state.service";
import { KYC_RECONCILE_BACKOFF_MS, KYC_RECONCILE_BATCH, KYC_RECONCILE_MIN_AGE_MS, KycReconcileService } from "./kyc-reconcile.service";
import type { KycVendor } from "./kyc-vendor";

const DIDIT = { KYC_PROVIDER: "didit", KYC_MODE: "auto" } as Env;

/** A RiderService fake recording what the shared decision path writes. */
function fakeRiders(candidates: Array<{ profileId: string; kycRef: string; kycVendorStatus: string | null }>) {
  const applied: unknown[][] = [];
  const vendorStatuses: unknown[][] = [];
  const held: unknown[][] = [];
  const riders = {
    // Honours the back-off exclusion like the SQL does.
    kycReconcileCandidates: vi.fn(async (_olderThan: Date, _limit: number, exclude: readonly string[]) => candidates.filter((c) => !exclude.includes(c.kycRef))),
    kycOldestPendingSince: vi.fn(async (): Promise<Date | null> => null),
    applyKycResult: vi.fn(async (...a: unknown[]) => (applied.push(a), { updated: 1 })),
    recordKycVendorStatus: vi.fn(async (...a: unknown[]) => (vendorStatuses.push(a), { updated: 1 })),
    recordHeldVerifiedId: vi.fn(async (...a: unknown[]) => (held.push(a), { updated: 1 })),
    kycSessionOwner: vi.fn(async (_ref: string): Promise<string | null> => "p1"),
    expireLapsedIds: vi.fn(async () => ({ expired: 0 })),
  };
  return { riders: riders as unknown as RiderService & typeof riders, applied, vendorStatuses, held };
}
const vendorWith = (decisions: Record<string, unknown>): KycVendor => ({
  submit: vi.fn(),
  sessionDecision: vi.fn(async (ref: string) => decisions[ref] ?? null),
});

describe("KycReconcileService.reconcileLostWebhooks (KYC-R26-03)", () => {
  it("asks only for checks quiet for 15 min, in a bounded page", async () => {
    const { riders } = fakeRiders([]);
    const now = new Date("2026-10-12T10:00:00Z");
    await new KycReconcileService(riders, vendorWith({}), DIDIT).reconcileLostWebhooks(now);
    expect(riders.kycReconcileCandidates).toHaveBeenCalledWith(new Date(now.getTime() - KYC_RECONCILE_MIN_AGE_MS), KYC_RECONCILE_BATCH, []);
  });

  it("applies a lost Approved through the webhook's path — face-match score and document fields from the decision", async () => {
    const { riders, applied } = fakeRiders([{ profileId: "p1", kycRef: "sess_1", kycVendorStatus: null }]);
    // The decision endpoint returns per-feature results at the TOP level (the webhook nests them under `decision`).
    const vendor = vendorWith({
      sess_1: {
        status: "Approved",
        vendor_data: "p1",
        face_matches: [{ score: 97 }],
        id_verifications: [{ document_number: "63-123456-A-42", expiration_date: "2031-01-01" }],
      },
    });
    expect(await new KycReconcileService(riders, vendor, DIDIT).reconcileLostWebhooks()).toEqual({ checked: 1, applied: 1 });
    expect(applied).toHaveLength(1);
    const [ref, status, , reason, doc, expiry] = applied[0]!;
    expect([ref, status, reason, doc]).toEqual(["sess_1", "verified", null, "63-123456-A-42"]);
    expect((expiry as Date).toISOString()).toBe("2031-01-01T00:00:00.000Z");
  });

  it("KYC-R26-12: nothing is held — an old review-band score verifies, a sub-threshold one declines face_mismatch, In Review declines — same cut as the webhook", async () => {
    const band = fakeRiders([{ profileId: "p1", kycRef: "sess_1", kycVendorStatus: null }]);
    await new KycReconcileService(band.riders, vendorWith({ sess_1: { status: "Approved", face_matches: [{ score: 72 }] } }), DIDIT).reconcileLostWebhooks();
    expect(band.applied[0]!.slice(0, 2)).toEqual(["sess_1", "verified"]);
    expect(band.vendorStatuses).toEqual([]);
    expect(band.held).toEqual([]);

    const review = fakeRiders([{ profileId: "p1", kycRef: "sess_1", kycVendorStatus: null }]);
    await new KycReconcileService(review.riders, vendorWith({ sess_1: { status: "In Review", face_matches: [{ score: 95 }] } }), DIDIT).reconcileLostWebhooks();
    expect(review.applied[0]!.slice(0, 2)).toEqual(["sess_1", "failed"]);
    expect(review.applied[0]![3]).toBe("other");
    expect(review.held).toEqual([]);

    const low = fakeRiders([{ profileId: "p1", kycRef: "sess_1", kycVendorStatus: null }]);
    await new KycReconcileService(low.riders, vendorWith({ sess_1: { status: "Approved", face_matches: [{ score: 20 }] } }), DIDIT).reconcileLostWebhooks();
    expect(low.applied[0]!.slice(0, 2)).toEqual(["sess_1", "failed"]);
    expect(low.applied[0]![3]).toBe("face_mismatch");
  });

  it("Declined and Kyc Expired apply; Abandoned / Expired are recorded as dead sessions like the webhook does", async () => {
    const { riders, applied, vendorStatuses } = fakeRiders([
      { profileId: "p1", kycRef: "s_dec", kycVendorStatus: null },
      { profileId: "p2", kycRef: "s_kexp", kycVendorStatus: null },
      { profileId: "p3", kycRef: "s_ab", kycVendorStatus: null },
      { profileId: "p4", kycRef: "s_exp", kycVendorStatus: "In Progress" },
    ]);
    const vendor = vendorWith({
      s_dec: { status: "Declined" },
      s_kexp: { status: "Kyc Expired" },
      s_ab: { status: "Abandoned" },
      s_exp: { status: "Expired" },
    });
    await new KycReconcileService(riders, vendor, DIDIT).reconcileLostWebhooks();
    expect(applied.map((a) => a.slice(0, 2))).toEqual([["s_dec", "failed"], ["s_kexp", "expired"]]);
    expect(vendorStatuses.map((a) => a.slice(0, 2))).toEqual([["s_ab", "Abandoned"], ["s_exp", "Expired"]]);
  });

  it("leaves a check still in the biker's hands alone", async () => {
    const { riders, applied, vendorStatuses } = fakeRiders([
      { profileId: "p1", kycRef: "s_ip", kycVendorStatus: null },
      { profileId: "p2", kycRef: "s_rs", kycVendorStatus: null },
      { profileId: "p4", kycRef: "s_gone", kycVendorStatus: null },
    ]);
    const vendor = vendorWith({ s_ip: { status: "In Progress" }, s_rs: { status: "Resubmitted" } });
    expect(await new KycReconcileService(riders, vendor, DIDIT).reconcileLostWebhooks()).toEqual({ checked: 3, applied: 0 });
    expect(applied).toEqual([]);
    expect(vendorStatuses).toEqual([]);
  });

  it("KYC-R26-12: drains a biker stored as In Review before decisions went automatic — declined, not skipped", async () => {
    const { riders, applied } = fakeRiders([{ profileId: "p3", kycRef: "s_ir", kycVendorStatus: "In Review" }]);
    const vendor = vendorWith({ s_ir: { status: "In Review" } });
    expect(await new KycReconcileService(riders, vendor, DIDIT).reconcileLostWebhooks()).toEqual({ checked: 1, applied: 1 });
    const [ref, status, , reason] = applied[0]!;
    expect([ref, status, reason]).toEqual(["s_ir", "failed", "other"]);
  });

  it("refuses a decision whose vendor_data names another biker (KYC-R26-07, shared path)", async () => {
    const { riders, applied } = fakeRiders([{ profileId: "p1", kycRef: "sess_1", kycVendorStatus: null }]);
    await new KycReconcileService(riders, vendorWith({ sess_1: { status: "Approved", vendor_data: "p_other" } }), DIDIT).reconcileLostWebhooks();
    expect(applied).toEqual([]);
  });

  it("only in didit + auto mode, with a vendor that can read decisions", async () => {
    for (const env of [{ KYC_PROVIDER: "stub", KYC_MODE: "auto" }, { KYC_PROVIDER: "didit", KYC_MODE: "manual" }] as Env[]) {
      const { riders } = fakeRiders([]);
      await new KycReconcileService(riders, vendorWith({}), env).reconcileLostWebhooks();
      expect(riders.kycReconcileCandidates).not.toHaveBeenCalled();
    }
    const { riders } = fakeRiders([]);
    await new KycReconcileService(riders, { submit: vi.fn() }, DIDIT).reconcileLostWebhooks();
    expect(riders.kycReconcileCandidates).not.toHaveBeenCalled();
  });

  it("never throws: a failing candidate query, a failing biker, a failing vendor", async () => {
    const broken = fakeRiders([]);
    broken.riders.kycReconcileCandidates.mockRejectedValueOnce(new Error("db down"));
    await expect(new KycReconcileService(broken.riders, vendorWith({}), DIDIT).reconcileLostWebhooks()).resolves.toEqual({ checked: 0, applied: 0 });

    const partial = fakeRiders([
      { profileId: "p1", kycRef: "s_bad", kycVendorStatus: null },
      { profileId: "p2", kycRef: "s_ok", kycVendorStatus: null },
    ]);
    partial.riders.applyKycResult.mockRejectedValueOnce(new Error("deadlock"));
    const vendor = vendorWith({ s_bad: { status: "Approved" }, s_ok: { status: "Declined" } });
    expect(await new KycReconcileService(partial.riders, vendor, DIDIT).reconcileLostWebhooks()).toEqual({ checked: 2, applied: 1 });

    const throwingVendor: KycVendor = { submit: vi.fn(), sessionDecision: vi.fn(async () => { throw new Error("boom"); }) };
    const v = fakeRiders([{ profileId: "p1", kycRef: "s", kycVendorStatus: null }]);
    await expect(new KycReconcileService(v.riders, throwingVendor, DIDIT).reconcileLostWebhooks()).resolves.toEqual({ checked: 1, applied: 0 });
  });

  it("a read that decides nothing backs off — excluded from the next ticks, doubling — so the oldest-first queue moves on", async () => {
    const { riders } = fakeRiders([
      { profileId: "p1", kycRef: "s_ip", kycVendorStatus: null },
      { profileId: "p2", kycRef: "s_none", kycVendorStatus: null },
      { profileId: "p3", kycRef: "s_dec", kycVendorStatus: null },
    ]);
    const svc = new KycReconcileService(riders, vendorWith({ s_ip: { status: "In Progress" }, s_dec: { status: "Declined" } }), DIDIT);
    const t0 = new Date("2026-10-12T10:00:00Z");
    await svc.reconcileLostWebhooks(t0);
    // The mid-check and the unreadable session back off; the decided one doesn't (it left the queue).
    await svc.reconcileLostWebhooks(new Date(t0.getTime() + 60_000));
    expect([...riders.kycReconcileCandidates.mock.calls[1]![2]].sort()).toEqual(["s_ip", "s_none"]);
    // After the first back-off (one interval) they're eligible again…
    await svc.reconcileLostWebhooks(new Date(t0.getTime() + KYC_RECONCILE_BACKOFF_MS + 1));
    expect(riders.kycReconcileCandidates.mock.calls[2]![2]).toEqual([]);
    // …and a second miss doubles the wait.
    const t2 = t0.getTime() + KYC_RECONCILE_BACKOFF_MS + 1;
    await svc.reconcileLostWebhooks(new Date(t2 + KYC_RECONCILE_BACKOFF_MS + 1));
    expect([...riders.kycReconcileCandidates.mock.calls[3]![2]].sort()).toEqual(["s_ip", "s_none"]);
  });

  it("counts what it applied (kyc_reconcile_applied_total{source=sweep}) and decisions that match no biker", async () => {
    const { riders } = fakeRiders([
      { profileId: "p1", kycRef: "s_dec", kycVendorStatus: null },
      { profileId: "p2", kycRef: "s_gone", kycVendorStatus: null },
    ]);
    riders.applyKycResult.mockImplementation(async (ref: unknown) => ({ updated: ref === "s_dec" ? 1 : 0 }));
    riders.kycSessionOwner.mockImplementation(async (ref: unknown) => (ref === "s_gone" ? null : "p1"));
    const metrics = { incKycReconcileApplied: vi.fn(), incKycDecisionUnmatched: vi.fn(), recordKycOldestPendingAge: vi.fn() };
    const svc = new KycReconcileService(
      riders,
      vendorWith({ s_dec: { status: "Declined" }, s_gone: { status: "Approved" } }),
      DIDIT,
      undefined,
      metrics as unknown as MetricsService,
    );
    await svc.reconcileLostWebhooks();
    expect(metrics.incKycReconcileApplied).toHaveBeenCalledTimes(1);
    expect(metrics.incKycReconcileApplied).toHaveBeenCalledWith("sweep");
    expect(metrics.incKycDecisionUnmatched).toHaveBeenCalledWith("sweep");
  });

  it("observes the oldest pending check's age every tick (kyc_oldest_pending_age_seconds)", async () => {
    const { riders } = fakeRiders([]);
    const now = new Date("2026-10-12T10:00:00Z");
    riders.kycOldestPendingSince.mockResolvedValueOnce(new Date(now.getTime() - 7_200_000)).mockResolvedValueOnce(null);
    const metrics = { incKycReconcileApplied: vi.fn(), incKycDecisionUnmatched: vi.fn(), recordKycOldestPendingAge: vi.fn() };
    const svc = new KycReconcileService(riders, vendorWith({}), DIDIT, undefined, metrics as unknown as MetricsService);
    await svc.reconcileLostWebhooks(now);
    await svc.reconcileLostWebhooks(now);
    expect(metrics.recordKycOldestPendingAge.mock.calls).toEqual([[7200], [null]]);
  });
});

describe("KycReconcileService.reconcileFromPoll — /auth/me's read of a decided session (item 1)", () => {
  const metricsFake = () => ({ incKycReconcileApplied: vi.fn(), incKycDecisionUnmatched: vi.fn(), recordKycOldestPendingAge: vi.fn() });

  it("applies a decided status from the poll's OWN body — no second vendor call", async () => {
    const { riders, applied } = fakeRiders([]);
    const vendor = vendorWith({});
    const metrics = metricsFake();
    const svc = new KycReconcileService(riders, vendor, DIDIT, undefined, metrics as unknown as MetricsService);
    const body = { status: "Approved", vendor_data: "p1", face_matches: [{ score: 97 }], id_verifications: [{ document_number: "63-123456-A-42" }] };
    expect(await svc.reconcileFromPoll("sess_1", "Approved", body)).toBe(true);
    expect(applied.map((a) => a.slice(0, 2))).toEqual([["sess_1", "verified"]]);
    expect(applied[0]![4]).toBe("63-123456-A-42");
    expect(vendor.sessionDecision).not.toHaveBeenCalled();
    expect(metrics.incKycReconcileApplied).toHaveBeenCalledWith("poll");
  });

  it("single-flight per session, then a cooldown: a burst of polls applies once", async () => {
    const { riders, applied } = fakeRiders([]);
    let release!: () => void;
    riders.applyKycResult.mockImplementationOnce(async (...a: unknown[]) => {
      await new Promise<void>((r) => (release = r));
      applied.push(a);
      return { updated: 1 };
    });
    const svc = new KycReconcileService(riders, vendorWith({}), DIDIT);
    const first = svc.reconcileFromPoll("sess_1", "Declined", { status: "Declined" });
    expect(await svc.reconcileFromPoll("sess_1", "Declined", { status: "Declined" })).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    release();
    expect(await first).toBe(true);
    // Within the cooldown a further poll does nothing.
    expect(await svc.reconcileFromPoll("sess_1", "Declined", { status: "Declined" })).toBe(false);
    expect(applied).toHaveLength(1);
    // Another session is independent.
    expect(await svc.reconcileFromPoll("sess_2", "Declined", { status: "Declined" })).toBe(true);
  });

  it("never throws, and is off outside didit + auto", async () => {
    const { riders } = fakeRiders([]);
    riders.applyKycResult.mockRejectedValueOnce(new Error("deadlock"));
    await expect(new KycReconcileService(riders, vendorWith({}), DIDIT).reconcileFromPoll("s", "Declined", {})).resolves.toBe(false);
    const off = fakeRiders([]);
    await new KycReconcileService(off.riders, vendorWith({}), { KYC_PROVIDER: "didit", KYC_MODE: "manual" } as Env).reconcileFromPoll("s", "Declined", {});
    expect(off.riders.applyKycResult).not.toHaveBeenCalled();
  });

  it("registers with the pending-state reader on init, and a decided read there reaches the decision path", async () => {
    const { riders, applied } = fakeRiders([]);
    const states = new KycPendingStateService({
      submit: vi.fn(),
      sessionRead: vi.fn(async () => ({ status: "Declined", decision: { status: "Declined" } })),
    });
    const svc = new KycReconcileService(riders, vendorWith({}), DIDIT, states);
    svc.onModuleInit();
    try {
      expect(await states.read("sess_9")).toBe("in_flight");
      await new Promise((r) => setTimeout(r, 0));
      expect(applied.map((a) => a.slice(0, 2))).toEqual([["sess_9", "failed"]]);
    } finally {
      svc.onModuleDestroy();
    }
  });
});

describe("KycReconcileService.sweepExpiredIds (KYC-R26-08)", () => {
  it("delegates to RiderService.expireLapsedIds and never throws", async () => {
    const { riders } = fakeRiders([]);
    riders.expireLapsedIds.mockResolvedValueOnce({ expired: 2 });
    const svc = new KycReconcileService(riders, vendorWith({}), DIDIT);
    expect(await svc.sweepExpiredIds()).toEqual({ expired: 2 });
    riders.expireLapsedIds.mockRejectedValueOnce(new Error("db down"));
    expect(await svc.sweepExpiredIds()).toEqual({ expired: 0 });
  });
});
