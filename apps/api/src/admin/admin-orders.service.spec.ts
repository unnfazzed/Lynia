import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import type { WalletService } from "../wallet/wallet.service";
import { AdminOrdersService } from "./admin-orders.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("AdminOrdersService.listOrders", () => {
  it("filters by status and serializes fares", async () => {
    let where: unknown;
    const prisma = {
      order: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              id: "o1",
              status: "cancelled",
              proposedFare: { toString: () => "2.50" },
              agreedFare: null,
              distanceKm: 1.5,
              customerId: "c1",
              riderId: "r1",
              cancelledBy: "r1",
              cancelReason: "cannot make it",
              createdAt: new Date("2026-06-26T00:00:00Z"),
            },
          ];
        },
      },
    };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const rows = await svc.listOrders("cancelled");
    expect(where).toEqual({ status: "cancelled" });
    expect(rows[0]).toMatchObject({ id: "o1", status: "cancelled", proposedFare: "2.50", agreedFare: null, cancelledByRole: "rider", cancelReason: "cannot make it" });
  });
});

describe("AdminOrdersService.getOrderDetail (D-2)", () => {
  const baseOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    status: "en_route_dropoff",
    proposedFare: dec("5.00"),
    agreedFare: dec("6.00"),
    distanceKm: 3.2,
    pickup: { landmark: "Avondale shops" },
    dropoff: { landmark: "Borrowdale" },
    itemDesc: "Documents",
    items: [{ description: "Envelope", quantity: 2 }],
    cancelledBy: null,
    cancelReason: null,
    customerId: "c1",
    riderId: "r1",
    createdAt: new Date("2026-06-26T10:00:00Z"),
    updatedAt: new Date("2026-06-26T10:30:00Z"),
    customer: { firstName: "Rudo", lastName: "K", phone: "+263771112222" },
    rider: { bikeReg: "ABZ 1", profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" } },
    events: [
      { status: "open_for_offers", createdAt: new Date("2026-06-26T10:00:00Z") },
      { status: "assigned", createdAt: new Date("2026-06-26T10:05:00Z") },
      { status: "en_route_dropoff", createdAt: new Date("2026-06-26T10:20:00Z") },
    ],
    ...over,
  });

  // Prisma stub for the detail read: the order row plus the three narrow side-lookups (open issue,
  // fare-adjust audit rows, selected offer). Audits/offer default to "no signal" so the pre-existing
  // tests keep exercising just the timeline/PII behaviour.
  const detailPrisma = (
    order: unknown,
    over: { audits?: Array<{ actor: string; createdAt: Date }>; offer?: { type: string; offeredFare: unknown } | null } = {},
  ) => ({
    order: { findUnique: async () => order },
    issue: { findFirst: async () => null },
    auditLog: { findMany: async () => over.audits ?? [] },
    offer: { findFirst: async () => over.offer ?? null },
  });

  it("returns null when the order is not found", async () => {
    const prisma = { order: { findUnique: async () => null } };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    expect(await svc.getOrderDetail("missing")).toBeNull();
  });

  it("builds the timeline, items, fares and REVEALS phones inside the reveal window", async () => {
    // Recent last event so the stuck heuristic (no update > 20m) does not fire → current step is "now".
    const events = [
      { status: "open_for_offers", createdAt: new Date(Date.now() - 20 * 60000) },
      { status: "assigned", createdAt: new Date(Date.now() - 15 * 60000) },
      { status: "en_route_dropoff", createdAt: new Date(Date.now() - 2 * 60000) },
    ];
    const prisma = detailPrisma(baseOrder({ events }));
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.route).toBe("Avondale shops → Borrowdale");
    expect(d.proposed).toBe("5.00");
    expect(d.agreed).toBe("6.00");
    expect(d.km).toBe(3.2);
    expect(d.items).toEqual([{ desc: "Envelope", qty: 2 }]);
    // en_route_dropoff is step 5 → steps 0..4 done, step 5 now, later steps pending.
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline![5]!.state).toBe("now");
    expect(d.timeline![7]!.state).toBeUndefined();
    // en_route_dropoff is a reveal status → full numbers for ops to call.
    expect(d.customerPhone).toBe("+263771112222");
    expect(d.riderPhone).toBe("+263782000001");
  });

  it("MASKS both phones once the order is terminal (outside the reveal window, A-03)", async () => {
    const prisma = detailPrisma(baseOrder({ status: "cancelled" }));
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const d = (await svc.getOrderDetail("o1"))!;
    expect(d.customerPhone).toBe("+263•••••2222");
    expect(d.riderPhone).toBe("+263•••••0001");
    // Off-path terminal → only the broadcast step is marked done, no "now".
    expect(d.timeline![0]!.state).toBe("done");
    expect(d.timeline!.some((s) => s.state === "now")).toBe(false);
  });

  it("MASKS both phones on a completed/delivered order (A-03: not a live ride, so no PII)", async () => {
    // Regression: the reveal set here is ACTIVE_RIDE_STATUSES, NOT PHONE_REVEAL_STATUSES — the latter
    // includes delivered/completed/undelivered and would leave every finished order unmasked forever.
    for (const status of ["delivered", "completed", "undelivered"]) {
      const prisma = detailPrisma(baseOrder({ status }));
      const svc = new AdminOrdersService(prisma as unknown as PrismaService);
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.customerPhone).toBe("+263•••••2222");
      expect(d.riderPhone).toBe("+263•••••0001");
    }
  });

  describe("fareProvenance (derived — no agreedFareSource column)", () => {
    const svcWith = (order: unknown, over: Parameters<typeof detailPrisma>[1] = {}) =>
      new AdminOrdersService(detailPrisma(order, over) as unknown as PrismaService);

    it("admin_adjusted when a fare_adjust audit row exists — audit wins over the market signal", async () => {
      const svc = svcWith(baseOrder({ agreedFare: dec("9.00") }), {
        audits: [{ actor: "ops-tari", createdAt: new Date("2026-07-01T12:00:00Z") }],
        offer: { type: "counter", offeredFare: dec("6.00") },
      });
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toEqual({
        kind: "admin_adjusted",
        operator: "ops-tari",
        at: "2026-07-01T12:00:00.000Z",
        // Pre-adjustment market fare recovered from the selected offer.
        previousFare: "6.00",
      });
    });

    it("admin_adjusted: latest adjustment wins and count is included when >1", async () => {
      const svc = svcWith(baseOrder({ agreedFare: dec("9.00") }), {
        // findMany is ordered createdAt desc — the stub returns rows in that order.
        audits: [
          { actor: "ops-blessing", createdAt: new Date("2026-07-02T08:00:00Z") },
          { actor: "ops-tari", createdAt: new Date("2026-07-01T12:00:00Z") },
        ],
        // No offer row survives → previousFare unrecoverable, not fabricated.
        offer: null,
      });
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toEqual({
        kind: "admin_adjusted",
        operator: "ops-blessing",
        at: "2026-07-02T08:00:00.000Z",
        previousFare: null,
        count: 2,
      });
    });

    it("rider_counter when the selected offer was a counter (no adjustment)", async () => {
      const svc = svcWith(baseOrder(), { offer: { type: "counter", offeredFare: dec("6.00") } });
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toEqual({ kind: "rider_counter", offeredFare: "6.00", ask: "5.00" });
    });

    it("customer_ask when the selected offer was an accept", async () => {
      const svc = svcWith(baseOrder({ agreedFare: dec("5.00") }), { offer: { type: "accept", offeredFare: dec("5.00") } });
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toEqual({ kind: "customer_ask" });
    });

    it("customer_ask fallback when no offer row survives but agreed equals the ask", async () => {
      const svc = svcWith(baseOrder({ agreedFare: dec("5.00") }));
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toEqual({ kind: "customer_ask" });
    });

    it("null (unknown) for a legacy order — no audit, no offer, fare differs from the ask", async () => {
      const svc = svcWith(baseOrder({ agreedFare: dec("6.00") }));
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toBeNull();
    });

    it("null when no fare was ever agreed — there is nothing to explain", async () => {
      const svc = svcWith(baseOrder({ status: "open_for_offers", agreedFare: null, riderId: null, rider: null }));
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.fareProvenance).toBeNull();
    });
  });

  describe("KB-POD-DISPUTE Phase A — proof-of-drop evidence", () => {
    it("surfaces the read URL + GPS + timestamp for adjudication when proof was attached", async () => {
      const order = baseOrder({
        status: "undelivered",
        deliveryProofKey: "delivery-proof/r1/abc.jpg",
        deliveryProofLat: -17.83,
        deliveryProofLng: 31.05,
        deliveryProofAt: new Date("2026-06-26T10:25:00Z"),
      });
      const storage = { createReadUrl: async (k: string) => `https://signed/${k}` } as unknown as StorageAdapter;
      const svc = new AdminOrdersService(detailPrisma(order) as unknown as PrismaService, undefined, undefined, undefined, storage);
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.deliveryProof).toEqual({
        photoUrl: "https://signed/delivery-proof/r1/abc.jpg",
        lat: -17.83,
        lng: 31.05,
        at: "2026-06-26T10:25:00.000Z",
      });
    });

    it("renders GPS/time with a null photoUrl when the read URL can't be signed (best-effort)", async () => {
      const order = baseOrder({
        status: "undelivered",
        deliveryProofKey: "delivery-proof/r1/abc.jpg",
        deliveryProofLat: -17.83,
        deliveryProofLng: 31.05,
        deliveryProofAt: new Date("2026-06-26T10:25:00Z"),
      });
      const storage = { createReadUrl: async () => { throw new Error("signing down"); } } as unknown as StorageAdapter;
      const svc = new AdminOrdersService(detailPrisma(order) as unknown as PrismaService, undefined, undefined, undefined, storage);
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.deliveryProof).toEqual({ photoUrl: null, lat: -17.83, lng: 31.05, at: "2026-06-26T10:25:00.000Z" });
    });

    it("deliveryProof is null when no proof was attached", async () => {
      const svc = new AdminOrdersService(detailPrisma(baseOrder()) as unknown as PrismaService);
      const d = (await svc.getOrderDetail("o1"))!;
      expect(d.deliveryProof).toBeNull();
    });
  });
});

