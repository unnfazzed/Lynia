import { describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { OrdersService } from "./orders.service";
import type { WalletService } from "../wallet/wallet.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "lifecycle-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
/** Push is fire-and-forget; a no-op stub keeps the lifecycle unit tests off the notification path. */
const noopNotifications = { notifyOrderStatus: async () => {}, notifyProfiles: async () => {} } as unknown as NotificationsService;

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>) {
  const emits: Array<[string, string]> = [];
  const jobCancelled: Array<[string, boolean, string]> = [];
  const rebroadcasts: Array<[string, string]> = [];
  const bidExpired: Array<[string, number | undefined, number | undefined]> = [];
  const evicted: string[] = [];
  const kickedFromBoard: string[] = [];
  const evictedFromSupply: string[] = [];
  const gateway = {
    emitOrderStatus: (id: string, s: string) => emits.push([id, s]),
    emitJobCancelled: (id: string, collected: boolean, cancelledBy: string) => jobCancelled.push([id, collected, cancelledBy]),
    emitOrderRebroadcast: (oldId: string, newId: string) => rebroadcasts.push([oldId, newId]),
    // DS13-07: board-close on a cancel of a still-open auction reuses the expiry path's bid:expired.
    emitBidExpired: (id: string, lat?: number, lng?: number) => bidExpired.push([id, lat, lng]),
    // BR-01: markUndelivered evicts an auto-held rider from the geo index (best-effort passthrough).
    evictRiderFromGeo: async (id: string) => { evicted.push(id); },
    // KB-BOARD-REVOKE: markUndelivered also kicks a newly auto-held rider off the board rooms.
    kickRiderFromBoard: async (id: string) => { kickedFromBoard.push(id); },
    // DS17-02: cancel() funnels a 3rd-strike (forced-offline) rider through the standing-demotion funnel.
    evictRiderFromSupply: async (id: string) => { evictedFromSupply.push(id); },
  };
  // F-01 re-broadcast announce is best-effort push — spy so tests can assert it fired without a socket.
  const orders = { announceOpenOrder: vi.fn(async () => {}) };
  // Prepaid commission debit — a no-op stub (the wallet has its own tests); the completion paths call
  // this inside the transaction. At ratePct 0 the real one is a no-op too.
  const wallet = { chargeCommission: vi.fn(async () => {}) };
  // DS18-03: a photo retake purges the superseded GCS object (best-effort). Spy the deletes so a test can
  // assert the previous key was cleaned up when a second attach overwrote the pointer.
  const deletedObjects: string[] = [];
  const storage = { deleteObject: vi.fn(async (k: string) => { deletedObjects.push(k); }) };
  const prisma = { ...methods } as Record<string, unknown>;
  // P1-6 trust tier: rate() counts the customer's PRIOR completed orders to decide if their rating
  // carries reputation weight. Default the count to an established customer (>= CUSTOMER_TRUST) so tests
  // that don't care about trust get the pre-trust-tier behaviour; the untrusted-customer test overrides it.
  const orderStub = prisma.order as Record<string, unknown> | undefined;
  if (orderStub && typeof orderStub.count !== "function") orderStub.count = async () => 5;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  // Rider aggregate mutations take a `SELECT … FOR UPDATE` row lock via $executeRaw before their
  // read-modify-write; give the fake a no-op unless a test overrides it.
  if (!prisma.$executeRaw) prisma.$executeRaw = async () => 0;
  const svc = new OrderLifecycleService(
    {} as Env,
    prisma as unknown as PrismaService,
    tokens,
    gateway as unknown as TrackingGateway,
    noopNotifications,
    orders as unknown as OrdersService,
    wallet as unknown as WalletService,
    storage as unknown as StorageAdapter,
  );
  return { svc, emits, jobCancelled, rebroadcasts, bidExpired, evicted, kickedFromBoard, evictedFromSupply, orders, prisma, wallet, storage, deletedObjects };
}

describe("OrderLifecycleService.advance", () => {
  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.advance("o1", "r1", "confirmed")).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    await expect(svc.advance("o1", "other", "confirmed")).rejects.toThrow(/assigned rider/i);
  });

  it("409s when the order is not in the expected prior state", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    // picked_up requires en_route_pickup; the order is only `assigned`
    await expect(svc.advance("o1", "r1", "picked_up")).rejects.toThrow(/not en_route_pickup/i);
  });

  it("advances assigned → confirmed, stamps the timestamp, and pushes the status", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        findUnique: async () => ({ status: "assigned", riderId: "r1" }),
        updateMany: async (args: { data: Record<string, unknown> }) => { data = args.data; return { count: 1 }; },
      },
      orderEvent: { create: async () => ({}) },
    });
    expect(await svc.advance("o1", "r1", "confirmed")).toEqual({ orderId: "o1", status: "confirmed" });
    expect(data).toMatchObject({ status: "confirmed" });
    expect(data!.confirmedAt).toBeInstanceOf(Date);
    expect(emits).toEqual([["o1", "confirmed"]]);
  });
});

describe("OrderLifecycleService.confirmItems", () => {
  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.confirmItems("o1", "r1", [0])).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "en_route_pickup", riderId: "r1", items: [{}, {}] }) },
    });
    await expect(svc.confirmItems("o1", "other", [0])).rejects.toThrow(/assigned rider/i);
  });

  it("409s when the order is not at the pickup", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "assigned", riderId: "r1", items: [{}, {}] }) },
    });
    await expect(svc.confirmItems("o1", "r1", [0])).rejects.toThrow(/pickup/i);
  });

  it("de-dupes, sorts, and drops out-of-range indexes before persisting", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "en_route_pickup", riderId: "r1", items: [{}, {}, {}] }),
        updateMany: async (args: { data: Record<string, unknown> }) => { data = args.data; return { count: 1 }; },
      },
    });
    const result = await svc.confirmItems("o1", "r1", [2, 0, 0, 9, 1]);
    expect(result).toEqual({ orderId: "o1", confirmedIndexes: [0, 1, 2] });
    expect(data).toEqual({ itemsCollected: [0, 1, 2] });
  });

  // Concurrency: a rider double-tapping "confirm items" while an `advance` to picked_up races in
  // between the read and the write must not silently persist onto the now-stale status.
  it("409s if the order advanced past en_route_pickup between the read and the CAS write", async () => {
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "en_route_pickup", riderId: "r1", items: [{}, {}] }),
        // A concurrent `advance` already flipped the row to picked_up — the CAS `where` no longer matches.
        updateMany: async () => ({ count: 0 }),
      },
    });
    await expect(svc.confirmItems("o1", "r1", [0])).rejects.toThrow(/changed, retry/i);
  });
});

