import type { BoardNewOrderEvent } from "@lynia/shared";
import { WS_EVENTS } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { TokenService } from "../auth/token.service";
import type { MetricsService } from "../observability/metrics.service";
import type { TrackingService } from "./tracking.service";
import { boardCell, boardCellNeighborhood } from "@lynia/shared";
import { BOARD_ROOM, boardGeoRoom, orderRoom } from "./tracking.constants";
import { TrackingGateway } from "./tracking.gateway";

/** Minimal socket fake: maintains a live `rooms` Set (like a real Socket) as join/leave run, and
 *  carries the authenticated user in `data`. */
function fakeSocket(user?: { sub: string; role: string }, rooms: string[] = []) {
  const roomSet = new Set(rooms);
  return {
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
function fakeServer() {
  const emit = vi.fn();
  const chain = { emit, to: vi.fn() as ReturnType<typeof vi.fn> };
  const to = vi.fn(() => chain);
  chain.to = to;
  return { server: { to } as unknown, to, emit };
}

/** Spy metrics fake — position-emit recording is best-effort; keep tests off the OTel path. */
const fakeMetrics = () =>
  ({ startTimer: () => () => 0, recordPositionEmit: vi.fn() }) as unknown as MetricsService;

function gateway(tracking: Partial<TrackingService> = {}) {
  const g = new TrackingGateway(
    {} as Env,
    {} as TokenService,
    tracking as unknown as TrackingService,
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
  it("leaves the board room", async () => {
    const g = gateway();
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardLeave(client as never);
    expect(res).toEqual({ left: "board" });
    expect(client.leave).toHaveBeenCalledWith(BOARD_ROOM);
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
