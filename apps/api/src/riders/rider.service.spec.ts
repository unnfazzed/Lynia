import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { KycVendor } from "../kyc/kyc-vendor";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { PrismaService } from "../prisma/prisma.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { canGoOnline, onlineRefusalReason, RiderService } from "./rider.service";

/** Real crypto with a fixed test key so hashId(...) is deterministic across the assertions below. */
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);

describe("canGoOnline (rider gating, §5d)", () => {
  it("allows only verified riders online", () => {
    expect(canGoOnline("verified")).toBe(true);
  });
  it("blocks pending, failed and expired riders", () => {
    expect(canGoOnline("pending")).toBe(false);
    expect(canGoOnline("failed")).toBe(false);
    expect(canGoOnline("expired")).toBe(false);
  });
});

/** setOnline evicts the offline rider from the geo index and drains the "notify me" waiting list on
 *  online — no-op stubs keep these unit tests off Redis + push. */
const trackingStub = {
  evictFromGeo: async () => {},
  claimNotifyWaitersNear: async () => [],
  clearNotifyWaiters: async () => {},
} as unknown as import("../tracking/tracking.service").TrackingService;
const notificationsStub = {
  notifyRidersAvailable: async () => new Set<string>(),
  notifyProfiles: async () => {},
} as unknown as import("../notifications/notifications.service").NotificationsService;

function svc(prisma: Partial<Record<string, unknown>>, env: Partial<Env>, vendor: KycVendor = new StubKycVendor()) {
  const p = prisma as Record<string, unknown>;
  // adminSetKyc now wraps its read+update+audit in a callback `$transaction`; give the fake one that
  // runs the callback against itself (or returns an array, the becomeRider form) unless a test set its own.
  if (!p.$transaction) {
    p.$transaction = async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(p) : arg;
  }
  return new RiderService(p as unknown as PrismaService, env as Env, vendor, pii, trackingStub, notificationsStub);
}

describe("RiderService.becomeRider", () => {
  it("409s if already registered as a rider", async () => {
    const s = svc({ rider: { findUnique: async () => ({ profileId: "p1" }) } }, { KYC_MODE: "auto" });
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(/already registered/i);
  });

  it("400s if the photo key is not under the caller's own kyc namespace (no cross-user key)", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, { KYC_MODE: "auto" });
    await expect(
      s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/victim/photo.jpg" }),
    ).rejects.toThrow(/invalid photo key/i);
  });

  it("auto mode submits to the vendor and returns the verification url", async () => {
    let submitted: string | undefined;
    const vendor: KycVendor = {
      submit: async (riderId) => {
        submitted = riderId;
        return { ref: "sess_1", status: "pending", url: "https://verify.didit.me/sess_1" };
      },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(submitted).toBe("p1");
    expect(res).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/sess_1" });
  });

  it("stub provider in auto mode auto-verifies the rider so it can go online (QA/test)", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {};
        },
      },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res.kycStatus).toBe("verified");
    // A unique ID → not flagged.
    expect(created).toMatchObject({ kycStatus: "verified", idVerified: true, duplicateIdFlag: false });
  });

  it("flags (does not reject) a rider whose national ID already sits on another account (A-04)", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {};
        },
      },
      profile: {
        update: async () => ({}),
        findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42") }),
        // Another account already carries this ID — matched on the HMAC hash, not the raw number.
        count: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42"), id: { not: "p1" } });
          return 1;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    // Onboarding still succeeds — flag, don't block.
    expect(res.kycStatus).toBe("verified");
    expect(created).toMatchObject({ duplicateIdFlag: true });
  });

  it("does not flag when the account has no national ID yet (A-04)", async () => {
    let created: Record<string, unknown> | undefined;
    let counted = false;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {};
        },
      },
      profile: {
        update: async () => ({}),
        findUnique: async () => ({ idNumber: null }),
        count: async () => {
          counted = true;
          return 0;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    // No ID → nothing to collide on; the count query is skipped entirely.
    expect(counted).toBe(false);
    expect(created).toMatchObject({ duplicateIdFlag: false });
  });

  it("manual mode skips the vendor and returns no url", async () => {
    const vendor: KycVendor = {
      submit: async () => { throw new Error("vendor must not be called in manual mode"); },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "manual" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res).toEqual({ kycStatus: "pending", mode: "manual", verificationUrl: undefined });
  });

  it("maps a concurrent-create P2002 to a 409, not a raw 500 (DS13-06)", async () => {
    // The findUnique pre-check races a parallel become; the rider PK is the real guard. Its P2002 must
    // surface as the same ConflictException the pre-check raises, not leak as an unhandled 500.
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      // The create transaction loses the race and throws a P2002.
      $transaction: async () => { throw p2002; },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(
      /already a rider/i,
    );
  });

  it("surfaces a vendor outage as a 503 and creates no rider row", async () => {
    let created = false;
    const vendor: KycVendor = { submit: async () => { throw new Error("didit 502"); } };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => { created = true; return {}; } },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(
      /couldn't start id verification/i,
    );
    expect(created).toBe(false);
  });
});

