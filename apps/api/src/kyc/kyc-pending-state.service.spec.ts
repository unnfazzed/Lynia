import { beforeEach, describe, expect, it, vi } from "vitest";
import { KYC_PENDING_STATE_TTL_MS, KycPendingStateService } from "./kyc-pending-state.service";
import type { ServerKycPendingState } from "./kyc-pending-state";
import type { KycSubmission, KycVendor } from "./kyc-vendor";

/** A vendor whose `pendingState` is scripted per call, counting how many times it was actually hit. */
function vendorReturning(...answers: (ServerKycPendingState | Error)[]) {
  const calls: string[] = [];
  let i = 0;
  const vendor: KycVendor = {
    async submit(): Promise<KycSubmission> {
      throw new Error("not used in these specs");
    },
    async pendingState(ref: string) {
      calls.push(ref);
      const a = answers[Math.min(i++, answers.length - 1)] ?? "unfinished";
      if (a instanceof Error) throw a;
      return a;
    },
  };
  return { vendor, calls };
}

describe("KycPendingStateService", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("returns the vendor's answer for a live session", async () => {
    const { vendor, calls } = vendorReturning("in_flight");
    const svc = new KycPendingStateService(vendor);
    expect(await svc.get("sess_1")).toBe("in_flight");
    expect(calls).toEqual(["sess_1"]);
  });

  // The rider board polls /auth/me every 5s while a check is pending. Without the TTL that is 12
  // outbound vendor calls a minute per waiting rider, for a value that changes at human speed.
  it("serves repeat reads inside the TTL from cache — one vendor call, not one per poll", async () => {
    vi.useFakeTimers();
    const { vendor, calls } = vendorReturning("in_flight");
    const svc = new KycPendingStateService(vendor);

    for (let i = 0; i < 5; i++) {
      expect(await svc.get("sess_1")).toBe("in_flight");
      vi.advanceTimersByTime(1_000);
    }
    expect(calls).toHaveLength(1);
  });

  it("asks again once the TTL has elapsed, and picks up the new answer", async () => {
    vi.useFakeTimers();
    const { vendor, calls } = vendorReturning("in_flight", "unfinished");
    const svc = new KycPendingStateService(vendor);

    expect(await svc.get("sess_1")).toBe("in_flight");
    vi.advanceTimersByTime(KYC_PENDING_STATE_TTL_MS + 1);
    expect(await svc.get("sess_1")).toBe("unfinished");
    expect(calls).toHaveLength(2);
  });

  it("keeps sessions apart — one rider's answer is never served to another", async () => {
    const { vendor, calls } = vendorReturning("in_flight", "unfinished");
    const svc = new KycPendingStateService(vendor);
    expect(await svc.get("sess_a")).toBe("in_flight");
    expect(await svc.get("sess_b")).toBe("unfinished");
    expect(calls).toEqual(["sess_a", "sess_b"]);
  });

  it("coalesces concurrent reads of the same session into one vendor call", async () => {
    const { vendor, calls } = vendorReturning("in_flight");
    const svc = new KycPendingStateService(vendor);
    const results = await Promise.all([svc.get("sess_1"), svc.get("sess_1"), svc.get("sess_1")]);
    expect(results).toEqual(["in_flight", "in_flight", "in_flight"]);
    expect(calls).toHaveLength(1);
  });

  // Fail-soft is the whole point: this sits on the rider's own /auth/me, behind the gate they are
  // stuck on. A vendor blip must cost them one needless "Finish verifying" tap, never an error.
  it("answers unfinished when the vendor throws, instead of failing the profile read", async () => {
    const { vendor } = vendorReturning(new Error("vendor down"));
    const svc = new KycPendingStateService(vendor);
    await expect(svc.get("sess_1")).resolves.toBe("unfinished");
  });

  it("caches a failed read too, so an outage isn't hammered once per poll", async () => {
    vi.useFakeTimers();
    const { vendor, calls } = vendorReturning(new Error("vendor down"));
    const svc = new KycPendingStateService(vendor);
    await svc.get("sess_1");
    await svc.get("sess_1");
    expect(calls).toHaveLength(1);
  });

  it("answers unfinished without calling anything when there is no session ref", async () => {
    const { vendor, calls } = vendorReturning("in_flight");
    const svc = new KycPendingStateService(vendor);
    expect(await svc.get(null)).toBe("unfinished");
    expect(await svc.get(undefined)).toBe("unfinished");
    expect(await svc.get("")).toBe("unfinished");
    expect(calls).toHaveLength(0);
  });

  // `pendingState` is optional on the seam — the stub vendor (KYC_PROVIDER=stub, the vendor-free QA
  // mode) has no notion of a resumable session. That must degrade, not crash.
  it("answers unfinished for a vendor that doesn't implement pendingState", async () => {
    const vendor: KycVendor = {
      async submit(): Promise<KycSubmission> {
        return { ref: "r", status: "pending" };
      },
    };
    await expect(new KycPendingStateService(vendor).get("sess_1")).resolves.toBe("unfinished");
  });
});