describe("OrderLifecycleService.attachPickupPhoto", () => {
  const key = "pickup/r1/11111111-1111-4111-8111-111111111111.jpg";
  // DS21-01: attachPickupPhoto now reads the row under a `SELECT … FOR UPDATE` $queryRaw (snake_case
  // columns) inside a $transaction, then writes with a plain `order.update` — the lock serialises concurrent
  // callers so nothing can move the row between the locked read and the write (no CAS `updateMany` anymore).
  const row = (over: Record<string, unknown> = {}) => [
    { status: "en_route_pickup", rider_id: "r1", pickup_photo_key: null, ...over },
  ];

  it("404s for a missing order", async () => {
    const { svc } = build({ $queryRaw: async () => [] });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.attachPickupPhoto("o1", "other", key)).rejects.toThrow(/assigned rider/i);
  });

  it("409s outside the attach window (before the pickup leg, and after heading to drop-off)", async () => {
    for (const status of ["assigned", "confirmed", "en_route_dropoff", "delivered", "cancelled"]) {
      const { svc } = build({ $queryRaw: async () => row({ status }) });
      await expect(svc.attachPickupPhoto("o1", "r1", key)).rejects.toThrow(/while collecting/i);
    }
  });

  it("400s a key outside the rider's own pickup namespace (can't persist someone else's object)", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.attachPickupPhoto("o1", "r1", "pickup/victim/photo.jpg")).rejects.toThrow(/invalid photo key/i);
    await expect(svc.attachPickupPhoto("o1", "r1", "kyc/r1/photo.jpg")).rejects.toThrow(/invalid photo key/i);
  });

  it("persists the key at en_route_pickup via a plain (row-locked) update", async () => {
    let args: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    const { svc } = build({
      $queryRaw: async () => row(),
      order: {
        update: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          args = a;
          return {};
        },
      },
    });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: key });
    expect(args!.data).toEqual({ pickupPhotoKey: key });
    expect(args!.where).toEqual({ id: "o1" });
  });

  it("still attaches at picked_up — a slow upload must not lose to the one-tap collect", async () => {
    const { svc } = build({ $queryRaw: async () => row({ status: "picked_up" }), order: { update: async () => ({}) } });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: key });
  });

  it("re-attaching replaces the key (idempotent retake) — same write, no duplicate state", async () => {
    const retake = "pickup/r1/22222222-2222-4222-8222-222222222222.jpg";
    const writes: Record<string, unknown>[] = [];
    const { svc } = build({
      $queryRaw: async () => row(),
      order: {
        update: async (a: { data: Record<string, unknown> }) => {
          writes.push(a.data);
          return {};
        },
      },
    });
    await svc.attachPickupPhoto("o1", "r1", key);
    await expect(svc.attachPickupPhoto("o1", "r1", retake)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: retake });
    expect(writes).toEqual([{ pickupPhotoKey: key }, { pickupPhotoKey: retake }]);
  });

  it("DS18-03: a retake purges the superseded GCS object so it can't orphan past erasure", async () => {
    const prev = "pickup/r1/00000000-0000-4000-8000-000000000000.jpg";
    const { svc, deletedObjects } = build({
      // The order already carries a previous pickup photo; this attach overwrites the pointer.
      $queryRaw: async () => row({ status: "picked_up", pickup_photo_key: prev }),
      order: { update: async () => ({}) },
    });
    await svc.attachPickupPhoto("o1", "r1", key);
    // The old object is deleted; the new key is left intact (only the superseded one is purged).
    expect(deletedObjects).toEqual([prev]);
  });

  it("DS18-03: a first attach (no previous key) deletes nothing", async () => {
    const { svc, deletedObjects } = build({
      $queryRaw: async () => row({ pickup_photo_key: null }),
      order: { update: async () => ({}) },
    });
    await svc.attachPickupPhoto("o1", "r1", key);
    expect(deletedObjects).toEqual([]);
  });

  // DS21-01: the previous-key read and the write must both run INSIDE the same row-locked $transaction, and
  // the superseded-object purge must use the key read UNDER THE LOCK — not a value read before the tx. This
  // is what closes the concurrent-double-attach orphan: a second caller blocking on FOR UPDATE reads the
  // FIRST caller's just-committed key and deletes IT. Here `$queryRaw` returns the key a concurrent writer
  // committed first; the purge must target exactly that key.
  it("DS21-01: reads the prior key + writes inside ONE $transaction and purges the lock-read key (race-safe)", async () => {
    const concurrentlyCommitted = "pickup/r1/99999999-9999-4999-8999-999999999999.jpg";
    let insideTx = false;
    let queryInsideTx: boolean | undefined;
    let updateInsideTx: boolean | undefined;
    const h = build({
      $queryRaw: async () => {
        queryInsideTx = insideTx;
        return row({ status: "picked_up", pickup_photo_key: concurrentlyCommitted });
      },
      order: {
        update: async () => {
          updateInsideTx = insideTx;
          return {};
        },
      },
    });
    // build() installs a passthrough $transaction; wrap it so we can assert both the read and the write ran
    // inside the callback (i.e. under the FOR UPDATE lock), not before entering it.
    const passthrough = (h.prisma as unknown as { $transaction: (cb: (tx: unknown) => unknown) => unknown }).$transaction;
    (h.prisma as unknown as Record<string, unknown>).$transaction = async (cb: (tx: unknown) => unknown) => {
      insideTx = true;
      try {
        return await passthrough(cb);
      } finally {
        insideTx = false;
      }
    };
    await h.svc.attachPickupPhoto("o1", "r1", key);
    expect(queryInsideTx).toBe(true);
    expect(updateInsideTx).toBe(true);
    // The loser's object (the key the concurrent writer committed, observed under the lock) is purged — no
    // orphan escapes the right-to-erasure purge.
    expect(h.deletedObjects).toEqual([concurrentlyCommitted]);
  });

  // DS21-01: two SEQUENTIAL attaches with different keys (the serialized outcome the lock guarantees for two
  // concurrent ones) purge exactly the FIRST key, exactly once — the second read observes the first's stored
  // key and deletes it. Models the race being closed rather than each request purging only its own stale read.
  it("DS21-01: sequential attaches with different keys purge exactly the first key once", async () => {
    const first = "pickup/r1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
    const second = "pickup/r1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg";
    let stored: string | null = null;
    const { svc, deletedObjects } = build({
      // The locked read reflects whatever a prior committed attach left in the column.
      $queryRaw: async () => row({ status: "picked_up", pickup_photo_key: stored }),
      order: { update: async (a: { data: Record<string, unknown> }) => { stored = a.data.pickupPhotoKey as string; return {}; } },
    });
    await svc.attachPickupPhoto("o1", "r1", first);
    await svc.attachPickupPhoto("o1", "r1", second);
    expect(deletedObjects).toEqual([first]);
  });
});

