import type { BoardNewOrderEvent } from "@lynia/shared";
import { PRESENCE_ESCALATION_MS, WS_EVENTS } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { TokenService } from "../auth/token.service";
import type { MetricsService } from "../observability/metrics.service";
import type { TrackingService } from "./tracking.service";
import { boardCell, boardCellNeighborhood } from "@lynia/shared";
import { BOARD_ROOM, boardGeoRoom, orderRoom } from "./tracking.constants";
import { POSITION_COALESCE_MS, POSITION_ROOM_TTL_MS, TrackingGateway } from "./tracking.gateway";

/** Minimal socket fake: maintains a live `rooms` Set (like a real Socket) as join/leave run, and
 *  carries the authenticated user in `data`. */
function fakeSocket(user?: { sub: string; role: string }, rooms: string[] = [], id = "sock-1") {
  const roomSet = new Set(rooms);
  return {
    id,
    data: { user },
    rooms: roomSet,
    join: vi.fn(async (room: string) => {
      roomSet.add(room);
    }),
    leave: vi.fn(async (room: string) => {
      roomSet.delete(room);
    }),
  };
}

/** Minimal server fake exposing a chainable `to().to().emit()` so we can assert every targeted room
 *  plus the event + payload. `to` records each room and returns the same chainable handle. */
function fakeServer(remoteSockets: Array<{ data?: unknown }> = []) {
  const emit = vi.fn();
  const chain = { emit, to: vi.fn() as ReturnType<typeof vi.fn> };
  const to = vi.fn(() => chain);
  chain.to = to;
  // `server.in(room).fetchSockets()` — cluster-wide room membership used by the customer-presence
  // false-positive guard. Defaults to empty (no customer present), so existing escalation tests are
  // unaffected; pass sockets to simulate a customer live on another instance.
  const fetchSockets = vi.fn(async () => remoteSockets);
  const inFn = vi.fn(() => ({ fetchSockets }));
  return { server: { to, in: inFn } as unknown, to, emit, fetchSockets, in: inFn };
}

/** Spy metrics fake — position-emit recording is best-effort; keep tests off the OTel path. */
const fakeMetrics = () =>
  ({ startTimer: () => () => 0, recordPositionEmit: vi.fn() }) as unknown as MetricsService;

function gateway(tracking: Partial<TrackingService> = {}) {
  // Default the cluster-wide presence-escalation gate to "always claim" (single-instance semantics) so
  // tests that don't care about multi-instance dedup behave exactly as before; a test can override.
  const withGate: Partial<TrackingService> = {
    claimPresenceEscalation: vi.fn(async () => true),
    releasePresenceEscalation: vi.fn(async () => {}),
    ...tracking,
  };
  const g = new TrackingGateway(
    {} as Env,
    {} as TokenService,
    withGate as unknown as TrackingService,
    fakeMetrics(),
  );
  return g;
}

describe("TrackingGateway.boardSubscribe", () => {
  it("loc-less: joins the city-wide board room for a verified + online rider", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardSubscribe(client as never, {});
    expect(res).toEqual({ joined: "board" });
    expect(client.join).toHaveBeenCalledWith(BOARD_ROOM);
  });

  it("with lat/lng: joins the 9 geo-cell rooms (3×3 neighbourhood), not the city-wide room", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardSubscribe(client as never, { lat: -17.83, lng: 31.05 });

    const expectedRooms = boardCellNeighborhood(-17.83, 31.05).map(boardGeoRoom);
    expect(expectedRooms).toHaveLength(9);
    expect(res).toEqual({ joined: 9 });
    for (const room of expectedRooms) expect(client.join).toHaveBeenCalledWith(room);
    expect(client.join).not.toHaveBeenCalledWith(BOARD_ROOM);
  });

  it("re-subscribe on move leaves the prior board rooms before joining the fresh set", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const stale = boardGeoRoom("99:99");
    // Socket already sits in a stale geo room + the city-wide room from a prior subscribe.
    const client = fakeSocket({ sub: "rider-1", role: "rider" }, [stale, BOARD_ROOM, orderRoom("keep")]);
    await g.boardSubscribe(client as never, { lat: -17.83, lng: 31.05 });

    // The stale board rooms are dropped; an unrelated order room is untouched.
    expect(client.leave).toHaveBeenCalledWith(stale);
    expect(client.leave).toHaveBeenCalledWith(BOARD_ROOM);
    expect(client.leave).not.toHaveBeenCalledWith(orderRoom("keep"));
  });

  it("returns forbidden for an ineligible (unverified/offline/non-rider) caller", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => false) });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardSubscribe(client as never, {});
    expect(res).toEqual({ error: "forbidden" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when the socket carries no user", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const client = fakeSocket(undefined);
    const res = await g.boardSubscribe(client as never, {});
    expect(res).toEqual({ error: "unauthenticated" });
    expect(client.join).not.toHaveBeenCalled();
  });
});

