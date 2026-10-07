/**
 * Owner decision D2 (2026-10-07), cluster C7. The delivery code is stored sealed next to its hash, so
 * showing it is repeatable (U19, U20), rotation is the explicit re-issue only (U04), and a rider-bail
 * re-match keeps the code the recipient already holds (U22). Verification is still the hash.
 */
import { describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { WalletService } from "../wallet/wallet.service";
import { OrderLifecycleService } from "./order-lifecycle.service";
import type { OrdersService } from "./orders.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "delivery-code-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "delivery-code-test-pii-key-0123456789abcdef" } as Env);
const sealed = (code: string) => ({ otpHash: tokens.hash(code), otpCipher: pii.encryptCode(code) });

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>, opts: { crypto?: false } = {}) {
  const emits: Array<[string, string]> = [];
  const gateway = {
    emitOrderStatus: (id: string, s: string) => emits.push([id, s]),
    emitJobCancelled: () => undefined,
    emitOrderRebroadcast: () => undefined,
    emitBidExpired: () => undefined,
    evictRiderFromSupply: async () => undefined,
  };
  const prisma = { ...methods } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  if (!prisma.$executeRaw) prisma.$executeRaw = async () => 0;
  const svc = new OrderLifecycleService(
    {} as Env,
    prisma as unknown as PrismaService,
    tokens,
    gateway as unknown as TrackingGateway,
    { notifyOrderStatus: async () => {}, notifyProfiles: async () => {} } as unknown as NotificationsService,
    { announceOpenOrder: vi.fn(async () => {}) } as unknown as OrdersService,
    { chargeCommission: vi.fn(async () => {}) } as unknown as WalletService,
    undefined,
    undefined,
    undefined,
    opts.crypto === false ? undefined : pii,
  );
  return { svc, emits, prisma };
}

type Row = Record<string, unknown> & { otpHash: string | null; otpCipher: string | null; deliveryOtpAttempts: number };

/** Prisma `where` equality for the flat fields the code CAS uses (`{ in: [...] }` included). */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "id") return true;
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
    return row[k] === v;
  });
}

/** A stateful order row behind findUnique / updateMany. */
function codeHarness(seed: Partial<Row>, opts: { crypto?: false } = {}) {
  const row: Row = { customerId: "c1", status: "en_route_dropoff", orderType: "parcel", otpHash: null, otpCipher: null, deliveryOtpAttempts: 0, ...seed };
  const writes: Array<Record<string, unknown>> = [];
  const stamps: string[] = [];
  const h = build(
    {
      order: {
        findUnique: async () => ({ ...row }),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(row, where)) return { count: 0 };
          writes.push(data);
          Object.assign(row, data);
          return { count: 1 };
        },
      },
      $executeRaw: async (strings: TemplateStringsArray) => {
        stamps.push(strings.join("?"));
        return 1;
      },
    },
    opts,
  );
  return { ...h, row, writes, stamps };
}

describe("OrderLifecycleService.revealDeliveryCode / rotateDeliveryCode — D2", () => {
  it("U19: reveal twice (two devices) → the same code; attempts unchanged; nothing written, stamped or emitted", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 2 });
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual({ deliveryCode: "418290" });
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual({ deliveryCode: "418290" });
    expect(h.writes).toEqual([]);
    expect(h.stamps).toEqual([]);
    expect(h.emits).toEqual([]);
    expect(h.row.deliveryOtpAttempts).toBe(2);
  });

  it("rotate → a NEW code sealed next to its hash, attempts reset, rotation stamped and emitted; reveal then returns it", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    const { deliveryCode } = await h.svc.rotateDeliveryCode("o1", "c1");
    expect(deliveryCode).not.toBe("418290");
    expect(h.row.otpHash).toBe(tokens.hash(deliveryCode));
    expect(pii.decryptCode(h.row.otpCipher)).toBe(deliveryCode);
    expect(h.row.deliveryOtpAttempts).toBe(0);
    expect(h.stamps.join()).toContain("delivery_code_rotated_at = now()");
    expect(h.emits).toEqual([["o1", "en_route_dropoff"]]);
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual({ deliveryCode });
    expect(h.writes).toHaveLength(1);
  });

  it("U04: a LOCKED code is returned as-is by reveal (no silent reset) — only the explicit rotate re-issues", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual({ deliveryCode: "418290" });
    expect(h.row.deliveryOtpAttempts).toBe(5);
    expect(h.writes).toEqual([]);
  });

  it("legacy row (hash only, pre-0086) → the first reveal mints once, pinned on the old hash; later reveals are stable", async () => {
    const h = codeHarness({ otpHash: tokens.hash("111111"), deliveryOtpAttempts: 1 });
    const first = await h.svc.revealDeliveryCode("o1", "c1");
    expect(first.deliveryCode).toMatch(/^\d{6}$/);
    expect(h.writes).toHaveLength(1);
    expect(h.row.otpHash).toBe(tokens.hash(first.deliveryCode));
    expect(pii.decryptCode(h.row.otpCipher)).toBe(first.deliveryCode);
    // The old reveal-by-rotation for this one mint: a new code, so the rider app is told.
    expect(h.emits).toEqual([["o1", "en_route_dropoff"]]);
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual(first);
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual(first);
    expect(h.writes).toHaveLength(1);
  });

  it("two devices racing the legacy mint both get the winner's code", async () => {
    const h = codeHarness({ otpHash: tokens.hash("111111") });
    const order = h.prisma.order as Record<string, unknown>;
    let first = true;
    order.findUnique = async () => {
      const snapshot = { ...h.row };
      if (first) {
        first = false;
        Object.assign(h.row, sealed("777888")); // the other device's mint lands after our read
      }
      return snapshot;
    };
    expect(await h.svc.revealDeliveryCode("o1", "c1")).toEqual({ deliveryCode: "777888" });
  });

  it("a ciphertext that doesn't open to the stored hash is never shown", async () => {
    const h = codeHarness({ otpHash: tokens.hash("222222"), otpCipher: pii.encryptCode("999999") });
    const res = await h.svc.revealDeliveryCode("o1", "c1");
    expect(res.deliveryCode).not.toBe("999999");
    expect(h.row.otpHash).toBe(tokens.hash(res.deliveryCode));
  });

  it("reveal keeps rotate's guards: another customer, a finished trip, and the R-09 cash gate", async () => {
    await expect(codeHarness(sealed("418290")).svc.revealDeliveryCode("o1", "other")).rejects.toThrow(/not your order/i);
    await expect(codeHarness({ ...sealed("418290"), status: "delivered" }).svc.revealDeliveryCode("o1", "c1")).rejects.toThrow(/no active delivery/i);
    const cashPending = codeHarness({
      ...sealed("418290"),
      orderType: "merchant",
      merchantPaymentMethod: "cash",
      customerCashConfirmedAt: new Date(),
      riderCashConfirmedAt: null,
    });
    await expect(cashPending.svc.revealDeliveryCode("o1", "c1")).rejects.toThrow(/confirm the cash exchange/i);
  });

  it("without the crypto service (pre-D2 harness) reveal degrades to a pinned one-time mint, never a throw", async () => {
    const h = codeHarness({ otpHash: tokens.hash("111111") }, { crypto: false });
    const res = await h.svc.revealDeliveryCode("o1", "c1");
    expect(h.row.otpHash).toBe(tokens.hash(res.deliveryCode));
    expect(h.row.otpCipher).toBeNull();
  });
});