describe("OrderLifecycleService.attachDeliveryProof (KB-POD-DISPUTE Phase A)", () => {
  const key = "delivery-proof/r1/11111111-1111-4111-8111-111111111111.jpg";
  // DS21-01: same row-locked read (`SELECT … FOR UPDATE` via $queryRaw, snake_case columns) + plain update
  // as attachPickupPhoto.
  const row = (over: Record<string, unknown> = {}) => [
    { status: "en_route_dropoff", rider_id: "r1", delivery_proof_key: null, ...over },
  ];

  it("404s for a missing order", async () => {
    const { svc } = build({ $queryRaw: async () => [] });
    await expect(svc.attachDeliveryProof("o1", "r1", key)).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.attachDeliveryProof("o1", "other", key)).rejects.toThrow(/assigned rider/i);
  });

  it("409s outside the attach window (only at the door or right after undelivered)", async () => {
    for (const status of ["assigned", "confirmed", "en_route_pickup", "picked_up", "delivered", "completed", "cancelled"]) {
      const { svc } = build({ $queryRaw: async () => row({ status }) });
      await expect(svc.attachDeliveryProof("o1", "r1", key)).rejects.toThrow(/proof of drop-off/i);
    }
  });

  it("400s a key outside the rider's own delivery-proof namespace", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.attachDeliveryProof("o1", "r1", "delivery-proof/victim/p.jpg")).rejects.toThrow(/invalid photo key/i);
    await expect(svc.attachDeliveryProof("o1", "r1", "pickup/r1/p.jpg")).rejects.toThrow(/invalid photo key/i);
  });

  it("persists key + GPS + a server timestamp via a plain (row-locked) update (at the door AND after undelivered)", async () => {
    let args: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    const { svc } = build({
      $queryRaw: async () => row({ status: "undelivered" }),
      order: {
        update: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { args = a; return {}; },
      },
    });
    await expect(svc.attachDeliveryProof("o1", "r1", key, -17.83, 31.05)).resolves.toEqual({ orderId: "o1", deliveryProofKey: key });
    expect(args!.where).toEqual({ id: "o1" });
    expect(args!.data).toMatchObject({ deliveryProofKey: key, deliveryProofLat: -17.83, deliveryProofLng: 31.05 });
    expect(args!.data.deliveryProofAt).toBeInstanceOf(Date);
  });

  it("allows attaching without GPS (a denied/failed fix must never block the photo) — coords null", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc } = build({
      $queryRaw: async () => row(),
      order: {
        update: async (a: { data: Record<string, unknown> }) => { data = a.data; return {}; },
      },
    });
    await svc.attachDeliveryProof("o1", "r1", key);
    expect(data).toMatchObject({ deliveryProofKey: key, deliveryProofLat: null, deliveryProofLng: null });
  });

  it("DS18-03: a proof retake purges the superseded GCS object (best-effort, post-commit)", async () => {
    const prev = "delivery-proof/r1/00000000-0000-4000-8000-000000000000.jpg";
    const { svc, deletedObjects } = build({
      $queryRaw: async () => row({ delivery_proof_key: prev }),
      order: { update: async () => ({}) },
    });
    await svc.attachDeliveryProof("o1", "r1", key);
    expect(deletedObjects).toEqual([prev]);
  });

  // DS21-01: the superseded purge uses the delivery-proof key read UNDER THE LOCK, not a pre-tx read — so a
  // concurrent second proof attach reads the first's just-committed key and purges it (no orphan). Mirrors
  // the attachPickupPhoto race test.
  it("DS21-01: purges the lock-read prior key (race-safe orphan close)", async () => {
    const concurrentlyCommitted = "delivery-proof/r1/99999999-9999-4999-8999-999999999999.jpg";
    let insideTx = false;
    let queryInsideTx: boolean | undefined;
    let updateInsideTx: boolean | undefined;
    const h = build({
      $queryRaw: async () => {
        queryInsideTx = insideTx;
        return row({ delivery_proof_key: concurrentlyCommitted });
      },
      order: {
        update: async () => {
          updateInsideTx = insideTx;
          return {};
        },
      },
    });
    const passthrough = (h.prisma as unknown as { $transaction: (cb: (tx: unknown) => unknown) => unknown }).$transaction;
    (h.prisma as unknown as Record<string, unknown>).$transaction = async (cb: (tx: unknown) => unknown) => {
      insideTx = true;
      try {
        return await passthrough(cb);
      } finally {
        insideTx = false;
      }
    };
    await h.svc.attachDeliveryProof("o1", "r1", key);
    expect(queryInsideTx).toBe(true);
    expect(updateInsideTx).toBe(true);
    expect(h.deletedObjects).toEqual([concurrentlyCommitted]);
  });
});

