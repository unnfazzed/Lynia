import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { createAdapter } from "@socket.io/redis-adapter";
import IORedis from "ioredis";
import { Server, Socket } from "socket.io";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { orderRoom, parseBearer } from "./tracking.constants";
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
export class TrackingGateway implements OnGatewayInit, OnGatewayConnection {
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

  @SubscribeMessage("subscribe:order")
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

  @SubscribeMessage("rider:location")
  async riderLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; lat: number; lng: number },
  ): Promise<{ ok: true } | { error: string }> {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return { error: "unauthenticated" };
    if (!(await this.tracking.isAssignedRider(user.sub, body.orderId))) return { error: "forbidden" };

    await this.tracking.updateRiderLocation(user.sub, body.lat, body.lng);
    this.server.to(orderRoom(body.orderId)).emit("position", {
      riderId: user.sub,
      lat: body.lat,
      lng: body.lng,
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  /**
   * Push an order's status change to everyone watching it (ET4). Best-effort PUSH — the REST
   * snapshot stays the source of truth, so this never throws into a caller's transaction.
   */
  emitOrderStatus(orderId: string, status: string): void {
    this.server?.to(orderRoom(orderId)).emit("order:status", {
      orderId,
      status,
      at: new Date().toISOString(),
    });
  }
}
