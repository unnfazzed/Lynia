/**
 * Owner decision D2 (2026-10-07), cluster C7. The delivery code is stored sealed next to its hash, so
 * showing it is repeatable (U19, U20), rotation is the explicit re-issue only (U04), and a rider-bail
 * re-match keeps the code the recipient already holds (U22). Verification is still the hash.
 *
 * D2 review (2026-10-11): only a lockout re-issue resets the tries, and an order gets at most
 * HANDOVER_CODE_MAX_REISSUES of them; the ciphertext is bound to its order (AAD); a re-issue is pinned so
 * two devices produce one new code; a legacy reveal keeps the tries.
 */
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { HANDOVER_CODE_MAX_REISSUES } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import type { Env } from "../config/env";
import { MerchantOrderController } from "../merchant/merchant-order.controller";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { WalletService } from "../wallet/wallet.service";
import { LifecycleController } from "./lifecycle.controller";
import { OrderLifecycleService } from "./order-lifecycle.service";
import type { OrdersService } from "./orders.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "delivery-code-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "delivery-code-test-pii-key-0123456789abcdef" } as Env);
const ORDER = "o1";
const sealed = (code: string, orderId = ORDER) => ({ otpHash: tokens.hash(code), otpCipher: pii.encryptCode(code, `delivery:${orderId}`) });

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>, opts: { crypto?: false } = {}) {
  const emits: Array<[string, string]> = [];
  const pushes: Array<{ to: string[]; title: string; body: string; data?: Record<string, string> }> = [];
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
    {
      notifyOrderStatus: async () => {},
      notifyProfiles: async (to: string[], msg: { title: string; body: string; data?: Record<string, string> }) => void pushes.push({ to, ...msg }),
    } as unknown as NotificationsService,
    { announceOpenOrder: vi.fn(async () => {}) } as unknown as OrdersService,
    { chargeCommission: vi.fn(async () => {}) } as unknown as WalletService,
    undefined,
    undefined,
    undefined,
    opts.crypto === false ? undefined : pii,
  );
  return { svc, emits, pushes, prisma };
}

type Row = Record<string, unknown> & {
  otpHash: string | null;
  otpCipher: string | null;
  deliveryOtpAttempts: number;
  deliveryCodeReissues: number;
};

/** Prisma `where` equality for the flat fields the code CAS uses (`{ in }`, `{ gte }` included). */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === "id") return true;
    if (v && typeof v === "object" && "in" in (v as object)) return (v as { in: unknown[] }).in.includes(row[k]);
    if (v && typeof v === "object" && "gte" in (v as object)) return (row[k] as number) >= (v as { gte: number }).gte;
    return row[k] === v;
  });
}

/** Applies a Prisma `data` object, `{ increment }` included. */
function apply(row: Row, data: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(data)) {
    row[k] = v && typeof v === "object" && "increment" in (v as object) ? (row[k] as number) + (v as { increment: number }).increment : v;
  }
}