describe("OrderLifecycleService.confirmDelivery", () => {
  // confirmDelivery reads the row via a FOR UPDATE $queryRaw (snake_case columns).
  const row = (over: Record<string, unknown> = {}) => [
    { status: "en_route_dropoff", rider_id: "r1", otp_hash: tokens.hash("123456"), delivery_otp_attempts: 0, ...over },
  ];

  it("409s when the order is not ready for delivery", async () => {
    const { svc } = build({ $queryRaw: async () => row({ status: "picked_up" }) });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/not ready/i);
  });

  it("locks after too many wrong attempts", async () => {
    const { svc } = build({ $queryRaw: async () => row({ delivery_otp_attempts: 5 }) });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/too many attempts/i);
  });

  it("rejects a wrong code and increments the attempt counter", async () => {
    let incremented = false;
    const { svc } = build({
      $queryRaw: async () => row({ otp_hash: tokens.hash("111111") }),
      order: {
        update: async (a: { data?: Record<string, unknown> }) => {
          if (a.data?.deliveryOtpAttempts) incremented = true;
          return {};
        },
      },
    });
    // 4·b1: the wrong-code error now carries the remaining attempt count (5 max − 1 used = 4 left).
    await expect(svc.confirmDelivery("o1", "r1", "222222")).rejects.toThrow(/4 attempts left/i);
    expect(incremented).toBe(true);
  });

  it("tells the rider no attempts are left on the final wrong guess", async () => {
    const { svc } = build({
      // Fourth attempt already recorded (0-indexed: 4 used) — this wrong guess is the 5th and last.
      $queryRaw: async () => row({ otp_hash: tokens.hash("111111"), delivery_otp_attempts: 4 }),
      order: { update: async () => ({}) },
    });
    await expect(svc.confirmDelivery("o1", "r1", "222222")).rejects.toThrow(/no attempts left/i);
  });

  it("accepts the correct code and marks the order delivered", async () => {
    const { svc, emits } = build({
      $queryRaw: async () => row(),
      order: { update: async () => ({}) },
      orderEvent: { create: async () => ({}) },
    });
    expect(await svc.confirmDelivery("o1", "r1", "123456")).toEqual({ orderId: "o1", status: "delivered" });
    expect(emits).toEqual([["o1", "delivered"]]);
  });
});