describe("AdminOrdersService mutations (Item 1 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    orderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    orderEvent: { data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  // A tx whose writes are recorded; $transaction runs the service callback against THIS object, so a
  // recorded orderUpdate AND a recorded audit prove both landed inside the same transaction.
  function makeTx(over: { order?: unknown; updateCount?: number } = {}) {
    const calls: Calls = { orderUpdate: null, orderEvent: null, audit: null };
    // DS-03: cancel/adjust now CAS via updateMany and reject on a 0-row result (the status/fare moved
    // under the read). Default to 1 row (success); a test can force 0 to exercise the conflict path.
    const count = over.updateCount ?? 1;
    const tx = {
      order: {
        findUnique: async () => ("order" in over ? over.order : { id: "o1", status: "assigned", agreedFare: dec("6.00") }),
        updateMany: async (args: Calls["orderUpdate"]) => { calls.orderUpdate = args; return { count }; },
      },
      offer: { updateMany: async () => ({ count: 0 }) },
      orderEvent: { create: async (args: Calls["orderEvent"]) => { calls.orderEvent = args; return {}; } },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-9" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("cancelOrder sets cancelled + cancelledBy=null, appends an OrderEvent, and audits in one tx", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const res = await svc.cancelOrder("admin-1", "o1", { reason: "duplicate order" });
    expect(calls.orderUpdate!.data).toMatchObject({ status: "cancelled", cancelledBy: null, cancelReason: "duplicate order" });
    expect(calls.orderEvent!.data).toEqual({ orderId: "o1", status: "cancelled" });
    expect(calls.audit!.data).toMatchObject({ action: "order.cancel", target: "o1", reasonCode: "duplicate order" });
    expect(res).toMatchObject({ id: "o1", status: "cancelled", auditId: "audit-9" });
  });

  // Regression: `Order.cancelledBy` is `@db.Uuid` (FK → Profile.id), but behind IAP the admin `actor` is
  // the operator's email (e.g. `accounts.google.com:ops@lynia.com`). Writing it into the uuid column throws
  // `22P02`/an FK violation in Postgres and aborts the entire cancel — a prod-breaking bug the pre-fix tests
  // missed because they only ever passed a bare `"admin-1"` string. The cancel must NEVER write the operator
  // identity into `cancelledBy` (null instead), and must still record that operator on the audit row.
  it("cancelOrder never writes a non-uuid operator identity into cancelledBy — even an IAP X-Operator email", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const operator = "accounts.google.com:ops@lynia.com";
    await svc.cancelOrder(operator, "o1", { reason: "fraud" });
    expect(calls.orderUpdate!.data).toMatchObject({ cancelledBy: null });
    expect(calls.orderUpdate!.data.cancelledBy).not.toBe(operator);
    // The operator identity is preserved where it belongs — the audit row, a plain String column.
    expect(calls.audit!.data).toMatchObject({ actor: operator, action: "order.cancel" });
  });

  it("cancelOrder pushes job:cancelled to an assigned rider post-commit (P2-3), with the collected flag", async () => {
    const { prisma } = makeTx({ order: { id: "o1", status: "picked_up", riderId: "r1", collectedAt: new Date() } });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn(), emitBidExpired: vi.fn() };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
    await svc.cancelOrder("admin-1", "o1", { reason: "duplicate order" });
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith("o1", "cancelled");
    // Post-pickup (collectedAt set) → collected=true drives the rider's hand-back path; cancelledBy
    // "admin" so the rider's terminal doesn't blame the customer for an ops-initiated cancel.
    expect(gateway.emitJobCancelled).toHaveBeenCalledWith("o1", true, "admin");
    // DS13-07: an assigned/collected order was never an open auction → no board-close signal.
    expect(gateway.emitBidExpired).not.toHaveBeenCalled();
  });

  it("cancelOrder does NOT push job:cancelled when no rider is assigned", async () => {
    const { prisma } = makeTx({ order: { id: "o1", status: "open_for_offers", riderId: null, collectedAt: null } });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn(), emitBidExpired: vi.fn() };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
    await svc.cancelOrder("admin-1", "o1", { reason: "spam" });
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith("o1", "cancelled");
    expect(gateway.emitJobCancelled).not.toHaveBeenCalled();
  });

  it("cancelOrder closes the board card when the cancelled order was still open_for_offers (DS13-07)", async () => {
    // A still-open auction has a live card on browsing riders' boards; reuse the expiry path's bid:expired
    // to close it immediately (with the pickup geo coords) rather than leave a dead card until a 409.
    const { prisma } = makeTx({
      order: { id: "o1", status: "open_for_offers", riderId: null, collectedAt: null, pickup: { point: { lat: -17.83, lng: 31.05 } } },
    });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn(), emitBidExpired: vi.fn() };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, gateway as unknown as TrackingGateway);
    await svc.cancelOrder("admin-1", "o1", { reason: "spam" });
    expect(gateway.emitBidExpired).toHaveBeenCalledWith("o1", -17.83, 31.05);
  });

  it("cancelOrder pushes an FCM 'cancelled' notification to the parties post-commit (DS13-03)", async () => {
    // Parity with the party-initiated cancel: a backgrounded/socket-dropped rider or customer hears about
    // an ops cancel via FCM (the WS emits reach nobody in that state). Ops is the canceller → no exclude.
    const { prisma } = makeTx({ order: { id: "o1", status: "assigned", riderId: "r1", collectedAt: null } });
    const gateway = { emitOrderStatus: vi.fn(), emitJobCancelled: vi.fn(), emitBidExpired: vi.fn() };
    const notifications = { notifyOrderStatus: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(
      prisma as unknown as PrismaService,
      gateway as unknown as TrackingGateway,
      notifications as unknown as import("../notifications/notifications.service").NotificationsService,
    );
    await svc.cancelOrder("admin-1", "o1", { reason: "fraud" });
    expect(notifications.notifyOrderStatus).toHaveBeenCalledWith("o1", "cancelled", {});
  });

  it("cancelOrder rejects an order already in a terminal state (nothing written)", async () => {
    const { prisma, calls } = makeTx({ order: { id: "o1", status: "completed" } });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.cancelOrder("admin-1", "o1", { reason: "x" })).rejects.toThrow("terminal");
    expect(calls.orderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("adjustFare overwrites agreedFare and audits atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    const res = await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "GPS overcharge" });
    expect(calls.orderUpdate!.data).toEqual({ agreedFare: 7.5 });
    expect(calls.audit!.data).toMatchObject({ action: "order.fare_adjust", target: "o1", reasonCode: "GPS overcharge" });
    expect(res).toMatchObject({ id: "o1", agreedFare: "7.50", auditId: "audit-9" });
  });

  it("UX18-04: adjustFare pushes both parties a best-effort 'fare was updated' notice", async () => {
    const { prisma } = makeTx({
      order: { id: "o1", status: "assigned", agreedFare: dec("6.00"), riderId: "r1", customerId: "c1" },
    });
    const notified: Array<{ profileIds: string[]; msg: { title: string } }> = [];
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: { title: string }) => {
        notified.push({ profileIds, msg });
      },
    } as unknown as NotificationsService;
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, notifications);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "GPS overcharge" });
    expect(notified).toHaveLength(2);
    expect(notified.find((n) => n.profileIds[0] === "c1")!.msg).toMatchObject({ title: "Your delivery's fare was updated" });
    expect(notified.find((n) => n.profileIds[0] === "r1")!.msg).toMatchObject({ title: "A delivery's fare was updated" });
  });

  it("UX26-03: adjustFare's rider push carries the order's current status (routes to /rider/job when assigned), but the customer push never does", async () => {
    const { prisma } = makeTx({
      order: { id: "o1", status: "assigned", agreedFare: dec("6.00"), riderId: "r1", customerId: "c1" },
    });
    const notified: Array<{ profileIds: string[]; msg: { data?: Record<string, unknown> } }> = [];
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: { data?: Record<string, unknown> }) => {
        notified.push({ profileIds, msg });
      },
    } as unknown as NotificationsService;
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, notifications);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "GPS overcharge" });
    const riderMsg = notified.find((n) => n.profileIds[0] === "r1")!.msg;
    const customerMsg = notified.find((n) => n.profileIds[0] === "c1")!.msg;
    expect(riderMsg.data).toEqual({ orderId: "o1", kind: "order", status: "assigned" });
    // Stamping `status` on the customer's push too would misroute them via pushDestination's ungated
    // RIDER_JOB_SCREEN_STATUSES check (see the comment at the call site) — must stay absent.
    expect(customerMsg.data).toEqual({ orderId: "o1", kind: "order" });
  });

  it("adjustFare rejects an order that never had an agreed fare (nothing written)", async () => {
    const { prisma, calls } = makeTx({ order: { id: "o1", status: "open_for_offers", agreedFare: null } });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "x" })).rejects.toThrow(/no agreed fare/i);
    expect(calls.orderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("cancelOrder CAS-guards the observed status and aborts (no event, no audit) when 0 rows match — DS-03", async () => {
    // A concurrent transition (e.g. confirmDelivery → delivered) moved the row between the read and the
    // write, so the status-guarded updateMany matches 0 rows. The cancel must roll back, not clobber it.
    const { prisma, calls } = makeTx({ updateCount: 0 });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.cancelOrder("admin-1", "o1", { reason: "x" })).rejects.toThrow(/changed while cancelling/i);
    expect(calls.orderEvent).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("adjustFare CAS-guards the observed fare and aborts (no audit) when 0 rows match — DS-03", async () => {
    const { prisma, calls } = makeTx({ updateCount: 0 });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService);
    await expect(svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "x" })).rejects.toThrow(/changed while adjusting/i);
    expect(calls.audit).toBeNull();
  });

  it("AH20-01: adjusting to the fare the order already has is an idempotent no-op (no CAS, no duplicate audit row)", async () => {
    // The default order's agreedFare is $6.00. Re-submitting $6.00 (a double-click / lost-response retry)
    // must NOT append a second zero-delta fare_adjust audit row or re-run the commission reconciliation.
    const { prisma, calls } = makeTx();
    const notified: unknown[] = [];
    const notifications = { notifyProfiles: async (...a: unknown[]) => { notified.push(a); } } as unknown as NotificationsService;
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, notifications);
    const res = await svc.adjustFare("admin-1", "o1", { agreedFare: 6.0, reason: "no change" });
    expect(calls.orderUpdate).toBeNull(); // no CAS write
    expect(calls.audit).toBeNull(); // no duplicate audit row
    expect(notified).toHaveLength(0); // no spurious "fare updated" pushes
    expect(res).toMatchObject({ id: "o1", agreedFare: "6.00", auditId: null });
  });

  it("adjustFare on a completed order that already charged commission reconciles the ledger (WD-001)", async () => {
    // The order completed at $10 and was charged at 10% (a ride_commission row with ratePct=10 exists).
    // Correcting the fare down to $7 must credit back the over-charged commission delta, computed at the
    // ORIGINAL rate — not the (possibly since-changed) current live rate.
    const calls: { orderUpdate: unknown; audit: unknown } = { orderUpdate: null, audit: null };
    const tx = {
      order: {
        findUnique: async () => ({ id: "o1", status: "completed", agreedFare: dec("10.00"), riderId: "r1" }),
        updateMany: async (args: unknown) => {
          calls.orderUpdate = args;
          return { count: 1 };
        },
      },
      commissionLedger: { findFirst: async () => ({ ratePct: dec("10.00") }) },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          calls.audit = args;
          return { id: "audit-9" };
        },
      },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7, reason: "GPS overcharge" });
    expect(wallet.adjustCommissionInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ riderId: "r1", ratePct: 10, fare: -3, amount: 0.3, actor: "admin-1" }),
    );
    expect(calls.audit).not.toBeNull();
  });

  it("WD-013: adjustFare re-reads status POST-CAS, so a completion racing the fare CAS still reconciles the ledger", async () => {
    // The pre-CAS snapshot is stale ("delivered") — a completion committed the ride_commission row and
    // flipped status to "completed" concurrently, in the gap between that snapshot and this fare CAS
    // landing. Using the stale snapshot would skip reconciliation entirely (the original WD-001 gap,
    // reopened by this race); the fresh post-CAS re-read must catch it.
    let findUniqueCalls = 0;
    const tx = {
      order: {
        findUnique: async () => {
          findUniqueCalls += 1;
          return findUniqueCalls === 1
            ? { id: "o1", status: "delivered", agreedFare: dec("10.00"), riderId: "r1" }
            : { status: "completed", riderId: "r1" };
        },
        updateMany: async () => ({ count: 1 }),
      },
      commissionLedger: { findFirst: async () => ({ ratePct: dec("10.00") }) },
      auditLog: { create: async () => ({ id: "audit-9" }) },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7, reason: "race" });
    expect(findUniqueCalls).toBe(2);
    expect(wallet.adjustCommissionInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ riderId: "r1", ratePct: 10, amount: 0.3 }),
    );
  });

  it("WD-013: a fare-adjust that's still pre-completion after the fresh re-read stays skipped (no false-positive reconciliation)", async () => {
    const tx = {
      order: {
        findUnique: async () => ({ id: "o1", status: "assigned", agreedFare: dec("6.00"), riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      auditLog: { create: async () => ({ id: "audit-9" }) },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7, reason: "x" });
    expect(wallet.adjustCommissionInTx).not.toHaveBeenCalled();
  });

  it("WD-014: adjustFare deltas the ROUNDED per-side commission, not a rounded delta of raw fares", async () => {
    // 4% of $1.07 rounds to $0.04 (0.0428); 4% of $1.38 rounds to $0.06 (0.0552) — the correct correction
    // is +$0.02. Rounding the fare delta FIRST (round($0.31) commission = round(0.0124*100)/100 = $0.01)
    // would wrongly under/over-shoot by a cent, drifting the ledger off "rate% of the final fare".
    const tx = {
      order: {
        findUnique: async () => ({ id: "o1", status: "completed", agreedFare: dec("1.07"), riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      commissionLedger: { findFirst: async () => ({ ratePct: dec("4.00") }) },
      auditLog: { create: async () => ({ id: "audit-9" }) },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 1.38, reason: "rounding" });
    // Fare went up → bigger debit → amount is negative (0.06 - 0.04 = 0.02 more owed).
    expect(wallet.adjustCommissionInTx).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: -0.02 }));
  });

  it("adjustFare does NOT touch the wallet for an order that never completed (no commission ever charged)", async () => {
    // Default makeTx() order status is "assigned" — no ride_commission row could exist yet.
    const { prisma } = makeTx();
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7.5, reason: "x" });
    expect(wallet.adjustCommissionInTx).not.toHaveBeenCalled();
  });

  it("adjustFare on a completed order with NO ride_commission row (0% at charge time) skips the wallet — nothing was ever charged to correct", async () => {
    const tx = {
      order: {
        findUnique: async () => ({ id: "o1", status: "completed", agreedFare: dec("10.00"), riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      commissionLedger: { findFirst: async () => null },
      auditLog: { create: async () => ({ id: "audit-9" }) },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    const wallet = { adjustCommissionInTx: vi.fn(async () => {}) };
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjustFare("admin-1", "o1", { agreedFare: 7, reason: "x" });
    expect(wallet.adjustCommissionInTx).not.toHaveBeenCalled();
  });
});

describe("AdminOrdersService.adjudicateDelivered (KB-POD-DISPUTE Phase B)", () => {
  const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });
  interface Calls {
    orderUpdate: { where: Record<string, unknown>; data: Record<string, unknown> } | null;
    orderEvent: { data: Record<string, unknown> } | null;
    riderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  function makeTx(over: { order?: unknown; updateCount?: number; freshOrder?: unknown } = {}) {
    const calls: Calls = { orderUpdate: null, orderEvent: null, riderUpdate: null, audit: null };
    const count = over.updateCount ?? 1;
    const baseOrder =
      "order" in over ? over.order : { status: "undelivered", riderId: "r1", customerId: "c1", agreedFare: dec("6.00"), suggestedFare: dec("6.00") };
    let orderFindUniqueCalls = 0;
    const tx = {
      order: {
        // WD-021: the SECOND findUnique call is the post-CAS re-read — return `freshOrder` for it (when
        // supplied) so a test can simulate a concurrent fare-adjust landing between the first read and the
        // status CAS, distinct from the first (pre-CAS) snapshot.
        findUnique: async () => {
          orderFindUniqueCalls++;
          return orderFindUniqueCalls === 1 || !("freshOrder" in over) ? baseOrder : over.freshOrder;
        },
        updateMany: async (a: Calls["orderUpdate"]) => { calls.orderUpdate = a; return { count }; },
      },
      orderEvent: { create: async (a: Calls["orderEvent"]) => { calls.orderEvent = a; return {}; } },
      $executeRaw: async () => 1,
      rider: {
        findUnique: async () => ({ reliabilityScore: 80, onHold: false, heldReason: null }),
        update: async (a: Calls["riderUpdate"]) => { calls.riderUpdate = a; return {}; },
      },
      auditLog: { create: async (a: Calls["audit"]) => { calls.audit = a; return { id: "audit-9" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }
  const wallet = { chargeCommission: vi.fn(async () => {}) };

  it("force-completes an undelivered order, credits the rider (trip + reliability recovery), charges commission, audits in one tx", async () => {
    wallet.chargeCommission.mockClear();
    const { prisma, calls } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    const res = await svc.adjudicateDelivered("admin-1", "o1", { reason: "recipient took the parcel, withheld the code; proof photo + GPS on file" });
    // Force-complete via a CAS bounded to the undelivered status.
    expect(calls.orderUpdate!.where).toMatchObject({ id: "o1", status: "undelivered" });
    expect(calls.orderUpdate!.data).toMatchObject({ status: "completed" });
    expect(calls.orderEvent!.data).toEqual({ orderId: "o1", status: "completed" });
    // Rider credited a clean completion: +1 trip and a recovered reliability score (80 → 82).
    expect(calls.riderUpdate!.data).toMatchObject({ tripsCount: { increment: 1 } });
    expect(calls.riderUpdate!.data.reliabilityScore).toBe(82);
    // Commissionable (per the Phase-B decision) — no-op at rate 0, but the debit fires.
    expect(wallet.chargeCommission).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: "o1", riderId: "r1" }));
    // Audit row in the same tx, with the reserved action.
    expect(calls.audit!.data).toMatchObject({ action: "order.adjudicate_delivered", target: "o1" });
    expect(res).toMatchObject({ id: "o1", status: "completed", auditId: "audit-9" });
  });

  it("WD-021: charges commission off the fare re-read AFTER the status CAS, not the pre-CAS snapshot — a concurrent fare-adjust landing in the gap must not be priced off the stale fare", async () => {
    wallet.chargeCommission.mockClear();
    const { prisma } = makeTx({
      order: { status: "undelivered", riderId: "r1", customerId: "c1", agreedFare: dec("6.00"), suggestedFare: dec("6.00") },
      // Simulates a concurrent adjustFare(order, $20) committing between the initial read and this
      // function's own status CAS — the order's real, current fare by the time we charge is $20, not $6.
      freshOrder: { agreedFare: dec("20.00"), suggestedFare: dec("20.00") },
    });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await svc.adjudicateDelivered("admin-1", "o1", { reason: "x" });
    const args = (wallet.chargeCommission.mock.calls[0] as unknown as unknown[])[1] as {
      agreedFare: { toString(): string };
      suggestedFare: { toString(): string };
    };
    expect(args.agreedFare.toString()).toBe("20.00");
    expect(args.suggestedFare.toString()).toBe("20.00");
  });

  it("409s on any non-undelivered order — this can only overturn a failed hand-off, not complete an arbitrary order", async () => {
    for (const status of ["assigned", "en_route_dropoff", "delivered", "completed", "cancelled"]) {
      const { prisma } = makeTx({ order: { status, riderId: "r1", customerId: "c1", agreedFare: dec("6"), suggestedFare: dec("6") } });
      const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
      await expect(svc.adjudicateDelivered("admin-1", "o1", { reason: "x" })).rejects.toThrow(/undelivered order can be adjudicated/i);
    }
  });

  it("409s when the undelivered order has no assigned rider to credit", async () => {
    const { prisma } = makeTx({ order: { status: "undelivered", riderId: null, customerId: "c1", agreedFare: dec("6"), suggestedFare: dec("6") } });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await expect(svc.adjudicateDelivered("admin-1", "o1", { reason: "x" })).rejects.toThrow(/no assigned rider/i);
  });

  it("409s on a CAS conflict (order moved between the read and the write)", async () => {
    const { prisma } = makeTx({ updateCount: 0 });
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, undefined, wallet as unknown as WalletService);
    await expect(svc.adjudicateDelivered("admin-1", "o1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
  });

  it("notifies the customer with an honest, undated report path, and the rider, post-commit (UX19-02/04)", async () => {
    const notified: Array<{ ids: string[]; msg: Record<string, unknown> }> = [];
    const notifications = {
      notifyProfiles: async (ids: string[], msg: Record<string, unknown>) => { notified.push({ ids, msg }); },
    } as unknown as NotificationsService;
    const { prisma } = makeTx();
    const svc = new AdminOrdersService(prisma as unknown as PrismaService, undefined, notifications, wallet as unknown as WalletService);
    await svc.adjudicateDelivered("admin-1", "o1", { reason: "x" });
    await new Promise((r) => setTimeout(r, 0));
    const customerMsg = notified.find((n) => n.ids.includes("c1"))?.msg;
    // UX19-02: `IssuesService.raise` enforces no deadline, so the push must not claim one.
    expect(customerMsg?.body).toMatch(/report a problem/i);
    expect(customerMsg?.body).not.toMatch(/48 hours?/i);
    const riderMsg = notified.find((n) => n.ids.includes("r1"))?.msg;
    expect(riderMsg).toBeTruthy();
    // UX19-04: adjudicateDelivered has no precondition on proof-of-drop evidence existing, so the rider
    // push must not thank them for evidence that may never have been submitted.
    expect(riderMsg?.body).not.toMatch(/your proof|adding the evidence/i);
  });
});