describe("TrackingGateway.boardLeave", () => {
  it("leaves the board room AND every geo-cell room, but not the order room", async () => {
    const g = gateway();
    const client = fakeSocket({ sub: "rider-1", role: "rider" }, [
      BOARD_ROOM,
      "board:geo:1:2",
      "board:geo:1:3",
      orderRoom("ord-1"),
    ]);
    const res = await g.boardLeave(client as never);
    expect(res).toEqual({ left: "board" });
    expect(client.leave).toHaveBeenCalledWith(BOARD_ROOM);
    expect(client.leave).toHaveBeenCalledWith("board:geo:1:2");
    expect(client.leave).toHaveBeenCalledWith("board:geo:1:3");
    // The order room is a different concern (customer tracking) — boardLeave must not touch it.
    expect(client.leave).not.toHaveBeenCalledWith(orderRoom("ord-1"));
  });
});

describe("TrackingGateway.emitOffersChanged", () => {
  it("signals offers:changed to the order's room (no offer contents)", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitOffersChanged("ord-1");
    expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.offersChanged, expect.objectContaining({ orderId: "ord-1" }));
    // Signal only: the payload must never carry offer contents.
    expect(JSON.stringify(emit.mock.calls[0]![1])).not.toContain("offeredFare");
  });

  it("never throws when the server is undefined (best-effort)", () => {
    const g = gateway();
    expect(() => g.emitOffersChanged("ord-1")).not.toThrow();
  });
});