describe("OrderLifecycleService.rate", () => {
  it("409s when the order is not awaiting a rating", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", customerId: "c1", riderId: "r1" }) } });
    await expect(svc.rate("o1", "c1", 5)).rejects.toThrow(/awaiting a rating/i);
  });

  it("403s when the caller is not the customer", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }) } });
    await expect(svc.rate("o1", "other", 5)).rejects.toThrow(/not your order/i);
  });

  it("completes the order and updates the rider's running average", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      // P1-6: rate() counts prior ratings from this customer→rider pair before touching the aggregate.
      // 0 = a distinct (new) pair → the aggregate updates as before.
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 5, reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    expect(await svc.rate("o1", "c1", 5)).toEqual({ orderId: "o1", status: "completed" });
    // (4.0*2 + 5) / 3 = 4.333...
    expect(riderData!.ratingAvg).toBeCloseTo(4.3333, 3);
    expect(riderData).toMatchObject({ ratingCount: 3, tripsCount: 6 });
    // Q2: a good rating (> LOW_RATING_AT) is a clean completion → +RECOVER_PER_COMPLETION (90 → 92).
    expect(riderData).toMatchObject({ reliabilityScore: 92, onHold: false });
    expect(emits).toEqual([["o1", "completed"]]);
  });

  it("Q2: a low rating (<= LOW_RATING_AT) penalises the rider and can trip on_hold", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      // P1-6: rate() counts prior ratings from this customer→rider pair before touching the aggregate.
      // 0 = a distinct (new) pair → the aggregate updates as before.
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        // 68 is already below ON_HOLD_CLEAR_AT(70); a -lowRating(10) → 58 < ON_HOLD_BELOW(60) trips on_hold.
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 1, tripsCount: 3, reliabilityScore: 68, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 2);
    expect(riderData).toMatchObject({ reliabilityScore: 58, onHold: true });
  });

  it("P1-6: a REPEAT (same customer→rider) 5-star does NOT inflate the aggregate or recover reliability (anti-collusion)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      // This pair already rated once before → the aggregate must not move again.
      rating: { create: async () => ({}), count: async () => 1 },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 5, reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 5);
    // ratingAvg/ratingCount unchanged (no farming of the public star average); reliabilityScore NOT
    // recovered (no free +RECOVER for a repeat pair). tripsCount still reflects the real delivery.
    expect(riderData).toMatchObject({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 6 });
    expect(riderData).not.toHaveProperty("reliabilityScore");
  });

  it("P1-6: a REPEAT pair's LOW rating STILL penalises (accountability can't be dodged by being a repeat counterparty)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      rating: { create: async () => ({}), count: async () => 1 }, // repeat pair
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 3, tripsCount: 3, reliabilityScore: 68, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 2);
    // The penalty applies (68 → 58, trips on_hold) even though the aggregate stays put for the repeat pair.
    expect(riderData).toMatchObject({ ratingAvg: 5, ratingCount: 3, reliabilityScore: 58, onHold: true });
  });

  it("P1-6 trust tier: an UNTRUSTED customer (< CUSTOMER_TRUST completed orders) carries ZERO reputation weight — both directions", async () => {
    // A brand-new sock-puppet customer with only this order completed → not established → its rating must
    // move neither the public aggregate nor the reliability score (kills distinct-sock-puppet up/down farming).
    let hiData: Record<string, unknown> | undefined;
    const { svc: hiSvc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "new-cust", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0, // no PRIOR completed orders for this customer → untrusted
      },
      rating: { create: async () => ({}), count: async () => 0 }, // distinct pair (irrelevant while untrusted)
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 5, reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { hiData = args.data; return {}; },
      },
    });
    await hiSvc.rate("o1", "new-cust", 5);
    // A 5-star from an untrusted account: aggregate untouched, no reliability recovery. tripsCount unchanged.
    expect(hiData).toMatchObject({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 6 });
    expect(hiData).not.toHaveProperty("reliabilityScore");

    // …and the mirror: a 1-star from an untrusted account can't tank a rider's hold gate either.
    let loData: Record<string, unknown> | undefined;
    const { svc: loSvc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "new-cust", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0,
      },
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 1, tripsCount: 3, reliabilityScore: 62, onHold: false, heldReason: null }),
        update: async (args: { data: Record<string, unknown> }) => { loData = args.data; return {}; },
      },
    });
    await loSvc.rate("o1", "new-cust", 1);
    // Score would have dropped 62 → 52 (on_hold) if the untrusted 1-star counted; it must NOT.
    expect(loData).not.toHaveProperty("reliabilityScore");
    expect(loData).not.toHaveProperty("onHold");
  });

  it("WD-005: re-reads agreedFare after the CAS lock, so a concurrent fare-adjust can't produce a stale commission charge", async () => {
    let findCount = 0;
    const { svc, wallet } = build({
      order: {
        findUnique: async () => {
          findCount += 1;
          // 1st call: the pre-CAS snapshot ($10, stale). 2nd call: the post-CAS re-read reflects a
          // concurrent admin fare-adjust that landed in between, now $7 — chargeCommission must see this.
          return { status: "delivered", customerId: "c1", riderId: "r1", agreedFare: findCount === 1 ? 10 : 7 };
        },
        updateMany: async () => ({ count: 1 }),
      },
      // P1-6: rate() counts prior ratings from this customer→rider pair before touching the aggregate.
      // 0 = a distinct (new) pair → the aggregate updates as before.
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 4, ratingCount: 1, tripsCount: 1, reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async () => ({}),
      },
    });
    await svc.rate("o1", "c1", 5);
    expect(wallet.chargeCommission).toHaveBeenCalledWith(expect.anything(), { orderId: "o1", riderId: "r1", agreedFare: 7 });
  });

  // DS19-01: a low rating whose penalty NEWLY trips onHold is a standing demotion — like markUndelivered's
  // velocity hold and cancel()'s strike limit it must force the rider offline in the same write AND evict
  // them from the live-supply planes post-commit, else a rating-held rider stays isOnline:true, a board/geo ghost.
  it("DS19-01: a low rating that newly trips onHold forces the rider offline and evicts them from supply", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 5, // established/trusted customer → the rating carries reliability weight
      },
      rating: { create: async () => ({}), count: async () => 0 }, // distinct pair
      orderEvent: { create: async () => ({}) },
      rider: {
        // 68 - lowRating(10) = 58 < ON_HOLD_BELOW(60) → newly trips onHold; the rider was online + not held.
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 1, tripsCount: 3, reliabilityScore: 68, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 2);
    // Forced offline in the same write as the hold…
    expect(riderData).toMatchObject({ reliabilityScore: 58, onHold: true, isOnline: false });
    // …and evicted from BOTH supply planes (geo + board) through the funnel, post-commit + best-effort.
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual(["r1"]);
  });

  it("DS19-01: a rating that does NOT trip onHold leaves isOnline untouched and evicts nobody", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        // A clean 5-star → +RECOVER, well clear of the hold threshold; no demotion.
        findUnique: async () => ({ ratingAvg: 4, ratingCount: 2, tripsCount: 5, reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 5);
    expect(riderData).not.toHaveProperty("isOnline");
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual([]);
  });

  it("DS19-01: a low rating from an UNTRUSTED customer (reliability stays {}) never forces offline or evicts", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "new-cust", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0, // untrusted customer → reliability stays {} → no penalty applied at all
      },
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        // Score sits one lowRating penalty above the threshold — it WOULD trip if the untrusted rating counted.
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 1, tripsCount: 3, reliabilityScore: 68, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.rate("o1", "new-cust", 1);
    expect(riderData).not.toHaveProperty("isOnline");
    expect(riderData).not.toHaveProperty("onHold");
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual([]);
  });
});

describe("OrderLifecycleService.rateSender", () => {
  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) } });
    await expect(svc.rateSender("o1", "other", 5)).rejects.toThrow(/not your order/i);
  });

  it("409s when the order is not awaiting a rating", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/awaiting a rating/i);
  });

  it("409s when the sender was already rated", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) },
      rating: { findUnique: async () => ({ id: "sr1" }) },
    });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/already rated/i);
  });

  it("records the rating without changing the order status (delivered)", async () => {
    let created: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) },
      rating: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => { created = args.data; return {}; },
      },
    });
    expect(await svc.rateSender("o1", "r1", 4, "cash was short")).toEqual({ orderId: "o1", status: "delivered" });
    expect(created).toMatchObject({ orderId: "o1", byProfileId: "r1", score: 4, comment: "cash was short" });
    // Recorded-only: it never emits a status change (unlike the customer's rate()).
    expect(emits).toEqual([]);
  });

  it("still records after the customer's rate() closed the order to completed", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "completed", riderId: "r1" }) },
      rating: { findUnique: async () => null, create: async () => ({}) },
    });
    expect(await svc.rateSender("o1", "r1", 5)).toEqual({ orderId: "o1", status: "completed" });
  });
});

describe("OrderLifecycleService.completeOrder (auto-close)", () => {
  it("completes a delivered order and recovers reliability (clean unrated completion, Q2)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 95, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    expect(await svc.completeOrder("o1")).toEqual({ completed: true });
    // +RECOVER_PER_COMPLETION (95 → 97), alongside the trips increment; clamps at MAX(100) elsewhere.
    expect(riderData).toMatchObject({ tripsCount: { increment: 1 }, reliabilityScore: 97, onHold: false });
    expect(emits).toEqual([["o1", "completed"]]);
  });

  it("is a no-op when the order is not delivered (idempotent)", async () => {
    const { svc, emits } = build({ order: { updateMany: async () => ({ count: 0 }) } });
    expect(await svc.completeOrder("o1")).toEqual({ completed: false });
    expect(emits).toEqual([]);
  });
});