/** A stateful order row behind findUnique / updateMany. */
function codeHarness(seed: Partial<Row>, opts: { crypto?: false } = {}) {
  const row: Row = {
    customerId: "c1",
    status: "en_route_dropoff",
    orderType: "parcel",
    otpHash: null,
    otpCipher: null,
    deliveryOtpAttempts: 0,
    deliveryCodeReissues: 0,
    ...seed,
  };
  const writes: Array<Record<string, unknown>> = [];
  const stamps: string[] = [];
  const h = build(
    {
      order: {
        findUnique: async () => ({ ...row }),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(row, where)) return { count: 0 };
          writes.push(data);
          apply(row, data);
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
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "418290" });
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "418290" });
    expect(h.writes).toEqual([]);
    expect(h.stamps).toEqual([]);
    expect(h.emits).toEqual([]);
    expect(h.row.deliveryOtpAttempts).toBe(2);
  });

  it("a lockout rotate → a NEW code sealed next to its hash, tries reset, re-issue counted, rotation stamped and emitted", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    const { deliveryCode } = await h.svc.rotateDeliveryCode(ORDER, "c1");
    expect(deliveryCode).not.toBe("418290");
    expect(h.row.otpHash).toBe(tokens.hash(deliveryCode));
    expect(pii.decryptCode(h.row.otpCipher, `delivery:${ORDER}`)).toBe(deliveryCode);
    expect(h.row.deliveryOtpAttempts).toBe(0);
    expect(h.row.deliveryCodeReissues).toBe(1);
    expect(h.stamps.join()).toContain("delivery_code_rotated_at = now()");
    expect(h.emits).toEqual([[ORDER, "en_route_dropoff"]]);
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode });
    expect(h.writes).toHaveLength(1);
  });

  // D2 review item 1: before the cap a rider could cycle 5 guesses → (auto) re-issue → 5 guesses for ever.
  it(`refuses a lockout re-issue past HANDOVER_CODE_MAX_REISSUES (${HANDOVER_CODE_MAX_REISSUES}) with code_reissue_limit — nothing written`, async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5, deliveryCodeReissues: HANDOVER_CODE_MAX_REISSUES });
    await expect(h.svc.rotateDeliveryCode(ORDER, "c1")).rejects.toMatchObject({ status: 409, response: { reason: "code_reissue_limit" } });
    expect(h.writes).toEqual([]);
    expect(h.row.deliveryOtpAttempts).toBe(5);
    expect(h.emits).toEqual([]);
  });

  it("caps the guesses per order: re-issues 1 and 2 go through, the third lock is refused", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    await h.svc.rotateDeliveryCode(ORDER, "c1");
    h.row.deliveryOtpAttempts = 5;
    await h.svc.rotateDeliveryCode(ORDER, "c1");
    expect(h.row.deliveryCodeReissues).toBe(2);
    h.row.deliveryOtpAttempts = 5;
    await expect(h.svc.rotateDeliveryCode(ORDER, "c1")).rejects.toMatchObject({ response: { reason: "code_reissue_limit" } });
  });

  // Second review F1: an unlocked rotate must not kill the code the recipient already holds.
  it("an old-client rotate-on-open (code not locked) returns the CURRENT code — nothing minted, written, stamped or emitted", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 3 });
    expect(await h.svc.rotateDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "418290" });
    expect(h.writes).toEqual([]);
    expect(h.stamps).toEqual([]);
    expect(h.emits).toEqual([]);
    expect(h.row.deliveryOtpAttempts).toBe(3);
    expect(h.row.deliveryCodeReissues).toBe(0);
  });

  it("F1: a second device on a stale (locked) snapshot rotating after the first re-issued gets the SAME re-issued code", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    const a = await h.svc.rotateDeliveryCode(ORDER, "c1"); // device A: the lockout re-issue
    expect(a.deliveryCode).not.toBe("418290");
    expect(h.row.deliveryOtpAttempts).toBe(0);
    const b = await h.svc.rotateDeliveryCode(ORDER, "c1"); // device B still saw 5 tries
    expect(b).toEqual(a);
    expect(h.writes).toHaveLength(1);
    expect(h.row.deliveryCodeReissues).toBe(1);
    expect(h.row.otpHash).toBe(tokens.hash(a.deliveryCode));
  });

  it("F1: the merchant booking's explicit \"Send a new code\" (replace) still mints while unlocked, keeping the tries", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 3 });
    const { deliveryCode } = await h.svc.rotateDeliveryCode(ORDER, "c1", { replace: true });
    expect(deliveryCode).not.toBe("418290");
    expect(h.row.otpHash).toBe(tokens.hash(deliveryCode));
    expect(h.row.deliveryOtpAttempts).toBe(3);
    expect(h.row.deliveryCodeReissues).toBe(0);
  });

  // D2 review item 5.
  it("two devices re-issuing on the same lock produce ONE new code; the second gets the first's code", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    const order = h.prisma.order as Record<string, unknown>;
    let first = true;
    order.findUnique = async () => {
      const snapshot = { ...h.row };
      if (first) {
        first = false;
        // The other device's re-issue lands between this rotate's read (locked) and its write.
        Object.assign(h.row, sealed("777888"), { deliveryOtpAttempts: 0, deliveryCodeReissues: 1 });
      }
      return snapshot;
    };
    expect(await h.svc.rotateDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "777888" });
    expect(h.writes).toEqual([]);
    expect(h.row.deliveryCodeReissues).toBe(1);
  });

  it("U04: a LOCKED code is returned as-is by reveal (no silent reset) — only the explicit rotate re-issues", async () => {
    const h = codeHarness({ ...sealed("418290"), deliveryOtpAttempts: 5 });
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "418290" });
    expect(h.row.deliveryOtpAttempts).toBe(5);
    expect(h.writes).toEqual([]);
  });

  it("legacy row (hash only, pre-0086) → the first reveal mints once, pinned on the old hash, KEEPING the tries; later reveals are stable", async () => {
    const h = codeHarness({ otpHash: tokens.hash("111111"), deliveryOtpAttempts: 4 });
    const first = await h.svc.revealDeliveryCode(ORDER, "c1");
    expect(first.deliveryCode).toMatch(/^\d{6}$/);
    expect(h.writes).toHaveLength(1);
    expect(h.row.otpHash).toBe(tokens.hash(first.deliveryCode));
    expect(pii.decryptCode(h.row.otpCipher, `delivery:${ORDER}`)).toBe(first.deliveryCode);
    // D2 review item 3: a reveal never buys the rider more guesses.
    expect(h.row.deliveryOtpAttempts).toBe(4);
    expect(h.row.deliveryCodeReissues).toBe(0);
    expect(h.emits).toEqual([[ORDER, "en_route_dropoff"]]);
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual(first);
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
    expect(await h.svc.revealDeliveryCode(ORDER, "c1")).toEqual({ deliveryCode: "777888" });
  });

  it("a ciphertext that doesn't open to the stored hash is never shown", async () => {
    const h = codeHarness({ otpHash: tokens.hash("222222"), otpCipher: pii.encryptCode("999999", `delivery:${ORDER}`) });
    const res = await h.svc.revealDeliveryCode(ORDER, "c1");
    expect(res.deliveryCode).not.toBe("999999");
    expect(h.row.otpHash).toBe(tokens.hash(res.deliveryCode));
  });

  // D2 review item 6 (AAD) + item 3 (value-free log).
  it("a ciphertext sealed for ANOTHER order doesn't open here; the failure is logged without any value", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      const h = codeHarness(sealed("418290", "o2"));
      const res = await h.svc.revealDeliveryCode(ORDER, "c1");
      expect(res.deliveryCode).not.toBe("418290");
      const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/did not authenticate \(kind=delivery, order=o1\)/);
      expect(logged).not.toContain("418290");
      expect(logged).not.toContain(res.deliveryCode);
      expect(logged).not.toContain("c1:");
    } finally {
      warn.mockRestore();
    }
  });

  it("reveal keeps rotate's guards: another customer, a finished trip, and the R-09 cash gate", async () => {
    await expect(codeHarness(sealed("418290")).svc.revealDeliveryCode(ORDER, "other")).rejects.toThrow(/not your order/i);
    await expect(codeHarness({ ...sealed("418290"), status: "delivered" }).svc.revealDeliveryCode(ORDER, "c1")).rejects.toThrow(/no active delivery/i);
    const cashPending = codeHarness({
      ...sealed("418290"),
      orderType: "merchant",
      merchantPaymentMethod: "cash",
      customerCashConfirmedAt: new Date(),
      riderCashConfirmedAt: null,
    });
    await expect(cashPending.svc.revealDeliveryCode(ORDER, "c1")).rejects.toThrow(/confirm the cash exchange/i);
  });

  it("without the crypto service (pre-D2 harness) reveal degrades to a pinned one-time mint, never a throw", async () => {
    const h = codeHarness({ otpHash: tokens.hash("111111") }, { crypto: false });
    const res = await h.svc.revealDeliveryCode(ORDER, "c1");
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
    await expect(svc.confirmDelivery(ORDER, "r1", "000001")).rejects.toThrow(/4 attempts left/i);
    expect(attempts).toBe(1);
    expect(await svc.confirmDelivery(ORDER, "r1", "418290")).toEqual({ orderId: ORDER, status: "delivered" });
    expect(delivered).toMatchObject({ status: "delivered", otpCipher: null });
  });

  it("U04: the try that locks the code emits order:status so an open customer screen re-issues at once", async () => {
    const { svc, emits } = build({ $queryRaw: async () => rawRow({ delivery_otp_attempts: 4 }), order: { update: async () => ({}) } });
    await expect(svc.confirmDelivery(ORDER, "r1", "000001")).rejects.toThrow(/no attempts left/i);
    expect(emits).toEqual([[ORDER, "en_route_dropoff"]]);
  });

  it("D-97 (2.14b): the try that locks the code pushes the customer “Your code changed” — never the digits", async () => {
    const { svc, pushes } = build({ $queryRaw: async () => rawRow({ delivery_otp_attempts: 4, customer_id: "c1" }), order: { update: async () => ({}) } });
    await expect(svc.confirmDelivery(ORDER, "r1", "000001")).rejects.toThrow(/no attempts left/i);
    expect(pushes).toEqual([{ to: ["c1"], title: "Your code changed", body: "Open to share it again.", data: { orderId: ORDER, kind: "code_changed" } }]);
    expect(JSON.stringify(pushes)).not.toMatch(/\d{3}/);
  });

  it("an earlier wrong try does not emit or push", async () => {
    const { svc, emits, pushes } = build({ $queryRaw: async () => rawRow({ delivery_otp_attempts: 1, customer_id: "c1" }), order: { update: async () => ({}) } });
    await expect(svc.confirmDelivery(ORDER, "r1", "000001")).rejects.toThrow(/3 attempts left/i);
    expect(emits).toEqual([]);
    expect(pushes).toEqual([]);
  });
});