describe("RiderService.completeProfile (A-04 duplicate-ID signal)", () => {
  const data = { firstName: "Chipo", lastName: "M", idNumber: "63-123456-A-42" };

  it("writes the profile and succeeds even when the ID is a duplicate (flag, never block)", async () => {
    let updated: Record<string, unknown> | undefined;
    const prisma = {
      profile: {
        // Fix 2: completeProfile now reads the existing profile to enforce the post-verification ID
        // freeze. A fresh signup (no rider row / not verified) passes the guard untouched.
        findUnique: async () => ({ idNumberHash: null, rider: null }),
        update: async (args: { data: Record<string, unknown> }) => {
          updated = args.data;
          return {};
        },
        count: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42"), id: { not: "p1" } });
          return 2;
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    // The raw ID is never written: id_number is ciphertext, plus the dedup hash.
    expect(updated).toMatchObject({ firstName: "Chipo", lastName: "M", idNumberHash: pii.hashId("63-123456-A-42") });
    expect(pii.isEncrypted(updated?.idNumber as string)).toBe(true);
    expect(pii.decryptId(updated?.idNumber as string)).toBe("63-123456-A-42");
  });

  it("does not run the collision query when the ID is unique", async () => {
    let counted = false;
    const prisma = {
      profile: {
        findUnique: async () => ({ idNumberHash: null, rider: null }),
        update: async () => ({}),
        count: async () => {
          counted = true;
          return 0;
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    expect(counted).toBe(true);
  });

  // Fix 2: the KYC-freeze bypass. PATCH /auth/me already blocks a verified rider from swapping their
  // national ID; this sibling route (PATCH /riders/profile → completeProfile) previously had NO guard,
  // so a banned rider could launder in a different ID through it. Both routes must enforce it identically.
  it("blocks a verified rider from changing their frozen national ID (anti-ban-evasion)", async () => {
    let wrote = false;
    const prisma = {
      profile: {
        // Verified rider whose stored ID hash differs from the incoming one → a genuine CHANGE.
        findUnique: async () => ({ idNumberHash: "some-other-stored-hash", rider: { kycStatus: "verified" } }),
        update: async () => {
          wrote = true;
          return {};
        },
        count: async () => 0,
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    await expect(s.completeProfile("p1", data)).rejects.toThrow(/locked after verification/i);
    // The frozen ID must never be overwritten.
    expect(wrote).toBe(false);
  });

  it("allows a verified rider to re-submit the SAME ID (idempotent, not a change)", async () => {
    let wrote = false;
    const prisma = {
      profile: {
        // Same hash as the incoming ID → not a change → allowed through the freeze guard.
        findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42"), rider: { kycStatus: "verified" } }),
        update: async () => {
          wrote = true;
          return {};
        },
        count: async () => 0,
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    expect(wrote).toBe(true);
  });
});

describe("RiderService.retryKyc", () => {
  it("404s when the caller is not a rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, { KYC_MODE: "auto" });
    await expect(s.retryKyc("p1")).rejects.toThrow(/not a rider/i);
  });

  it("409s when already verified", async () => {
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "verified" }) } }, { KYC_MODE: "auto" });
    await expect(s.retryKyc("p1")).rejects.toThrow(/already verified/i);
  });

  it("mints a fresh session and resets a failed rider to pending", async () => {
    let data: Record<string, unknown> | undefined;
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_new", status: "pending", url: "https://verify.didit.me/sess_new" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed" }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return {};
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", verificationUrl: "https://verify.didit.me/sess_new" });
    // New ref, reset to pending, and kycResolvedAt cleared so the fresh webhook resolves it.
    expect(data).toMatchObject({ kycStatus: "pending", idVerified: false, kycRef: "sess_new", kycResolvedAt: null });
  });

  it("returns 503 when the vendor is down on retry", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("didit down");
      },
    };
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "failed" }) } },
      { KYC_MODE: "auto", KYC_PROVIDER: "didit" },
      vendor,
    );
    await expect(s.retryKyc("p1")).rejects.toThrow(/couldn't restart id verification/i);
  });

  it("A-02 lock: refuses a THIRD attempt once kycAttempts >= 2 (locked → support)", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("vendor must not be called once locked");
      },
    };
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "failed", kycAttempts: 2 }) } },
      { KYC_MODE: "auto", KYC_PROVIDER: "didit" },
      vendor,
    );
    await expect(s.retryKyc("p1")).rejects.toThrow(/locked|contact support/i);
  });

  it("still allows the single resubmit after the first decline (kycAttempts = 1)", async () => {
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_2", status: "pending", url: "https://verify.didit.me/sess_2" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }),
        update: async () => ({}),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", verificationUrl: "https://verify.didit.me/sess_2" });
  });

  it("leaves a manual-mode rider pending without calling the vendor", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("vendor must not be called in manual mode");
      },
    };
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "failed" }) } }, { KYC_MODE: "manual" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending" });
  });
});