describe("OrderLifecycleService.reconcileStaleDeliveries", () => {
  it("closes every stale delivered order (the Redis-independent backstop)", async () => {
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1" }, { id: "o2" }],
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: { findUnique: async () => ({ reliabilityScore: 100, onHold: false, heldReason: null }), update: async () => ({}) },
    });
    expect(await svc.reconcileStaleDeliveries()).toEqual({ closed: 2 });
  });

  it("resolves (never rejects) and returns zero when the findMany itself rejects — F-12 fire-and-forget guard", async () => {
    const { svc } = build({ order: { findMany: async () => { throw new Error("db down"); } } });
    // Runs fire-and-forget from onModuleInit (`void this.reconcileStaleDeliveries()`), so a rejecting
    // findMany would escape as an unhandledRejection and crash the process — it must resolve to zero.
    await expect(svc.reconcileStaleDeliveries()).resolves.toEqual({ closed: 0 });
  });
});

describe("OrderLifecycleService.rotateDeliveryCode", () => {
  it("issues a fresh 6-digit code, resets attempts under a CAS guard, and stamps the rotation time (DB now())", async () => {
    let args: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    let sql = "";
    const { svc } = build({
      order: {
        findUnique: async () => ({ customerId: "c1", status: "en_route_dropoff" }),
        updateMany: async (a: typeof args) => { args = a; return { count: 1 }; },
      },
      // KB-DELIVERY-CODE-ROTATION-SIGNAL: the timestamp stamp is a raw write so delivery_code_rotated_at
      // is DB now() (one clock domain), run inside the same transaction as the CAS'd hash rotation.
      $executeRaw: async (strings: TemplateStringsArray, ..._vals: unknown[]) => {
        sql = strings.join("?");
        return 1;
      },
    });
    const res = await svc.rotateDeliveryCode("o1", "c1");
    expect(res.deliveryCode).toMatch(/^\d{6}$/);
    expect(args!.data).toMatchObject({ deliveryOtpAttempts: 0 });
    expect(args!.data.otpHash).toBe(tokens.hash(res.deliveryCode));
    // CAS guard: the write only lands while status is still one of the active-for-code statuses.
    expect(args!.where).toMatchObject({ id: "o1" });
    expect(args!.where.status).toMatchObject({ in: expect.arrayContaining(["en_route_dropoff", "assigned"]) });
    // The new robust rotation signal is stamped with the DB clock on every re-issue.
    expect(sql).toContain("delivery_code_rotated_at = now()");
  });

  it("403s for a non-owner", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ customerId: "c1", status: "assigned" }) } });
    await expect(svc.rotateDeliveryCode("o1", "other")).rejects.toThrow(/not your order/i);
  });

  it("409s (CAS conflict) when the order moved out of an active-for-code status between the read and the write", async () => {
    // e.g. the rider's confirmDelivery committed `delivered` concurrently, after this call's own read
    // observed a still-valid status.
    const { svc } = build({
      order: {
        findUnique: async () => ({ customerId: "c1", status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 0 }),
      },
    });
    await expect(svc.rotateDeliveryCode("o1", "c1")).rejects.toThrow(/order changed, retry/i);
  });
});