describe("TrackingGateway.riderLocation", () => {
  it("emits the position before (and independent of) the DB persist", async () => {
    const { server, to, emit } = fakeServer();
    const recordFix = vi.fn(async () => {
      throw new Error("db down");
    });
    const g = gateway({ isAssignedRider: vi.fn(async () => true), recordFix });
    g.server = server as never;
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    // Persist fails, so the call rejects — but the customer's live position already went out.
    await expect(
      g.riderLocation(client as never, { orderId: "ord-1", lat: -17.8, lng: 31.0 }),
    ).rejects.toThrow("db down");
    expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.position, expect.objectContaining({ lat: -17.8, lng: 31.0 }));
  });

  it("rejects a non-assigned rider before any emit (auth precedes the push)", async () => {
    const { server, to } = fakeServer();
    const g = gateway({ isAssignedRider: vi.fn(async () => false) });
    g.server = server as never;
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.riderLocation(client as never, { orderId: "ord-1", lat: 0, lng: 0 });
    expect(res).toEqual({ error: "forbidden" });
    expect(to).not.toHaveBeenCalled();
  });

  it("coalesces a flood to ≤1 emit/sec per room: leading edge now, one trailing flush of the LATEST", async () => {
    vi.useFakeTimers();
    try {
      const { server, emit } = fakeServer();
      const recordFix = vi.fn(async () => {});
      const g = gateway({ isAssignedRider: vi.fn(async () => true), recordFix });
      g.server = server as never;
      const client = fakeSocket({ sub: "rider-1", role: "rider" });
      // Three fixes in the same instant (a flooding client).
      await g.riderLocation(client as never, { orderId: "ord-1", lat: 1, lng: 1 });
      await g.riderLocation(client as never, { orderId: "ord-1", lat: 2, lng: 2 });
      await g.riderLocation(client as never, { orderId: "ord-1", lat: 3, lng: 3 });
      // Only the leading edge has gone out; the room is shielded from the other two.
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenLastCalledWith(WS_EVENTS.position, expect.objectContaining({ lat: 1, lng: 1 }));
      // Persist still ran for every fix — coalescing throttles the EMIT, not the durable write.
      expect(recordFix).toHaveBeenCalledTimes(3);
      // At window end a single trailing flush carries the rider's LATEST buffered position.
      await vi.advanceTimersByTimeAsync(POSITION_COALESCE_MS);
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenLastCalledWith(WS_EVENTS.position, expect.objectContaining({ lat: 3, lng: 3 }));
      // No further fixes → no extra emits after the window drains.
      await vi.advanceTimersByTimeAsync(POSITION_COALESCE_MS * 2);
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a fix after the window is a fresh leading-edge emit (throttle resets)", async () => {
    vi.useFakeTimers();
    try {
      const { server, emit } = fakeServer();
      const g = gateway({ isAssignedRider: vi.fn(async () => true), recordFix: vi.fn(async () => {}) });
      g.server = server as never;
      const client = fakeSocket({ sub: "rider-1", role: "rider" });
      await g.riderLocation(client as never, { orderId: "ord-1", lat: 1, lng: 1 });
      expect(emit).toHaveBeenCalledTimes(1);
      // Let the window fully elapse with nothing buffered, then send another fix.
      await vi.advanceTimersByTimeAsync(POSITION_COALESCE_MS + 50);
      await g.riderLocation(client as never, { orderId: "ord-1", lat: 9, lng: 9 });
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenLastCalledWith(WS_EVENTS.position, expect.objectContaining({ lat: 9, lng: 9 }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TrackingGateway.prunePositionRooms", () => {
  it("drops a coalesce entry gone quiet past the TTL, keeps a recent one (bounds map growth)", async () => {
    const { server } = fakeServer();
    const g = gateway({ isAssignedRider: vi.fn(async () => true), recordFix: vi.fn(async () => {}) });
    g.server = server as never;
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    await g.riderLocation(client as never, { orderId: "ord-1", lat: 1, lng: 1 });
    const map = (g as unknown as { positionEmit: Map<string, { lastEmit: number }> }).positionEmit;
    const st = map.get(orderRoom("ord-1"));
    expect(st).toBeTruthy();
    // Recent → kept.
    g.prunePositionRooms(st!.lastEmit + 1);
    expect(map.has(orderRoom("ord-1"))).toBe(true);
    // Quiet past the TTL → pruned so the map can't grow unbounded.
    g.prunePositionRooms(st!.lastEmit + POSITION_ROOM_TTL_MS + 1);
    expect(map.has(orderRoom("ord-1"))).toBe(false);
  });
});

describe("TrackingGateway.handleDisconnect", () => {
  it("flushes the rider's last live position to PG (best-effort) when a user is present", () => {
    const flushToPg = vi.fn(async () => {});
    const g = gateway({ flushToPg });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    g.handleDisconnect(client as never);
    expect(flushToPg).toHaveBeenCalledWith("rider-1");
  });

  it("no-ops for an unauthenticated socket and never throws", () => {
    const flushToPg = vi.fn(async () => {});
    const g = gateway({ flushToPg });
    const client = fakeSocket(undefined);
    expect(() => g.handleDisconnect(client as never)).not.toThrow();
    expect(flushToPg).not.toHaveBeenCalled();
  });
});

describe("TrackingGateway.emitBoardNewOrder", () => {
  const payload: BoardNewOrderEvent = {
    id: "11111111-1111-1111-1111-111111111111",
    pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
    itemDesc: "Documents",
    suggestedFare: "2.40",
    proposedFare: "2.50",
    distanceKm: 1.5,
    createdAt: "2026-06-26T00:00:00Z",
  };

  it("emits board:new-order to the pickup's geo-cell room AND the city-wide BOARD_ROOM", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    const pickup = payload.pickup.point;
    g.emitBoardNewOrder(payload, pickup.lat, pickup.lng);
    // Geo-scoped riders are in the pickup cell room; loc-less riders are in BOARD_ROOM. Socket.IO
    // unions + dedupes the two, so each rider gets exactly one event.
    expect(to).toHaveBeenCalledWith(boardGeoRoom(boardCell(pickup.lat, pickup.lng)));
    expect(to).toHaveBeenCalledWith(BOARD_ROOM);
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.boardNewOrder, payload);
  });

  it("never throws when the server is undefined (best-effort)", () => {
    const g = gateway();
    const pickup = payload.pickup.point;
    expect(() => g.emitBoardNewOrder(payload, pickup.lat, pickup.lng)).not.toThrow();
  });
});

describe("TrackingGateway.emitBidExpired (C2)", () => {
  it("signals bid:expired to the BOARD (pickup geo-cell + city-wide), where bidders are — not the order room", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitBidExpired("ord-1", -17.83, 31.05);
    // Bidders live on the board (same distribution as board:new-order), never the order room.
    expect(to).toHaveBeenCalledWith(BOARD_ROOM);
    expect(to).toHaveBeenCalledWith(boardGeoRoom(boardCell(-17.83, 31.05)));
    expect(to).not.toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.bidExpired, expect.objectContaining({ orderId: "ord-1" }));
  });

  it("falls back to the city-wide board when pickup coords are absent", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitBidExpired("ord-1");
    expect(to).toHaveBeenCalledWith(BOARD_ROOM);
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.bidExpired, expect.objectContaining({ orderId: "ord-1" }));
  });

  it("never throws when the server is undefined (best-effort)", () => {
    const g = gateway();
    expect(() => g.emitBidExpired("ord-1")).not.toThrow();
  });
});