describe("RiderService.setOnline", () => {
  it("403s when the caller is not a rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, {});
    await expect(s.setOnline("p1", true)).rejects.toThrow(/not a rider/i);
  });

  it("403s when an unverified rider tries to go online", async () => {
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "pending" }) } }, {});
    await expect(s.setOnline("p1", true)).rejects.toThrow(/not verified/i);
  });

  it("lets a verified rider go online", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
    expect(data).toMatchObject({ isOnline: true });
    expect(data!.lastHeartbeatAt).toBeInstanceOf(Date);
  });

  it("drains the notify-me waiting list and pushes those customers when going online with a location (2·b1)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
        update: async () => ({}),
      },
    };
    let drainedAt: { lat: number; lng: number; radius: number } | null = null;
    let pushed: string[] | null = null;
    let cleared: string[] | null = null;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async (lat: number, lng: number, radius: number) => {
        drainedAt = { lat, lng, radius };
        return ["cust-1", "cust-2"];
      },
      clearNotifyWaiters: async (ids: string[]) => { cleared = ids; },
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = {
      // Both waiters delivered → both should be cleared from the list.
      notifyRidersAvailable: async (ids: string[]) => { pushed = ids; return new Set(ids); },
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, notifications);

    // Inside the Harare corridor so the online gate passes.
    expect(await s.setOnline("p1", true, { lat: -17.83, lng: 31.05 })).toEqual({ online: true });
    // The drain is fire-and-forget — let the microtask settle, then assert it pinged the waiters.
    await new Promise((r) => setTimeout(r, 0));
    expect(drainedAt).toEqual({ lat: -17.83, lng: 31.05, radius: 5000 });
    expect(pushed).toEqual(["cust-1", "cust-2"]);
    // F-18: delivered waiters are cleared from the list; a miss would be left queued.
    expect(cleared).toEqual(["cust-1", "cust-2"]);
  });

  it("leaves an UNDELIVERED notify-me waiter queued (not cleared) so the next rider re-pings — F-18 at-least-once", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
        update: async () => ({}),
      },
    };
    let cleared: string[] | null = null;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async () => ["cust-1", "cust-2"],
      clearNotifyWaiters: async (ids: string[]) => { cleared = ids; },
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = {
      // cust-1 delivered, cust-2 not (no token / transient FCM failure).
      notifyRidersAvailable: async () => new Set(["cust-1"]),
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, notifications);

    await s.setOnline("p1", true, { lat: -17.83, lng: 31.05 });
    await new Promise((r) => setTimeout(r, 0));
    // Only the delivered waiter is cleared; cust-2 stays on the list for the next nearby rider.
    expect(cleared).toEqual(["cust-1"]);
  });

  it("does NOT drain the notify list when going online without a location (older client)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
        update: async () => ({}),
      },
    };
    let drained = false;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async () => { drained = true; return []; },
      clearNotifyWaiters: async () => {},
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = { notifyRidersAvailable: async () => new Set<string>() } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, notifications);
    await s.setOnline("p1", true);
    await new Promise((r) => setTimeout(r, 0));
    expect(drained).toBe(false);
  });

  it("lets any rider go offline regardless of verification", async () => {
    const prisma = {
      rider: { findUnique: async () => ({ kycStatus: "pending" }), update: async () => ({}) },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", false)).toEqual({ online: false });
  });

  it("blocks going online while on a no-show cooldown", async () => {
    const future = new Date(Date.now() + 60_000);
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: future }) } },
      {},
    );
    await expect(s.setOnline("p1", true)).rejects.toThrow(/cooldown/i);
  });

  it("allows going online once the cooldown has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const s = svc(
      {
        rider: {
          findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: past }),
          update: async () => ({}),
        },
      },
      {},
    );
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
  });

  it("refuses going online outside the service corridor (out_of_area) when a location is sent", async () => {
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }) } },
      {},
    );
    // Null Island — far outside the Harare corridor.
    await expect(s.setOnline("p1", true, { lat: 0, lng: 0 })).rejects.toThrow(/service area/i);
  });

  it("allows going online with a location inside the corridor", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }),
        update: async () => ({}),
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true, { lat: -17.8292, lng: 31.0522 })).toEqual({ online: true });
  });

  it("refuses (reason: suspended) when the admin has suspended the account — read-only here", async () => {
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "suspended", onHold: false, cooldownUntil: null }) } },
      {},
    );
    await expect(s.setOnline("p1", true)).rejects.toThrow(/suspended/i);
  });

  it("refuses (reason: banned) with a distinct tag when the account is banned", async () => {
    let threw: unknown;
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "banned", onHold: false, cooldownUntil: null }) } },
      {},
    );
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // Banned surfaces its own machine-readable `reason`, not the suspended branch.
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("banned");
  });

  it("refuses (reason: on_hold) when reliability tripped on_hold", async () => {
    let threw: unknown;
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: true, cooldownUntil: null }) } },
      {},
    );
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // The refusal carries a machine-readable `reason` the app keys off (not just the message string).
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("on_hold");
  });
});

