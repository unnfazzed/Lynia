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

/**
 * Startup review 2026-10-06: the raw-status read (R-1 dead sessions, R-3 holds) and the cache moving
 * with the session (R-4) — invalidated when a launch starts/completes or a decision lands, primed by
 * the signed status webhook so the next poll doesn't ask the vendor what it just told us.
 */
describe("KycPendingStateService — session class, invalidation and webhook priming (2026-10-06)", () => {
  function rawVendor(...statuses: (string | null)[]) {
    const calls: string[] = [];
    let i = 0;
    const vendor: KycVendor = {
      async submit(): Promise<KycSubmission> {
        throw new Error("not used");
      },
      async sessionStatus(ref: string) {
        calls.push(ref);
        return statuses[Math.min(i++, statuses.length - 1)] ?? null;
      },
    };
    return { vendor, calls };
  }

  it("classifies the raw status: In Review is held, Expired/Abandoned dead; the two-value read keeps old meanings", async () => {
    for (const [raw, cls, two] of [
      ["In Review", "held", "in_flight"],
      ["Expired", "dead", "unfinished"],
      ["Abandoned", "dead", "unfinished"],
      ["In Progress", "unfinished", "unfinished"],
      ["Approved", "in_flight", "in_flight"],
      [null, "unfinished", "unfinished"],
    ] as const) {
      const svc = new KycPendingStateService(rawVendor(raw).vendor);
      expect(await svc.read("s")).toBe(cls);
      expect(await svc.get("s")).toBe(two);
    }
  });

  it("read and get share ONE vendor call per ref per TTL", async () => {
    const { vendor, calls } = rawVendor("In Progress");
    const svc = new KycPendingStateService(vendor);
    await svc.read("s1");
    await svc.get("s1");
    await svc.read("s1");
    expect(calls).toEqual(["s1"]);
  });

  it("invalidate drops the entry, so the next read asks the vendor afresh (R-4)", async () => {
    const { vendor, calls } = rawVendor("In Progress", "In Review");
    const svc = new KycPendingStateService(vendor);
    expect(await svc.read("s1")).toBe("unfinished");
    svc.invalidate("s1");
    expect(await svc.read("s1")).toBe("held");
    expect(calls).toEqual(["s1", "s1"]);
  });

  it("prime serves the webhook's status without a vendor call", async () => {
    const { vendor, calls } = rawVendor("In Progress");
    const svc = new KycPendingStateService(vendor);
    svc.prime("s1", "Expired");
    expect(await svc.read("s1")).toBe("dead");
    expect(calls).toHaveLength(0);
  });
});