describe("TrackingGateway.emitJobCancelled (C3)", () => {
  it("carries collected:true to the order room (post-pickup hand-back path)", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitJobCancelled("ord-1", true);
    expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.jobCancelled, expect.objectContaining({ orderId: "ord-1", collected: true }));
  });

  it("carries collected:false pre-pickup", () => {
    const { server, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitJobCancelled("ord-1", false);
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.jobCancelled, expect.objectContaining({ collected: false }));
  });
});

describe("TrackingGateway.scanPresence (C5 watchdog)", () => {
  it("escalates presence:stale (role:rider) once per continuously-dark order", async () => {
    const lastSeen = new Date("2026-06-26T00:00:00Z");
    const findStaleRiderPresence = vi.fn(async () => [{ orderId: "ord-1", riderId: "r1", lastSeenAt: lastSeen }]);
    const { server, to, emit } = fakeServer();
    const g = gateway({ findStaleRiderPresence });
    g.server = server as never;

    await g.scanPresence();
    expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(emit).toHaveBeenCalledWith(
      WS_EVENTS.presenceStale,
      expect.objectContaining({ orderId: "ord-1", role: "rider", lastSeenAt: lastSeen.toISOString() }),
    );

    // Still dark on the next scan → no repeat emit (escalate once, no spam).
    await g.scanPresence();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("re-arms after the order recovers (rider reconnected / ride ended)", async () => {
    const stale = [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }];
    let round = 0;
    // scan 1: stale → emit; scan 2: recovered (empty) → drop; scan 3: stale again → emit.
    const findStaleRiderPresence = vi.fn(async () => (round === 1 ? [] : stale));
    const { server, emit } = fakeServer();
    const g = gateway({ findStaleRiderPresence });
    g.server = server as never;

    round = 0;
    await g.scanPresence();
    round = 1;
    await g.scanPresence();
    round = 2;
    await g.scanPresence();
    expect(emit).toHaveBeenCalledTimes(2); // once on the first dark, once after re-arming
  });

  it("never throws when the scan query fails (best-effort interval)", async () => {
    const findStaleRiderPresence = vi.fn(async () => {
      throw new Error("db down");
    });
    const g = gateway({ findStaleRiderPresence });
    await expect(g.scanPresence()).resolves.toBeUndefined();
  });

  it("stays silent when a peer instance already claimed the escalation (multi-instance dedup)", async () => {
    const findStaleRiderPresence = vi.fn(async () => [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }]);
    const claimPresenceEscalation = vi.fn(async () => false); // a peer instance won the cluster-wide claim
    const { server, emit } = fakeServer();
    const g = gateway({ findStaleRiderPresence, claimPresenceEscalation });
    g.server = server as never;
    await g.scanPresence();
    expect(claimPresenceEscalation).toHaveBeenCalledWith("rider:ord-1", expect.any(Number));
    expect(emit).not.toHaveBeenCalled(); // the peer's broadcast already reached this instance via the adapter
  });

  it("releases the cluster claim when a dark order recovers, so a re-dark re-arms cross-instance", async () => {
    const stale = [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }];
    let round = 0;
    const findStaleRiderPresence = vi.fn(async () => (round === 1 ? [] : stale));
    const releasePresenceEscalation = vi.fn(async () => {});
    const { server } = fakeServer();
    const g = gateway({ findStaleRiderPresence, releasePresenceEscalation });
    g.server = server as never;
    round = 0;
    await g.scanPresence();
    round = 1;
    await g.scanPresence(); // recovered → release the cluster-wide claim
    expect(releasePresenceEscalation).toHaveBeenCalledWith("rider:ord-1");
  });

  it("does NOT escalate a stale-heartbeat rider whose socket is live in the order room (parked ≠ dark)", async () => {
    // Heartbeat is stale — fixes are distance-gated, the rider just hasn't moved — but the assigned
    // rider's socket sits in the order room cluster-wide. No false "rider went dark" to the customer;
    // the heartbeat is refreshed instead so the DB authority self-heals.
    const findStaleRiderPresence = vi.fn(async () => [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }]);
    const touchRiderHeartbeat = vi.fn(async () => {});
    const { server, emit, in: inFn } = fakeServer([{ data: { user: { sub: "r1", role: "rider" } } }]);
    const g = gateway({ findStaleRiderPresence, touchRiderHeartbeat });
    g.server = server as never;
    await g.scanPresence();
    expect(inFn).toHaveBeenCalledWith(orderRoom("ord-1"));
    expect(touchRiderHeartbeat).toHaveBeenCalledWith("r1");
    expect(emit).not.toHaveBeenCalled();
  });

  it("still escalates when the room's only socket is someone ELSE (id-matched, not role-matched)", async () => {
    // A customer profile can carry the rider role, so a rider-role socket in the room is NOT proof the
    // assigned rider is live — the refutation must match the exact rider id.
    const findStaleRiderPresence = vi.fn(async () => [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }]);
    const touchRiderHeartbeat = vi.fn(async () => {});
    const { server, emit } = fakeServer([{ data: { user: { sub: "someone-else", role: "rider" } } }]);
    const g = gateway({ findStaleRiderPresence, touchRiderHeartbeat });
    g.server = server as never;
    await g.scanPresence();
    expect(touchRiderHeartbeat).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      WS_EVENTS.presenceStale,
      expect.objectContaining({ orderId: "ord-1", role: "rider" }),
    );
  });

  it("self-heals a previously-escalated order once the rider's socket returns while still parked", async () => {
    // Genuine dark spell → escalated. The rider reconnects but stays parked (heartbeat still stale).
    // The liveness check runs BEFORE the notified-skip, so the returning socket refreshes the heartbeat
    // (self-heal) instead of leaving the order stuck stale — and no repeat emit fires.
    const roomSockets: Array<{ data?: unknown }> = [];
    const findStaleRiderPresence = vi.fn(async () => [{ orderId: "ord-1", riderId: "r1", lastSeenAt: null }]);
    const touchRiderHeartbeat = vi.fn(async () => {});
    const { server, emit } = fakeServer(roomSockets);
    const g = gateway({ findStaleRiderPresence, touchRiderHeartbeat });
    g.server = server as never;

    await g.scanPresence(); // socket absent → genuine escalation
    expect(emit).toHaveBeenCalledTimes(1);

    roomSockets.push({ data: { user: { sub: "r1", role: "rider" } } }); // rider reconnects, still parked
    await g.scanPresence();
    expect(touchRiderHeartbeat).toHaveBeenCalledWith("r1"); // heals despite the earlier escalation
    expect(emit).toHaveBeenCalledTimes(1); // and never re-spams
  });
});