describe("OrderLifecycleService.cancel", () => {
  const order = (over: Record<string, unknown> = {}) => ({ status: "assigned", customerId: "c1", riderId: "r1", collectedAt: null, ...over });
  // A cancellable fake: findUnique serves both the guard read and cloneForRebroadcast's source read;
  // order.create clones the re-broadcast row; rider.* serves the strike path.
  const cancellable = (extra: Record<string, unknown> = {}) => ({
    order: {
      findUnique: async () => order(),
      updateMany: async () => ({ count: 1 }),
      create: async () => ({ id: "rebroadcast-1" }),
    },
    orderEvent: { create: async () => ({}) },
    offer: { updateMany: async () => ({ count: 0 }) },
    ...extra,
  });

  it("403s for a third party", async () => {
    const { svc } = build({ order: { findUnique: async () => order() } });
    await expect(svc.cancel("o1", "stranger")).rejects.toThrow(/not your order/i);
  });

  it("lets the customer cancel before pickup and tells the assigned rider (collected:false)", async () => {
    const { svc, emits, jobCancelled } = build(cancellable());
    const res = await svc.cancel("o1", "c1", "changed my mind");
    expect(res).toMatchObject({ status: "cancelled", cancelledBy: "customer", cooldownUntil: null });
    expect(emits).toEqual([["o1", "cancelled"]]);
    // C3: a rider was already assigned pre-pickup → job:cancelled with collected:false (back to board),
    // cancelledBy "customer" so the rider's terminal names the actual actor.
    expect(jobCancelled).toEqual([["o1", false, "customer"]]);
  });

  it("customer cancel AFTER pickup pushes job:cancelled with collected:true (hand-back path)", async () => {
    const { svc, jobCancelled } = build(
      // Customer may cancel at any live status; collectedAt set ⇒ post-pickup.
      cancellable({
        order: {
          findUnique: async () => order({ status: "en_route_dropoff", collectedAt: new Date() }),
          updateMany: async () => ({ count: 1 }),
          create: async () => ({ id: "rebroadcast-1" }),
        },
      }),
    );
    const res = await svc.cancel("o1", "c1");
    expect(res.cancelledBy).toBe("customer");
    expect(jobCancelled).toEqual([["o1", true, "customer"]]);
  });

  it("blocks a RIDER cancel once the parcel is collected (post-pickup is undelivered, not cancel)", async () => {
    const { svc } = build({ order: { findUnique: async () => order({ status: "picked_up" }) } });
    await expect(svc.cancel("o1", "r1")).rejects.toThrow(/can't be cancelled anymore/i);
  });

  it("DS13-07: a customer cancel of an OPEN auction closes the board card (bid:expired to the pickup cell)", async () => {
    const { svc, bidExpired } = build(
      cancellable({
        order: {
          // Still open_for_offers (no rider yet) → the board card must be closed for browsing riders.
          findUnique: async () => order({ status: "open_for_offers", riderId: null, pickup: { point: { lat: -17.83, lng: 31.05 } } }),
          updateMany: async () => ({ count: 1 }),
          create: async () => ({ id: "x" }),
        },
      }),
    );
    await svc.cancel("o1", "c1", "changed my mind");
    expect(bidExpired).toEqual([["o1", -17.83, 31.05]]);
  });

  it("DS13-07: a cancel of an ASSIGNED order does NOT emit a board-close signal (never on the board)", async () => {
    const { svc, bidExpired } = build(cancellable()); // default status: "assigned"
    await svc.cancel("o1", "c1");
    expect(bidExpired).toEqual([]);
  });

  it("counts a rider cancel as a strike (below the limit) and re-broadcasts a new open order (F-01)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, orders, jobCancelled, rebroadcasts } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }),
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    expect(res.cancelledBy).toBe("rider");
    expect(res.cooldownUntil).toBeNull();
    // Q2: a rider cancel is always pre-pickup → -prePickupCancel(5) folded into the strike update (80 → 75).
    expect(riderData).toMatchObject({ cancelStrikes: 1, reliabilityScore: 75, onHold: false });
    // F-01: exactly one new open order announced; a rider cancel never fires job:cancelled.
    expect(orders.announceOpenOrder).toHaveBeenCalledTimes(1);
    expect(orders.announceOpenOrder).toHaveBeenCalledWith("rebroadcast-1");
    expect(jobCancelled).toEqual([]);
    // F-01 re-attach: the OLD (cancelled) order's room is told to move to the NEW order id, so the
    // customer lands on the fresh auction instead of the dead cancelled terminal.
    expect(rebroadcasts).toEqual([["o1", "rebroadcast-1"]]);
  });

  it("F-12: a rejected post-commit announceOpenOrder is caught — the rider cancel still resolves", async () => {
    const { svc, orders } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }),
          update: async () => ({}),
        },
      }),
    );
    // The F-01 rebroadcast announce is fire-and-forget after commit; a rejection (e.g. a Redis blip in
    // its schedule) must be swallowed by the call-site .catch so it can't escape as an
    // unhandledRejection and crash the instance. The cancel itself (already committed) still resolves.
    orders.announceOpenOrder.mockRejectedValue(new Error("redis down"));
    await expect(svc.cancel("o1", "r1")).resolves.toMatchObject({ status: "cancelled", cancelledBy: "rider" });
    expect(orders.announceOpenOrder).toHaveBeenCalledWith("rebroadcast-1");
  });

  it("puts the rider on cooldown and forces them offline at the strike limit", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 2 }), // → 3, the limit
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    expect(res.cooldownUntil).toBeInstanceOf(Date);
    expect(riderData).toMatchObject({ cancelStrikes: 0, isOnline: false });
    expect(riderData!.cooldownUntil).toBeInstanceOf(Date);
    // DS17-02: forcing the rider offline is a standing demotion, so they must also be pulled out of the geo
    // + board supply planes through the funnel — otherwise they keep board pushes + stay a GEOSEARCH ghost
    // for the whole 2h cooldown. Post-commit + best-effort, so let the microtask/`void` settle first.
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual(["r1"]);
  });

  it("DS17-02: a rider cancel BELOW the strike limit does NOT evict from supply (they stay online)", async () => {
    const { svc, evictedFromSupply } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }),
          update: async () => ({}),
        },
      }),
    );
    await svc.cancel("o1", "r1");
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual([]);
  });

  // DS19-01: a BELOW-limit rider cancel (strike 1 or 2) whose -prePickupCancel penalty itself pushes the
  // score under ON_HOLD_BELOW newly trips onHold — a standing demotion the strike-limit branch already
  // handled but this branch didn't. It must force the rider offline in-tx and evict them from supply.
  it("DS19-01: a below-limit cancel whose penalty newly trips onHold forces offline + evicts from supply", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build(
      cancellable({
        rider: {
          // 1 prior strike → this is strike 2 (below the limit of 3). Score 63 - prePickupCancel(5) = 58 <
          // ON_HOLD_BELOW(60) → newly trips onHold; the rider was online + not previously held.
          findUnique: async () => ({ cancelStrikes: 1, reliabilityScore: 63, onHold: false, heldReason: null }),
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    // Still below the strike limit → no cooldown, but the reliability hold forced them offline in-tx.
    expect(res.cooldownUntil).toBeNull();
    expect(riderData).toMatchObject({ cancelStrikes: 2, reliabilityScore: 58, onHold: true, isOnline: false });
    // …and evicted from BOTH supply planes through the funnel, post-commit + best-effort.
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual(["r1"]);
  });

  it("DS19-01: a below-limit cancel that does NOT cross the hold threshold leaves isOnline untouched and evicts nobody", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evictedFromSupply } = build(
      cancellable({
        rider: {
          // Score 80 - prePickupCancel(5) = 75, comfortably above ON_HOLD_BELOW(60) → no demotion.
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false, heldReason: null }),
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    await svc.cancel("o1", "r1");
    expect(riderData).not.toHaveProperty("isOnline");
    await new Promise((r) => setTimeout(r, 0));
    expect(evictedFromSupply).toEqual([]);
  });
});

describe("OrderLifecycleService.markUndelivered", () => {
  const row = (over: Record<string, unknown> = {}) => ({ status: "picked_up", riderId: "r1", ...over });

  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.markUndelivered("o1", "r1", "unreachable")).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => row() } });
    await expect(svc.markUndelivered("o1", "other", "unreachable")).rejects.toThrow(/assigned rider/i);
  });

  it("409s before pickup — a hand-off can only fail post-pickup", async () => {
    const { svc } = build({ order: { findUnique: async () => row({ status: "en_route_pickup" }) } });
    await expect(svc.markUndelivered("o1", "r1", "unreachable")).rejects.toThrow(/after the parcel is picked up/i);
  });

  it("marks undelivered post-pickup, stamps the reason + time, and pushes the status; a `refused` applies no score penalty", async () => {
    let data: Record<string, unknown> | undefined;
    let riderUpdated = false;
    const { svc, emits } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async (a: { data: Record<string, unknown> }) => { data = a.data; return { count: 1 }; },
        // FRAUD P0-3 velocity read — a single recent undelivered is below the floor, so no auto-hold.
        count: async () => 1,
      },
      orderEvent: { create: async () => ({}) },
      // `refused` is a recipient fault → NO score penalty; the rider row is READ (for the velocity check)
      // but, with a clean history, never written.
      rider: {
        findUnique: async () => ({ reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async () => { riderUpdated = true; return {}; },
      },
    });
    expect(await svc.markUndelivered("o1", "r1", "refused")).toEqual({ orderId: "o1", status: "undelivered" });
    expect(data).toMatchObject({ status: "undelivered", undeliveredReason: "refused" });
    expect(data!.undeliveredAt).toBeInstanceOf(Date);
    // C6: the failed hand-off is recorded so the customer's terminal shows a real attempt count, not 0.
    expect(data!.deliveryAttempts).toEqual({ increment: 1 });
    expect(emits).toEqual([["o1", "undelivered"]]);
    // No score penalty AND velocity not tripped → the rider row is not mutated.
    expect(riderUpdated).toBe(false);
  });

  it("Q2: a breakdown (post-pickup bail) applies -postPickupCancel to reliability", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0, // no prior undelivered → velocity guard idle
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "breakdown");
    // -postPickupCancel(15): 90 → 75.
    expect(riderData).toMatchObject({ reliabilityScore: 75, onHold: false });
  });

  it("Q2: an unreachable recipient (no-show) applies -noShow to reliability", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0,
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 70, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "unreachable");
    // -noShow(15): 70 → 55 < ON_HOLD_BELOW(60) → trips on_hold.
    expect(riderData).toMatchObject({ reliabilityScore: 55, onHold: true });
  });

  it("FRAUD P0-3: auto-holds a rider whose recent undelivered rate is abnormally high — even for a penalty-free `refused`", async () => {
    let riderData: Record<string, unknown> | undefined;
    // count() is called for undelivered then completed: 3 undelivered vs 1 completed = 75% ≥ rate(0.5)
    // and ≥ minCount(3) → the velocity guard trips.
    const counts = [3, 1];
    let call = 0;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => counts[call++]!,
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 95, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "refused");
    // The reason carries no score penalty (score stays 95), but the velocity guard forces on_hold.
    // RH-01: the hold is stamped heldReason="velocity" so a later score recovery can't self-clear it.
    expect(riderData).toMatchObject({ reliabilityScore: 95, onHold: true, heldReason: "velocity" });
  });

  it("RH-01: a velocity trip persists heldReason=velocity even though the score is untouched", async () => {
    let riderData: Record<string, unknown> | undefined;
    const counts = [3, 0]; // 3 undelivered / 0 completed = 100% ≥ rate, ≥ minCount → velocity hold
    let call = 0;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => counts[call++]!,
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 100, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "wrong_address");
    expect(riderData).toMatchObject({ reliabilityScore: 100, onHold: true, heldReason: "velocity" });
  });

  // BR-01: an automated hold must ALSO pull the rider offline (isOnline:false) and evict them from the
  // geo index — like the admin suspend/ban paths — so a held rider actually leaves the live-supply plane
  // instead of relying solely on the nearbyRiders query filter.
  it("BR-01: a newly auto-held rider is forced offline and evicted from the geo index", async () => {
    let riderData: Record<string, unknown> | undefined;
    const counts = [3, 0]; // velocity trip
    let call = 0;
    const { svc, evicted, kickedFromBoard } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => counts[call++]!,
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 100, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "wrong_address");
    // Forced offline in the same write as the hold...
    expect(riderData).toMatchObject({ onHold: true, isOnline: false });
    // ...and evicted from the live geo index (best-effort, post-commit).
    await new Promise((r) => setTimeout(r, 0));
    expect(evicted).toEqual(["r1"]);
    // KB-BOARD-REVOKE: the now-ineligible rider is also kicked off the board rooms so board pushes stop.
    expect(kickedFromBoard).toEqual(["r1"]);
  });

  it("BR-01: a penalty-only ding that does NOT newly hold leaves isOnline untouched and evicts nobody", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, evicted, kickedFromBoard } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0, // no velocity trip
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        // A score penalty applies but the rider does not cross into on_hold.
        findUnique: async () => ({ reliabilityScore: 90, onHold: false, heldReason: null }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "breakdown");
    expect(riderData).not.toHaveProperty("isOnline");
    await new Promise((r) => setTimeout(r, 0));
    expect(evicted).toEqual([]);
    // KB-BOARD-REVOKE: no new hold ⇒ still board-eligible ⇒ no board kick.
    expect(kickedFromBoard).toEqual([]);
  });
});

