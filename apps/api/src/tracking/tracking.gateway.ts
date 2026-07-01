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
import { type BoardNewOrderEvent, WS_EVENTS } from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { BOARD_ROOM, orderRoom, parseBearer } from "./tracking.constants";
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

  /** A KYC-verified, online rider joins the single global board room for new-order pushes (§3.10). */
  @SubscribeMessage(WS_EVENTS.boardSubscribe)
  async boardSubscribe(
    @ConnectedSocket() client: Socket,
  ): Promise<{ joined: string } | { error: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { error: "unauthenticated" };
    if (!(await this.tracking.isBoardEligible(user.sub))) return { error: "forbidden" };
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
   * Push a new (redacted) open order to the board room (verified + online riders). Best-effort;
   * a gateway failure must never affect the order the customer just created.
   */
  emitBoardNewOrder(payload: BoardNewOrderEvent): void {
    this.server?.to(BOARD_ROOM).emit(WS_EVENTS.boardNewOrder, payload);
  }
}