describe("onlineRefusalReason (pure online-gate, Q2)", () => {
  const base = { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null };
  it("returns null when every precondition passes", () => {
    expect(onlineRefusalReason(base)).toBeNull();
  });
  it("prioritises kyc_expired → kyc → banned → suspended → on_hold → cooldown", () => {
    expect(onlineRefusalReason({ ...base, kycStatus: "pending" })).toBe("kyc");
    // A lapsed ID (1·b2) is reported distinctly from a first-time unverified rider.
    expect(onlineRefusalReason({ ...base, kycStatus: "expired" })).toBe("kyc_expired");
    expect(onlineRefusalReason({ ...base, accountStatus: "banned" })).toBe("banned");
    expect(onlineRefusalReason({ ...base, accountStatus: "suspended" })).toBe("suspended");
    expect(onlineRefusalReason({ ...base, onHold: true })).toBe("on_hold");
    expect(onlineRefusalReason({ ...base, cooldownUntil: new Date(Date.now() + 60_000) })).toBe("cooldown");
  });

  it("reports a banned account as its own `banned` reason (not the suspended catch-all)", () => {
    // A banned rider outranks a simultaneous on_hold/cooldown and is never mislabelled `suspended`.
    expect(onlineRefusalReason({ ...base, accountStatus: "banned", onHold: true })).toBe("banned");
  });
  it("kyc outranks a simultaneous suspend + on_hold + cooldown", () => {
    expect(
      onlineRefusalReason({ kycStatus: "failed", accountStatus: "suspended", onHold: true, cooldownUntil: new Date(Date.now() + 60_000) }),
    ).toBe("kyc");
  });
  it("treats an elapsed cooldown as passed", () => {
    expect(onlineRefusalReason({ ...base, cooldownUntil: new Date(Date.now() - 60_000) })).toBeNull();
  });
});