describe("OrderLifecycleService RH-01 — a velocity/fraud hold survives a recovery event", () => {
  // The RH-01 regression: a rider velocity-held by markUndelivered (#198) with a high score must NOT be
  // silently un-held by the next completion/rating recovery. Both recovery edges run applyReliabilityDelta,
  // which now preserves heldReason="velocity" — the persisted data keeps onHold=true.
  it("completeOrder (auto-close) recovery does NOT clear a velocity hold", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        // Velocity-held with a high score (the RH-01 shape) — a +RECOVER at score 100 would have cleared
        // it under the old score-only hysteresis.
        findUnique: async () => ({ reliabilityScore: 100, onHold: true, heldReason: "velocity" }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.completeOrder("o1");
    expect(riderData).toMatchObject({ onHold: true, heldReason: "velocity" });
  });

  it("rate() recovery does NOT clear a velocity hold (a good rating no longer un-holds a flagged rider)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      // P1-6: rate() counts prior ratings from this customer→rider pair before touching the aggregate.
      // 0 = a distinct (new) pair → the aggregate updates as before.
      rating: { create: async () => ({}), count: async () => 0 },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 3, tripsCount: 8, reliabilityScore: 100, onHold: true, heldReason: "velocity" }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 5); // a clean 5-star rating → +RECOVER, would clear a score hold
    expect(riderData).toMatchObject({ onHold: true, heldReason: "velocity" });
  });
});
