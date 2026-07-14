import { describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "lifecycle-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
/** Push is fire-and-forget; a no-op stub keeps the lifecycle unit tests off the notification path. */
const noopNotifications = { notifyOrderStatus: async () => {}, notifyProfiles: async () => {} } as unknown as NotificationsService;

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>) {
  const emits: Array<[string, string]> = [];
  const jobCancelled: Array<[string, boolean]> = [];
  const rebroadcasts: Array<[string, string]> = [];
  const bidExpired: Array<[string, number | undefined, number | undefined]> = [];
  const evicted: string[] = [];
  const kickedFromBoard: string[] = [];
  const gateway = {
    emitOrderStatus: (id: string, s: string) => emits.push([id, s]),
    emitJobCancelled: (id: string, collected: boolean) => jobCancelled.push([id, collected]),
    emitOrderRebroadcast: (oldId: string, newId: string) => rebroadcasts.push([oldId, newId]),
    // DS13-07: board-close on a cancel of a still-open auction reuses the expiry path's bid:expired.
    emitBidExpired: (id: string, lat?: number, lng?: number) => bidExpired.push([id, lat, lng]),
    // BR-01: markUndelivered evicts an auto-held rider from the geo index (best-effort passthrough).
    evictRiderFromGeo: async (id: string) => { evicted.push(id); },
    // KB-BOARD-REVOKE: markUndelivered also kicks a newly auto-held rider off the board rooms.
    kickRiderFromBoard: async (id: string) => { kickedFromBoard.push(id); },
  };
  // F-01 re-broadcast announce is best-effort push — spy so tests can assert it fired without a socket.
  const orders = { announceOpenOrder: vi.fn(async () => {}) };
  const prisma = { ...methods } as Record<string, unknown>;
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
  );
  return { svc, emits, jobCancelled, rebroadcasts, bidExpired, evicted, kickedFromBoard, orders, prisma };
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

  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "en_route_pickup", riderId: "r1" }) },
    });
    await expect(svc.attachPickupPhoto("o1", "other", key)).rejects.toThrow(/assigned rider/i);
  });

  it("409s outside the attach window (before the pickup leg, and after heading to drop-off)", async () => {
    for (const status of ["assigned", "confirmed", "en_route_dropoff", "delivered", "cancelled"]) {
      const { svc } = build({ order: { findUnique: async () => ({ status, riderId: "r1" }) } });
      await expect(svc.attachPickupPhoto("o1", "r1", key)).rejects.toThrow(/while collecting/i);
    }
  });

  it("400s a key outside the rider's own pickup namespace (can't persist someone else's object)", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "en_route_pickup", riderId: "r1" }) },
    });
    await expect(svc.attachPickupPhoto("o1", "r1", "pickup/victim/photo.jpg")).rejects.toThrow(/invalid photo key/i);
    await expect(svc.attachPickupPhoto("o1", "r1", "kyc/r1/photo.jpg")).rejects.toThrow(/invalid photo key/i);
  });

  it("persists the key at en_route_pickup via a CAS bounded to the attach window", async () => {
    let args: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "en_route_pickup", riderId: "r1" }),
        updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          args = a;
          return { count: 1 };
        },
      },
    });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: key });
    expect(args!.data).toEqual({ pickupPhotoKey: key });
    // The CAS covers BOTH window statuses, so an upload that lands just after the collect still attaches.
    expect(args!.where).toEqual({ id: "o1", status: { in: ["en_route_pickup", "picked_up"] } });
  });

  it("still attaches at picked_up — a slow upload must not lose to the one-tap collect", async () => {
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "picked_up", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
    });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: key });
  });

  it("re-attaching replaces the key (idempotent retake) — same write, no duplicate state", async () => {
    const retake = "pickup/r1/22222222-2222-4222-8222-222222222222.jpg";
    const writes: Record<string, unknown>[] = [];
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "en_route_pickup", riderId: "r1" }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          writes.push(a.data);
          return { count: 1 };
        },
      },
    });
    await svc.attachPickupPhoto("o1", "r1", key);
    await expect(svc.attachPickupPhoto("o1", "r1", retake)).resolves.toEqual({ orderId: "o1", pickupPhotoKey: retake });
    expect(writes).toEqual([{ pickupPhotoKey: key }, { pickupPhotoKey: retake }]);
  });

  it("409s if the order left the window between the read and the CAS write", async () => {
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "picked_up", riderId: "r1" }),
        // A concurrent advance flipped the row to en_route_dropoff — the CAS `where` no longer matches.
        updateMany: async () => ({ count: 0 }),
      },
    });
    await expect(svc.attachPickupPhoto("o1", "r1", key)).rejects.toThrow(/changed, retry/i);
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
      rating: { create: async () => ({}) },
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
      rating: { create: async () => ({}) },
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
  it("issues a fresh 6-digit code, resets attempts, and stamps the rotation time (DB now())", async () => {
    let sql = "";
    let values: unknown[] = [];
    const { svc } = build({
      order: { findUnique: async () => ({ customerId: "c1", status: "en_route_dropoff" }) },
      // KB-DELIVERY-CODE-ROTATION-SIGNAL: rotate is a raw write now so delivery_code_rotated_at is DB
      // now() (one clock domain), rotating the hash + zeroing attempts + stamping the signal atomically.
      $executeRaw: async (strings: TemplateStringsArray, ...vals: unknown[]) => {
        sql = strings.join("?");
        values = vals;
        return 1;
      },
    });
    const res = await svc.rotateDeliveryCode("o1", "c1");
    expect(res.deliveryCode).toMatch(/^\d{6}$/);
    expect(sql).toContain("delivery_otp_attempts = 0");
    // The new robust rotation signal is stamped with the DB clock on every re-issue.
    expect(sql).toContain("delivery_code_rotated_at = now()");
    // The HASHED (never plaintext) code is parameterised into the write.
    expect(values).toContain(tokens.hash(res.deliveryCode));
  });

  it("403s for a non-owner", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ customerId: "c1", status: "assigned" }) } });
    await expect(svc.rotateDeliveryCode("o1", "other")).rejects.toThrow(/not your order/i);
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
    // C3: a rider was already assigned pre-pickup → job:cancelled with collected:false (back to board).
    expect(jobCancelled).toEqual([["o1", false]]);
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
    expect(jobCancelled).toEqual([["o1", true]]);
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
    const { svc } = build(
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
      rating: { create: async () => ({}) },
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