describe("RiderService.applyKycResult", () => {
  it("applies the status, records the event time, and guards monotonically", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const eventAt = new Date("2026-06-30T10:00:00Z");
    const prisma = {
      rider: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
      },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "verified", eventAt)).toEqual({ updated: 1 });
    // Only applies when newer than the last resolution (replay/reorder can't downgrade a newer decision).
    expect(where).toMatchObject({
      kycRef: "sess_1",
      OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }],
    });
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycResolvedAt: eventAt });
  });

  it("reports updated:0 for a stale/duplicate event or unknown ref", async () => {
    const s = svc({ rider: { updateMany: async () => ({ count: 0 }) } }, {});
    expect(await s.applyKycResult("sess_x", "failed", new Date())).toEqual({ updated: 0 });
  });

  it("an `expired` result clears idVerified + decline reason and resets the A-02 attempt counter (1·b2)", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
      },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "expired", new Date())).toEqual({ updated: 1 });
    // Not a decline: idVerified false, no decline reason, and kycAttempts reset so re-verify isn't locked.
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, kycDeclineReason: null, kycAttempts: 0 });
  });

  it("F-13: a vendor DECLINE increments the A-02 counter under the monotonic guard (new decline only)", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const eventAt = new Date("2026-07-01T10:00:00Z");
    const prisma = {
      rider: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
      },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "failed", eventAt, "score_below_threshold")).toEqual({ updated: 1 });
    // The increment rides the SAME where guard that dedupes replays/reorders: a webhook that isn't newer
    // than the last resolution matches 0 rows, so the increment never applies twice for one decline.
    expect(where).toMatchObject({ kycRef: "sess_1", OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] });
    expect(data).toMatchObject({
      kycStatus: "failed",
      idVerified: false,
      kycDeclineReason: "score_below_threshold",
      kycAttempts: { increment: 1 },
    });
  });

  it("F-13: a REPLAYED/stale decline matches 0 rows so the counter is not bumped (updated:0)", async () => {
    // The monotonic where guard (kycResolvedAt null/older than eventAt) filters an exact replay out —
    // count 0 means the row wasn't touched, so the `increment` in data never runs a second time.
    const s = svc({ rider: { updateMany: async () => ({ count: 0 }) } }, {});
    expect(await s.applyKycResult("sess_1", "failed", new Date(), "score_below_threshold")).toEqual({ updated: 0 });
  });

  it("F-13: approve/verify does NOT touch the attempt counter", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
      },
    };
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date());
    expect(data).not.toHaveProperty("kycAttempts");
  });
});

