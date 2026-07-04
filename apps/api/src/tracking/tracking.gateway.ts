import { Inject, Logger, type OnModuleDestroy } from "@nestjs/common";
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
import {
  type BidExpiredEvent,
  type BoardNewOrderEvent,
  BoardSubscribeEvent,
  boardCell,
  boardCellNeighborhood,
  type JobCancelledEvent,
  PRESENCE_ESCALATION_MS,
  type PresenceStaleEvent,
  WS_EVENTS,
} from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { BOARD_ROOM, boardGeoRoom, orderRoom, parseBearer } from "./tracking.constants";
import { TrackingService } from "./tracking.service";

interface SocketUser {
  sub: string;
  role: string;
}

interface PositionPayload {
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}

/** Server-side coalesce window: at most one `position` emit per order room per this interval (E3). */
export const POSITION_COALESCE_MS = 1_000;

/** How often the presence watchdog scans active rides for a dark rider socket (INTERFACE-AUDIT C5).
 *  Pilot-simple: ONE Nest interval over `ACTIVE_RIDE_STATUSES` orders, no new infra. The escalation
 *  threshold itself is the shared `PRESENCE_ESCALATION_MS`; this is only the poll cadence. */
export const PRESENCE_SCAN_INTERVAL_MS = 30_000;

interface CoalesceState {
  lastEmit: number;
  timer?: ReturnType<typeof setTimeout>;
  pending?: PositionPayload;
}

/**
 * Live tracking (ET4). WS is best-effort PUSH only — GET /orders/:id (lane C) stays the source of
 * truth on reconnect. The Redis adapter fans events out across API instances.
 */
