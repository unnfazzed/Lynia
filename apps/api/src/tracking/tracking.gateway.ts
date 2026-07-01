import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import { Server, Socket } from "socket.io";
import { type BoardNewOrderEvent, BoardSubscribeEvent, boardCell, boardCellNeighborhood, WS_EVENTS } from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { BOARD_ROOM, boardGeoRoom, orderRoom, parseBearer } from "./tracking.constants";
import { TrackingService } from "./tracking.service";

interface SocketUser {
  sub: string;
  role: string;
}

/**
 * Live tracking (ET4). WS is best-effort PUSH only — GET /orders/:id (lane C) stays the source of
 * truth on reconnect. The Redis adapter fans events out across API instances.
 */
@WebSocketGateway({ cors: { origin: "*" } })
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokenService,
    private readonly tracking: TrackingService,
  ) {}

  afterInit(server: Server): void {
    if (this.env.REDIS_URL) {
      const pub = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log("Socket.IO Redis adapter enabled");
    }
  }

  /** Authenticate the socket via the access JWT; drop it if the token is missing/invalid. */
  handleConnection(client: Socket): void {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      parseBearer(client.handshake.headers.authorization);
    try {
      if (!raw) throw new Error("missing token");
      client.data.user = this.tokens.verifyAccess(raw) as SocketUser;
    } catch {
      client.disconnect(true);
    }
  }

  /**
   * On disconnect, flush the rider's last live position (held in Redis with a short TTL) to PG so it
   * isn't lost once the key expires. Best-effort — a flush failure must never surface to the socket.
   */
  handleDisconnect(client: Socket): void {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return;
    try {
      void this.tracking.flushToPg(user.sub);
    } catch {
      /* best-effort: losing the last position on disconnect is acceptable, throwing is not */
    }
  }

  @SubscribeMessage(WS_EVENTS.subscribeOrder)
  async subscribeOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string },
  ): Promise<{ joined: string } | { error: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { error: "unauthenticated" };
    if (!(await this.tracking.canAccessOrder(user.sub, body.orderId))) return { error: "forbidden" };
    await client.join(orderRoom(body.orderId));
    return { joined: body.orderId };
  }

  /**
   * A KYC-verified, online rider subscribes to the new-order board (§3.10). With a position (lat &
   * lng) the board is geo-scoped: the rider joins its cell + 8 neighbours (3×3), so it only receives
   * pushes for pickups nearby. Without a position it falls back to the city-wide BOARD_ROOM (mirrors
   * the REST `GET /orders/open` city-wide fallback). A re-subscribe on move re-scopes cleanly: we
   * first leave every board room the socket is currently in, then join the fresh set.
   */
  @SubscribeMessage(WS_EVENTS.boardSubscribe)
  async boardSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<{ joined: string | number } | { error: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { error: "unauthenticated" };
    if (!(await this.tracking.isBoardEligible(user.sub))) return { error: "forbidden" };

    const { lat, lng } = BoardSubscribeEvent.parse(body ?? {});

    // Re-scope cleanly: drop any board room this socket already sits in (a prior geo neighbourhood or
    // the city-wide room) before joining the fresh set, so moving riders don't accumulate stale rooms.
    for (const room of client.rooms) {
      if (room.startsWith("board:geo:") || room === BOARD_ROOM) await client.leave(room);
    }

    if (lat !== undefined && lng !== undefined) {
      const rooms = boardCellNeighborhood(lat, lng).map(boardGeoRoom);
      for (const room of rooms) await client.join(room);
      return { joined: rooms.length };
    }
    await client.join(BOARD_ROOM);
    return { joined: "board" };
  }

  /** Rider leaves the board (go-offline / unmount). */
  @SubscribeMessage(WS_EVENTS.boardLeave)
  async boardLeave(@ConnectedSocket() client: Socket): Promise<{ left: string }> {
    await client.leave(BOARD_ROOM);
    return { left: "board" };
  }

  @SubscribeMessage(WS_EVENTS.riderLocation)
  async riderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; lat: number; lng: number },
  ): Promise<{ ok: true } | { error: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { error: "unauthenticated" };
    if (!(await this.tracking.isAssignedRider(user.sub, body.orderId))) return { error: "forbidden" };

    // Emit-before-persist (P1-1a): the customer's live position must not be gated on the DB write.
    // Best-effort PUSH — a null server or emit failure never blocks the (still-persisted) fix.
    this.server?.to(orderRoom(body.orderId)).emit(WS_EVENTS.position, {
      riderId: user.sub,
      lat: body.lat,
      lng: body.lng,
      at: new Date().toISOString(),
    });
    await this.tracking.recordFix(user.sub, body.lat, body.lng);
    return { ok: true };
  }

  /**
   * Push an order's status change to everyone watching it (ET4). Best-effort PUSH — the REST
   * snapshot stays the source of truth, so this never throws into a caller's transaction.
   */
  emitOrderStatus(orderId: string, status: string): void {
    this.server?.to(orderRoom(orderId)).emit(WS_EVENTS.orderStatus, {
      orderId,
      status,
      at: new Date().toISOString(),
    });
  }

  /**
   * Signal an order's offer set changed to everyone watching it (SIGNAL ONLY — no offer contents;
   * the client refetches over the authenticated REST path). Best-effort; never throws.
   */
  emitOffersChanged(orderId: string): void {
    this.server?.to(orderRoom(orderId)).emit(WS_EVENTS.offersChanged, {
      orderId,
      at: new Date().toISOString(),
    });
  }

  /**
   * Push a new (redacted) open order to riders watching its pickup area. Emits to BOTH the pickup's
   * geo-cell room (geo-scoped subscribers) AND the city-wide BOARD_ROOM (loc-less subscribers) in one
   * chained call — Socket.IO unions + dedupes the target sockets, so a rider in either room gets
   * exactly one event, and the client dedupes by id regardless. Best-effort; a gateway failure must
   * never affect the order the customer just created.
   */
  emitBoardNewOrder(payload: BoardNewOrderEvent, pickupLat: number, pickupLng: number): void {
    this.server
      ?.to(boardGeoRoom(boardCell(pickupLat, pickupLng)))
      .to(BOARD_ROOM)
      .emit(WS_EVENTS.boardNewOrder, payload);
  }
}