describe("RiderService.adminSetKyc (A-02 decision state machine)", () => {
  it("404s for an unknown rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, {});
    await expect(s.adminSetKyc("p1", "verified")).rejects.toThrow(/rider not found/i);
  });

  it("approve → verified + idVerified, and clears any prior decline reason", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "verified");
    expect(res).toMatchObject({ profileId: "p1", kycStatus: "verified", locked: false });
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycDeclineReason: null });
  });

  it("decline → failed, records the reason code, and increments kycAttempts", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 1 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Selfie doesn't match the ID");
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 1, locked: false });
    expect(data).toMatchObject({
      kycStatus: "failed",
      idVerified: false,
      kycDeclineReason: "Selfie doesn't match the ID",
      kycAttempts: { increment: 1 },
    });
    // The human decline stamps kycResolvedAt so a later/replayed vendor webhook (monotonic on eventAt)
    // can't flip the rider back to verified over the admin's decision.
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("approve stamps kycResolvedAt so a stale vendor webhook can't override the manual decision", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "verified");
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycDeclineReason: null });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("expire (1·b2 ops backstop) → expired, clears the reason, stamps the time, and resets kycAttempts", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "expired");
    // Attempt counter reset to 0 so the rider can re-verify; not locked.
    expect(res).toMatchObject({ profileId: "p1", kycStatus: "expired", kycAttempts: 0, locked: false });
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, kycDeclineReason: null, kycAttempts: 0 });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("a `pending` reset leaves kycResolvedAt untouched (it invites a fresh vendor result)", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "pending");
    expect(data).toMatchObject({ kycStatus: "pending", idVerified: false });
    expect(data!.kycResolvedAt).toBeUndefined();
  });

  it("F-14: a REPEAT of the same decline (already-failed, resolvedAt set) re-records the reason but does NOT re-increment", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        // The rider is already sitting in a resolved `failed` state — a retried/duplicate decline action
        // (e.g. a lost HTTP response) must not double-count. No resubmit happened (kycResolvedAt still set).
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1, kycStatus: "failed", kycResolvedAt: new Date("2026-07-01T09:00:00Z") }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 1 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Selfie doesn't match the ID");
    // Counter held at 1 (not over-locked); the reason + resolution are still re-recorded.
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 1, locked: false });
    expect(data).not.toHaveProperty("kycAttempts");
    expect(data).toMatchObject({ kycStatus: "failed", idVerified: false, kycDeclineReason: "Selfie doesn't match the ID" });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("F-14: a decline AFTER a resubmit (kycResolvedAt cleared by retryKyc) is a genuine new attempt and DOES increment", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        // retryKyc left `pending` and cleared kycResolvedAt on the resubmit → this is a fresh decline.
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1, kycStatus: "pending", kycResolvedAt: null }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 2 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Suspected fraud or stolen identity");
    // Second genuine decline reaches the lock.
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 2, locked: true });
    expect(data).toMatchObject({ kycAttempts: { increment: 1 } });
  });

  it("a SECOND decline lands at kycAttempts >= 2 and reports locked", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async () => ({ kycAttempts: 2 }),
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Suspected fraud or stolen identity");
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 2, locked: true });
  });

  it("writes the audit row in the SAME transaction, attributed to the forwarded operator (A-01)", async () => {
    let auditData: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async () => ({ kycAttempts: 1 }),
      },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { auditData = args.data; return {}; } },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "failed", "face_mismatch", "alice@corp.com", "second review");
    // The decision + its audit row commit together; the actor is the real operator, not the shared token.
    expect(auditData).toMatchObject({
      actor: "alice@corp.com",
      action: "rider.kyc_decline",
      target: "p1",
      reasonCode: "face_mismatch",
      note: "second review",
    });
  });

  it("does NOT write an audit row when no operator is supplied (older callers)", async () => {
    let audited = false;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async () => ({}),
      },
      auditLog: { create: async () => { audited = true; return {}; } },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "verified");
    expect(audited).toBe(false);
  });
});
