import type { BoardNewOrderEvent } from "@lynia/shared";
import { WS_EVENTS } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { TokenService } from "../auth/token.service";
import type { TrackingService } from "./tracking.service";
import { BOARD_ROOM, orderRoom } from "./tracking.constants";
import { TrackingGateway } from "./tracking.gateway";

/** Minimal socket fake: records room joins/leaves + carries the authenticated user in `data`. */
function fakeSocket(user?: { sub: string; role: string }) {
  return {
    data: { user },
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
  };
}

/** Minimal server fake exposing a chainable `to().emit()` so we can assert room + event + payload. */
function fakeServer() {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  return { server: { to } as unknown, to, emit };
}

function gateway(tracking: Partial<TrackingService> = {}) {
  const g = new TrackingGateway(
    {} as Env,
    {} as TokenService,
    tracking as unknown as TrackingService,
  );
  return g;
}

describe("TrackingGateway.boardSubscribe", () => {
  it("joins the board room for a verified + online rider", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardSubscribe(client as never);
    expect(res).toEqual({ joined: "board" });
    expect(client.join).toHaveBeenCalledWith(BOARD_ROOM);
  });

  it("returns forbidden for an ineligible (unverified/offline/non-rider) caller", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => false) });
    const client = fakeSocket({ sub: "rider-1", role: "rider" });
    const res = await g.boardSubscribe(client as never);
    expect(res).toEqual({ error: "forbidden" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when the socket carries no user", async () => {
    const g = gateway({ isBoardEligible: vi.fn(async () => true) });
    const client = fakeSocket(undefined);
    const res = await g.boardSubscribe(client as never);
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

  it("emits board:new-order to the global BOARD_ROOM", () => {
    const { server, to, emit } = fakeServer();
    const g = gateway();
    g.server = server as never;
    g.emitBoardNewOrder(payload);
    expect(to).toHaveBeenCalledWith(BOARD_ROOM);
    expect(emit).toHaveBeenCalledWith(WS_EVENTS.boardNewOrder, payload);
  });

  it("never throws when the server is undefined (best-effort)", () => {
    const g = gateway();
    expect(() => g.emitBoardNewOrder(payload)).not.toThrow();
  });
});
