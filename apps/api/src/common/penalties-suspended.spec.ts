import { HeldReason, KycStatus, RELIABILITY, RiderAccountStatus } from "@lynia/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { applyReliabilityDelta, shouldFlagUndeliveredVelocity } from "../riders/reliability";
import { onlineRefusalReason } from "../riders/online-gate";
import { hasOpenMerchantObligation, OPEN_MERCHANT_OBLIGATION_OR, openMerchantObligationOr } from "./merchant-debt-lock";
import { penaltiesSuspended } from "./penalties";

/** Owner 2026-10-12: penalties suspended until further instructions. The suite pins them ON
 *  (vitest.config.ts), so this spec flips the switch itself. */
const base = {
  kycStatus: KycStatus.VERIFIED,
  accountStatus: RiderAccountStatus.ACTIVE,
  onHold: false,
  cooldownUntil: null as Date | null,
};

describe("penalty suspension (PENALTIES_SUSPENDED)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.PENALTIES_SUSPENDED;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PENALTIES_SUSPENDED;
    else process.env.PENALTIES_SUSPENDED = saved;
  });

  it("is suspended when unset or 'true', and on only for the literal 'false'", () => {
    delete process.env.PENALTIES_SUSPENDED;
    expect(penaltiesSuspended()).toBe(true);
    process.env.PENALTIES_SUSPENDED = "true";
    expect(penaltiesSuspended()).toBe(true);
    process.env.PENALTIES_SUSPENDED = "false";
    expect(penaltiesSuspended()).toBe(false);
  });

  describe("while suspended", () => {
    beforeEach(() => {
      delete process.env.PENALTIES_SUSPENDED;
    });

    it("still moves the reliability score but never trips a hold", () => {
      const next = applyReliabilityDelta({ reliabilityScore: 62, onHold: false, heldReason: null }, -RELIABILITY.PENALTY.noShow);
      expect(next).toEqual({ reliabilityScore: 47, onHold: false, heldReason: null });
    });

    it("never flags the abandonment-rate (velocity) hold", () => {
      expect(shouldFlagUndeliveredVelocity(10, 0)).toBe(false);
    });

    it("ignores an existing hold or cooldown at the online gate, but not admin suspend/ban or KYC", () => {
      const future = new Date(Date.now() + 60_000);
      expect(onlineRefusalReason({ ...base, onHold: true })).toBeNull();
      expect(onlineRefusalReason({ ...base, cooldownUntil: future })).toBeNull();
      expect(onlineRefusalReason({ ...base, accountStatus: RiderAccountStatus.SUSPENDED })).toBe("suspended");
      expect(onlineRefusalReason({ ...base, accountStatus: RiderAccountStatus.BANNED })).toBe("banned");
      expect(onlineRefusalReason({ ...base, kycStatus: KycStatus.EXPIRED })).toBe("kyc_expired");
    });

    it("lifts the merchant cash-debt job lock without querying", async () => {
      const prisma = { order: { findFirst: async () => ({ id: "o1" }) } } as unknown as PrismaService;
      expect(await hasOpenMerchantObligation(prisma, "r1")).toBe(false);
      expect(openMerchantObligationOr()).toEqual([]);
    });
  });

  describe("when switched back on", () => {
    beforeEach(() => {
      process.env.PENALTIES_SUSPENDED = "false";
    });

    it("restores holds, cooldowns and the job lock", async () => {
      expect(applyReliabilityDelta({ reliabilityScore: 62, onHold: false, heldReason: null }, -RELIABILITY.PENALTY.noShow)).toEqual({
        reliabilityScore: 47,
        onHold: true,
        heldReason: HeldReason.RELIABILITY,
      });
      expect(onlineRefusalReason({ ...base, onHold: true })).toBe("on_hold");
      expect(onlineRefusalReason({ ...base, cooldownUntil: new Date(Date.now() + 60_000) })).toBe("cooldown");
      const prisma = { order: { findFirst: async () => ({ id: "o1" }) } } as unknown as PrismaService;
      expect(await hasOpenMerchantObligation(prisma, "r1")).toBe(true);
      expect(openMerchantObligationOr()).toBe(OPEN_MERCHANT_OBLIGATION_OR);
    });
  });
});