describe("OrderLifecycleService.confirmDelivery against a revealed code — D2", () => {
  const rawRow = (over: Record<string, unknown> = {}) => [
    { status: "en_route_dropoff", rider_id: "r1", otp_hash: tokens.hash("418290"), delivery_otp_attempts: 0, order_type: "parcel", ...over },
  ];

  it("the right code delivers (and the ciphertext is cleared); a wrong one counts an attempt", async () => {
    let attempts = 0;
    let delivered: Record<string, unknown> | undefined;
    const { svc } = build({
      $queryRaw: async () => rawRow({ delivery_otp_attempts: attempts }),
      order: {
        update: async ({ data }: { data: Record<string, unknown> }) => {
          const inc = data.deliveryOtpAttempts as { increment: number } | undefined;
          if (inc) attempts += inc.increment;
          else delivered = data;
          return {};
        },
      },
      orderEvent: { create: async () => ({}) },
    });
    await expect(svc.confirmDelivery("o1", "r1", "000001")).rejects.toThrow(/4 attempts left/i);
    expect(attempts).toBe(1);
    expect(await svc.confirmDelivery("o1", "r1", "418290")).toEqual({ orderId: "o1", status: "delivered" });
    expect(delivered).toMatchObject({ status: "delivered", otpCipher: null });
  });

  it("U04: the try that locks the code emits order:status so an open customer screen re-issues at once", async () => {
    const { svc, emits } = build({ $queryRaw: async () => rawRow({ delivery_otp_attempts: 4 }), order: { update: async () => ({}) } });
    await expect(svc.confirmDelivery("o1", "r1", "000001")).rejects.toThrow(/no attempts left/i);
    expect(emits).toEqual([["o1", "en_route_dropoff"]]);
  });

  it("an earlier wrong try does not emit", async () => {
    const { svc, emits } = build({ $queryRaw: async () => rawRow({ delivery_otp_attempts: 1 }), order: { update: async () => ({}) } });
    await expect(svc.confirmDelivery("o1", "r1", "000001")).rejects.toThrow(/3 attempts left/i);
    expect(emits).toEqual([]);
  });
});

describe("U22: a rider-bail re-broadcast keeps the trip's delivery code", () => {
  function bail(src: Record<string, unknown>) {
    const created: Array<Record<string, unknown>> = [];
    const h = build({
      order: {
        findUnique: async () => ({ status: "assigned", orderType: "parcel", customerId: "c1", riderId: "r1", collectedAt: null, ...src }),
        updateMany: async () => ({ count: 1 }),
        create: async (a: { data: Record<string, unknown> }) => {
          created.push(a.data);
          return { id: "rebroadcast-1" };
        },
      },
      orderEvent: { create: async () => ({}) },
      offer: { updateMany: async () => ({ count: 0 }) },
      rider: { findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }), update: async () => ({}) },
    });
    return { ...h, created };
  }

  it("copies the hash, the ciphertext and the rotation stamp into the clone", async () => {
    const rotatedAt = new Date("2026-10-07T08:00:00Z");
    const h = bail({ ...sealed("418290"), deliveryCodeRotatedAt: rotatedAt });
    await h.svc.cancel("o1", "r1");
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ otpHash: tokens.hash("418290"), deliveryCodeRotatedAt: rotatedAt, status: "open_for_offers" });
    expect(pii.decryptCode(h.created[0]!.otpCipher as string)).toBe("418290");
  });

  it("a legacy hash-only code is not carried (selectOffer then mints a fresh one, the pre-D2 behaviour)", async () => {
    const h = bail({ otpHash: tokens.hash("418290"), otpCipher: null, deliveryCodeRotatedAt: new Date() });
    await h.svc.cancel("o1", "r1");
    expect(h.created[0]).not.toHaveProperty("otpHash");
    expect(h.created[0]).not.toHaveProperty("otpCipher");
  });
});