describe("D2 review: code-entry routes are rate-limited per rider", () => {
  const throttleOf = (fn: unknown): ThrottleOptions[] => {
    const meta = Reflect.getMetadata(THROTTLE_KEY, fn as object) as ThrottleOptions | ThrottleOptions[] | undefined;
    return meta == null ? [] : Array.isArray(meta) ? meta : [meta];
  };

  it("POST /orders/:id/deliver carries a throttle keyed by the signed-in rider (no IP key)", () => {
    const rules = throttleOf(LifecycleController.prototype.deliver);
    expect(rules.map((r) => r.keyPrefix)).toContain("delivery-code-confirm");
    for (const r of rules) expect(r.key).toBeUndefined();
  });

  it("POST /merchant/orders/:id/confirm-pickup does too", () => {
    const rules = throttleOf(MerchantOrderController.prototype.confirmPickup);
    expect(rules.map((r) => r.keyPrefix)).toContain("pickup-code-confirm");
    for (const r of rules) expect(r.key).toBeUndefined();
  });
});

describe("U22: a rider-bail re-broadcast keeps the trip's delivery code", () => {
  function bail(src: Record<string, unknown>, live: Record<string, unknown> = {}) {
    const created: Array<Record<string, unknown>> = [];
    // `live` is the row as it stands at the CAS (e.g. a re-issue landed after the cancel's read).
    const row = { status: "assigned", ...src, ...live } as Record<string, unknown>;
    const h = build({
      order: {
        findUnique: async () => ({ status: "assigned", orderType: "parcel", customerId: "c1", riderId: "r1", collectedAt: null, ...src }),
        updateMany: async ({ where }: { where: Record<string, unknown> }) => ({
          count: Object.entries(where).every(([k, v]) => k === "id" || v === undefined || row[k] === v) ? 1 : 0,
        }),
        create: async (a: { data: Record<string, unknown> }) => {
          created.push(a.data);
          return { id: (a.data.id as string | undefined) ?? "rebroadcast-1" };
        },
      },
      orderEvent: { create: async () => ({}) },
      offer: { updateMany: async () => ({ count: 0 }) },
      rider: { findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }), update: async () => ({}) },
    });
    return { ...h, created };
  }

  it("carries the code: same hash and stamp, RE-SEALED under the clone's own id (a copied ciphertext would not open there)", async () => {
    const rotatedAt = new Date("2026-10-07T08:00:00Z");
    const source = sealed("418290");
    const h = bail({ ...source, deliveryCodeRotatedAt: rotatedAt });
    await h.svc.cancel(ORDER, "r1");
    expect(h.created).toHaveLength(1);
    const clone = h.created[0]!;
    expect(clone).toMatchObject({ otpHash: tokens.hash("418290"), deliveryCodeRotatedAt: rotatedAt, status: "open_for_offers" });
    expect(clone.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(clone.otpCipher).not.toBe(source.otpCipher);
    expect(pii.decryptCode(clone.otpCipher as string, `delivery:${clone.id as string}`)).toBe("418290");
    expect(pii.decryptCode(clone.otpCipher as string, `delivery:${ORDER}`)).toBeNull();
  });

  // D2 second review F6: the clone must carry the code the customer was shown, not one a re-issue replaced.
  it("a re-issue landing between the cancel's read and its CAS makes the cancel a retry — no clone with a dead code", async () => {
    const h = bail({ ...sealed("418290"), deliveryCodeRotatedAt: new Date() }, sealed("604117"));
    await expect(h.svc.cancel(ORDER, "r1")).rejects.toThrow(/order changed, retry/i);
    expect(h.created).toEqual([]);
  });

  it("a legacy hash-only code is not carried (selectOffer then mints a fresh one, the pre-D2 behaviour)", async () => {
    const h = bail({ otpHash: tokens.hash("418290"), otpCipher: null, deliveryCodeRotatedAt: new Date() });
    await h.svc.cancel(ORDER, "r1");
    expect(h.created[0]).not.toHaveProperty("otpHash");
    expect(h.created[0]).not.toHaveProperty("otpCipher");
  });
});