@WebSocketGateway({ cors: { origin: "*" } })
export class TrackingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer() server!: Server;

  /** Per-order-room coalesce state — server-side throttle so one fast/misbehaving client can't flood
   *  a room with position emits (E3). Keyed by order room; entries are dropped once a window drains. */
  private readonly positionEmit = new Map<string, CoalesceState>();

  /** Presence-watchdog interval handle (C5). Started in afterInit once the server exists. */
  private presenceTimer?: ReturnType<typeof setInterval>;

  /** Order ids we've already escalated a `presence:stale` for — so a continuously-dark rider is
   *  escalated ONCE, not on every scan (no escalation spam). An id is dropped once its rider is fresh
   *  again (reset on reconnect) or the ride ends, re-arming a future escalation. */
  private readonly staleNotified = new Set<string>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokenService,
    private readonly tracking: TrackingService,
    private readonly metrics: MetricsService,
  ) {}

  afterInit(server: Server): void {
    if (this.env.REDIS_URL) {
      const pub = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
      const sub = pub.duplicate();
      server.adapter(createAdapter(pub, sub));
      this.logger.log("Socket.IO Redis adapter enabled");
    }
    // Presence watchdog (C5): one interval scanning active rides for a dark rider socket. unref so it
    // never keeps the process alive; it only runs where the gateway is actually initialised (not in
    // the unit tests, which construct the gateway directly and call scanPresence() explicitly).
    this.presenceTimer = setInterval(() => void this.scanPresence(), PRESENCE_SCAN_INTERVAL_MS);
    this.presenceTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
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
    // Best-effort PUSH — a null server or emit failure never blocks the (still-persisted) fix. The
    // emit is coalesced to ≤1/sec per room server-side (E3), so the persist below still runs on every
    // fix while the room is shielded from a flood.
    this.coalescePositionEmit(orderRoom(body.orderId), {
      riderId: user.sub,
      lat: body.lat,
      lng: body.lng,
      at: new Date().toISOString(),
    });
    await this.tracking.recordFix(user.sub, body.lat, body.lng);
    return { ok: true };
  }

  /**
   * Server-side coalesce of `position` emits to ≤1 per room per POSITION_COALESCE_MS (E3). Leading
   * edge fires immediately (preserving emit-before-persist / low first-fix latency); further fixes
   * inside the window overwrite a single buffered payload that a trailing timer flushes at window end,
   * so the customer always converges on the rider's latest position without a flood. Measures the SLO
   * on emitted fixes only. Never throws — a null server or timer hiccup must not affect the persist.
   */
  private coalescePositionEmit(room: string, payload: PositionPayload): void {
    const now = Date.now();
    const state = this.positionEmit.get(room) ?? { lastEmit: 0 };
    if (now - state.lastEmit >= POSITION_COALESCE_MS) {
      state.lastEmit = now;
      state.pending = undefined;
      this.positionEmit.set(room, state);
      this.flushPositionEmit(room, payload);
      return;
    }
    // Inside the window: buffer the latest fix and ensure a single trailing flush is scheduled.
    state.pending = payload;
    this.positionEmit.set(room, state);
    if (!state.timer) {
      state.timer = setTimeout(() => {
        const s = this.positionEmit.get(room);
        if (!s) return;
        s.timer = undefined;
        const next = s.pending;
        s.pending = undefined;
        if (next) {
          s.lastEmit = Date.now();
          this.flushPositionEmit(room, next);
        } else {
          this.positionEmit.delete(room); // window drained with nothing buffered — release the entry
        }
      }, POSITION_COALESCE_MS - (now - state.lastEmit));
      state.timer.unref?.();
    }
  }

  /** Fire one `position` emit and record its glass-to-server latency. Best-effort. */
  private flushPositionEmit(room: string, payload: PositionPayload): void {
    const done = this.metrics.startTimer();
    this.server?.to(room).emit(WS_EVENTS.position, payload);
    this.metrics.recordPositionEmit(done());
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

  /**
   * The auction window closed with no pick — signal `bid:expired` to everyone in the order's room
   * (INTERFACE-AUDIT C2). Distinct from `offers:changed`/`not_chosen` (someone else was picked). The
   * server is the single expiry timer authority; clients never drive this. Best-effort; never throws.
   */
  emitBidExpired(orderId: string): void {
    const payload: BidExpiredEvent = { orderId, at: new Date().toISOString() };
    this.server?.to(orderRoom(orderId)).emit(WS_EVENTS.bidExpired, payload);
  }

  /**
   * The customer cancelled an assigned job — push `job:cancelled` to the order room so the assigned
   * rider leaves the (now dead) job screen (INTERFACE-AUDIT C3). `collected` tells the rider UI which
   * path to show: pre-pickup → back to the board; post-pickup → sender contact for the hand-back. No
   * reliability impact on the rider (a customer cancel never strikes). Best-effort; never throws.
   */
  emitJobCancelled(orderId: string, collected: boolean): void {
    const payload: JobCancelledEvent = { orderId, collected, at: new Date().toISOString() };
    this.server?.to(orderRoom(orderId)).emit(WS_EVENTS.jobCancelled, payload);
  }

  /**
   * The counterparty's socket has been dark past `PRESENCE_ESCALATION_MS` — push `presence:stale` to
   * the order room so the receiving app escalates its "live paused" treatment to a warning and stops
   * rendering the last position as live (INTERFACE-AUDIT C5). Best-effort; never throws.
   */
  emitPresenceStale(orderId: string, role: PresenceStaleEvent["role"], lastSeenAt: Date | null): void {
    const payload: PresenceStaleEvent = {
      orderId,
      role,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
      at: new Date().toISOString(),
    };
    this.server?.to(orderRoom(orderId)).emit(WS_EVENTS.presenceStale, payload);
  }

  /**
   * One watchdog pass (C5): find active rides whose rider heartbeat is older than
   * `PRESENCE_ESCALATION_MS` and escalate each ONCE. An order that recovers (rider reconnected) or
   * ends drops out of the stale set and is removed from `staleNotified`, re-arming a future
   * escalation. Best-effort — a scan failure must never crash the interval. Public so it's unit-testable
   * without driving real timers.
   */
  async scanPresence(): Promise<void> {
    try {
      const stale = await this.tracking.findStaleRiderPresence(PRESENCE_ESCALATION_MS);
      const staleIds = new Set(stale.map((s) => s.orderId));
      // Drop recovered/ended orders so a reconnect re-arms the one-shot escalation.
      for (const id of this.staleNotified) if (!staleIds.has(id)) this.staleNotified.delete(id);
      for (const s of stale) {
        if (this.staleNotified.has(s.orderId)) continue; // already escalated — don't spam every scan
        this.staleNotified.add(s.orderId);
        this.emitPresenceStale(s.orderId, "rider", s.lastSeenAt);
      }
    } catch (err) {
      this.logger.warn(`presence scan failed: ${(err as Error).message}`);
    }
  }
}