describe("TrackingGateway.emitOrderRebroadcast (F-01)", () => {
  it("pushes order:rebroadcast to the OLD order's room carrying the new order id", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitOrderRebroadcast("old-1", "new-1");
    // The customer is subscribed to the cancelled order's room — that's where the re-attach goes.
    expect(to).toHaveBeenCalledWith(orderRoom("old-1"));
    expect(emit).toHaveBeenCalledWith(
      WS_EVENTS.orderRebroadcast,
      expect.objectContaining({ orderId: "old-1", newOrderId: "new-1" }),
    );
  });

  it("never throws when the server is undefined (best-effort)", () => {
    const g = gateway();
    expect(() => g.emitOrderRebroadcast("old-1", "new-1")).not.toThrow();
  });
});

describe("TrackingGateway.scanPresence (C5 customer mirror)", () => {
  // A customer-role subscribe marks presence; the customer's disconnect starts the dark clock; a scan
  // after PRESENCE_ESCALATION_MS escalates presence:stale role:"customer" to the order room (the rider
  // is the receiver). filterActiveOrders confirms the ride is still live before escalating.
  const customerTracking = () => ({
    canAccessOrder: vi.fn(async () => true),
    // The default subscriber is the order's CUSTOMER (sender), not its assigned rider — so presence is
    // marked. Customer-presence is now keyed on this per-order relationship, not the JWT role (F-16).
    isAssignedRider: vi.fn(async () => false),
    flushToPg: vi.fn(async () => {}),
    findStaleRiderPresence: vi.fn(async () => []), // keep the rider pass quiet
    filterActiveOrders: vi.fn(async (ids: string[]) => new Set(ids)),
  });

  it("escalates role:customer once after the customer socket has been dark past the threshold", async () => {
    vi.useFakeTimers();
    try {
      const { server, to, emit } = fakeServer();
      const g = gateway(customerTracking());
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      // Not yet dark → a scan escalates nothing.
      await g.scanPresence();
      expect(emit).not.toHaveBeenCalled();

      // Customer drops → dark clock starts; still inside the window → no escalation.
      g.handleDisconnect(client as never);
      await g.scanPresence();
      expect(emit).not.toHaveBeenCalled();

      // Past the escalation window → one presence:stale role:"customer" to the order room.
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
      expect(emit).toHaveBeenCalledWith(
        WS_EVENTS.presenceStale,
        expect.objectContaining({ orderId: "ord-1", role: "customer" }),
      );

      // Still dark on the next scan → no repeat (escalate once, no spam).
      await g.scanPresence();
      expect(emit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT escalate role:customer when the customer is live on another instance (cluster membership)", async () => {
    vi.useFakeTimers();
    try {
      // The customer reconnected to a PEER instance, so a customer-role socket sits in the order room
      // cluster-wide even though this instance's in-memory presence shows them dark.
      const { server, emit, in: inFn } = fakeServer([{ data: { user: { sub: "c1", role: "customer" } } }]);
      const g = gateway(customerTracking());
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      g.handleDisconnect(client as never); // drops on THIS instance → local dark clock starts
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();

      // The adapter shows the customer live elsewhere → suppress the false "customer offline".
      expect(inFn).toHaveBeenCalledWith(orderRoom("ord-1"));
      expect(emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT escalate when the ride is no longer active (customer left a finished order)", async () => {
    vi.useFakeTimers();
    try {
      const { server, emit } = fakeServer();
      const tracking = customerTracking();
      tracking.filterActiveOrders = vi.fn(async () => new Set<string>()); // order no longer active
      const g = gateway(tracking);
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      g.handleDisconnect(client as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prunes an already-escalated order once the ride ends — no unbounded leak of the notified set", async () => {
    vi.useFakeTimers();
    try {
      const { server } = fakeServer();
      const tracking = customerTracking();
      const g = gateway(tracking);
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      g.handleDisconnect(client as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence(); // escalates ord-1 → now in the notified set (excluded from `candidates`)

      // The ride ends. A scan MUST still re-check the escalated order and prune it — proven by
      // filterActiveOrders being called with ord-1 even though it's no longer a fresh candidate.
      // Before the fix, `toCheck` was candidates-only → empty → early return → the entry leaked forever.
      tracking.filterActiveOrders.mockClear();
      tracking.filterActiveOrders.mockImplementation(async () => new Set<string>());
      await g.scanPresence();
      expect(tracking.filterActiveOrders).toHaveBeenCalledWith(expect.arrayContaining(["ord-1"]));
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-arms after the customer re-subscribes (reconnected), then dropped again", async () => {
    vi.useFakeTimers();
    try {
      const { server, emit } = fakeServer();
      const g = gateway(customerTracking());
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      // First dark spell → one escalation.
      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      g.handleDisconnect(client as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(emit).toHaveBeenCalledTimes(1);

      // Customer reconnects (re-subscribe re-arms), then goes dark again → a second escalation.
      const client2 = fakeSocket({ sub: "c1", role: "customer" }, [], "sock-2");
      await g.subscribeOrder(client2 as never, { orderId: "ord-1" });
      g.handleDisconnect(client2 as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts a same-socket double-subscribe to the SAME order once, so one disconnect returns to dark", async () => {
    vi.useFakeTimers();
    try {
      const { server, to, emit } = fakeServer();
      const g = gateway(customerTracking());
      g.server = server as never;
      const client = fakeSocket({ sub: "c1", role: "customer" });

      // Duplicate subscribe from the SAME socket to the SAME order (e.g. a client retry). Presence
      // must stay idempotent: live goes to 1, not 2 — otherwise the single disconnect below can't
      // bring live back to 0 and the dark clock / escalation never fires.
      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      await g.subscribeOrder(client as never, { orderId: "ord-1" });
      const presence = (g as unknown as { customerPresence: Map<string, { live: number }> }).customerPresence;
      expect(presence.get("ord-1")?.live).toBe(1);

      // One disconnect → live back to 0 → dark clock starts → escalation fires past the window.
      g.handleDisconnect(client as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
      expect(emit).toHaveBeenCalledWith(
        WS_EVENTS.presenceStale,
        expect.objectContaining({ orderId: "ord-1", role: "customer" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not track the order's ASSIGNED RIDER as customer presence (order relationship, not role)", async () => {
    vi.useFakeTimers();
    try {
      const { server, emit } = fakeServer();
      // The subscriber IS this order's assigned rider — so they must be treated as the rider (their
      // liveness is the DB heartbeat), never as customer presence, regardless of their JWT role.
      const g = gateway({ ...customerTracking(), isAssignedRider: vi.fn(async () => true) });
      g.server = server as never;
      const rider = fakeSocket({ sub: "r1", role: "rider" });

      await g.subscribeOrder(rider as never, { orderId: "ord-1" });
      g.handleDisconnect(rider as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      // No customer presence was recorded for the assigned rider → nothing to escalate.
      expect(emit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks a rider-ROLE account that is the order's SENDER as customer presence (F-16)", async () => {
    vi.useFakeTimers();
    try {
      // A rider-role account placed THIS delivery as the sender: `Role` is one global enum per account,
      // so the JWT still says "rider" even though they're the order's customer here. Presence must key
      // on the per-order relationship (they are NOT the order's assigned rider) — otherwise this sender
      // never gets the customer watchdog and `presence:stale` role:"customer" never fires when they go
      // dark. isAssignedRider:false ⇒ the subscriber is the customer ⇒ tracked + escalated.
      const { server, to, emit } = fakeServer();
      const g = gateway(customerTracking()); // isAssignedRider defaults to false → the sender
      g.server = server as never;
      const senderWithRiderRole = fakeSocket({ sub: "acct-1", role: "rider" });

      await g.subscribeOrder(senderWithRiderRole as never, { orderId: "ord-1" });
      g.handleDisconnect(senderWithRiderRole as never);
      await vi.advanceTimersByTimeAsync(PRESENCE_ESCALATION_MS + 1);
      await g.scanPresence();
      expect(to).toHaveBeenCalledWith(orderRoom("ord-1"));
      expect(emit).toHaveBeenCalledWith(
        WS_EVENTS.presenceStale,
        expect.objectContaining({ orderId: "ord-1", role: "customer" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
