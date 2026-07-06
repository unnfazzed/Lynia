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
import { Server, Socket } from "socket.io";
import {
  type BidExpiredEvent,
  type BoardNewOrderEvent,
  BoardSubscribeEvent,
  boardCell,
  boardCellNeighborhood,
  type JobCancelledEvent,
  type OrderRebroadcastEvent,
  type OrderTakenEvent,
  PRESENCE_ESCALATION_MS,
  type PresenceStaleEvent,
  WS_EVENTS,
} from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { corsOriginResolver } from "../common/cors";
import { createRedisClient } from "../common/redis";
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

/** TTL (seconds) for the cluster-wide presence-escalation dedup key. Long enough to outlast a single
 *  continuous dark period so a peer instance can't re-emit; the primary re-arm is the explicit release
 *  on recovery, this is just the backstop if the releasing instance dies. */
export const PRESENCE_STALE_DEDUP_TTL_S = 600;

/** A per-order `positionEmit` coalesce entry with no fix for this long is stale (the ride ended or the
 *  rider went offline) — pruned on the presence scan so the map can't grow unbounded over an instance's
 *  lifetime. A later fix simply re-creates the entry as a fresh leading edge. */
export const POSITION_ROOM_TTL_MS = 60_000;

interface CoalesceState {
  lastEmit: number;
  timer?: ReturnType<typeof setTimeout>;
  pending?: PositionPayload;
}

/**
 * Live tracking (ET4). WS is best-effort PUSH only — GET /orders/:id (lane C) stays the source of
 * truth on reconnect. The Redis adapter fans events out across API instances.
 */
// CORS mirrors the HTTP allow-list (common/cors.ts): native clients (no Origin) connect; browser
// origins must be allow-listed via CORS_ALLOWED_ORIGINS. Replaces the previous wildcard `origin: "*"`.
// JWT is still verified on the handshake regardless — this is defense in depth at the transport edge.
@WebSocketGateway({ cors: { origin: corsOriginResolver() } })
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

  /**
   * Customer-side presence (C5 mirror). No server-side customer heartbeat exists — the customer's
   * socket only ever SUBSCRIBEs to an order room and then listens — so we derive the customer's
   * liveness from the socket connection itself: `live` counts the customer sockets currently joined
   * to the order room, and `darkSince` is the wall-clock moment the last one dropped (null while
   * ≥1 is live). scanPresence escalates `presence:stale` role:"customer" once an order's `darkSince`
   * ages past PRESENCE_ESCALATION_MS (and the ride is still active), so the RIDER's app escalates
   * its "live paused" treatment. Keyed by order id.
   */
  private readonly customerPresence = new Map<string, { live: number; darkSince: number | null }>();

  /** Reverse index socketId → the order ids that socket subscribed to AS THE CUSTOMER, so a
   *  disconnect can decrement the right rooms without reading client.rooms (already cleared by the
   *  time handleDisconnect fires). */
  private readonly customerSocketOrders = new Map<string, Set<string>>();

  /** Customer-side twin of `staleNotified` — the orders whose customer we've already escalated, so a
   *  continuously-dark customer is escalated once. Re-armed on the customer's re-subscribe. */
  private readonly customerStaleNotified = new Set<string>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokenService,
    private readonly tracking: TrackingService,
    private readonly metrics: MetricsService,
  ) {}

  afterInit(server: Server): void {
    if (this.env.REDIS_URL) {
      const pub = createRedisClient(this.env.REDIS_URL);
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
    // C5 customer-presence: release the customer's rooms first (independent of the rider flush). The
    // last customer socket dropping off an order starts its dark clock; scanPresence escalates it if
    // the ride is still active PRESENCE_ESCALATION_MS later.
    const orders = this.customerSocketOrders.get(client.id);
    if (orders) {
      this.customerSocketOrders.delete(client.id);
      for (const orderId of orders) {
        const p = this.customerPresence.get(orderId);
        if (!p) continue;
        p.live -= 1;
        if (p.live <= 0) {
          p.live = 0;
          p.darkSince = Date.now();
        }
      }
    }
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
    // C5 customer-presence: a customer-role subscriber is, by construction, the order's customer (an
    // assigned rider is always rider-role, so canAccessOrder + role:"customer" ⇒ the sender). Mark
    // them live and re-arm any prior escalation. A rider-role subscriber is left untracked here (its
    // liveness is the DB heartbeat via findStaleRiderPresence).
    if (user.role === "customer") this.markCustomerPresent(client.id, body.orderId);
    return { joined: body.orderId };
  }

  /** Record that a customer socket is live on an order room (C5). Increments the live count, clears
   *  the dark clock, indexes the socket for disconnect cleanup, and re-arms a future escalation. */
  private markCustomerPresent(socketId: string, orderId: string): void {
    let orders = this.customerSocketOrders.get(socketId);
    if (!orders) {
      orders = new Set();
      this.customerSocketOrders.set(socketId, orders);
    }
    // Idempotent per (socket, order): the disconnect path decrements `live` exactly once per order
    // tracked in this Set, so a same-socket re-subscribe to the SAME order must NOT increment again —
    // otherwise `live` reaches 2 while the Set holds one entry, `live` never returns to 0 on disconnect,
    // and the dark clock (darkSince) / presence:stale escalation never fires. If already tracked the
    // socket is already counted live (darkSince already null), so this is a safe no-op.
    if (orders.has(orderId)) return;
    orders.add(orderId);
    const p = this.customerPresence.get(orderId) ?? { live: 0, darkSince: null };
    p.live += 1;
    p.darkSince = null;
    this.customerPresence.set(orderId, p);
    this.customerStaleNotified.delete(orderId); // back on the room → re-arm the one-shot escalation
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
    // Leave the city-wide room AND every geo-cell room a located subscribe joined (boardSubscribe joins
    // a 3×3 neighbourhood) — otherwise an offline rider keeps receiving new-order pushes on those rooms.
    for (const room of client.rooms) {
      if (room.startsWith("board:geo:") || room === BOARD_ROOM) await client.leave(room);
    }
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
   * The auction window closed with no pick — signal `bid:expired` to ALL bidders (INTERFACE-AUDIT C2).
   * Bidders live on the BOARD (the geo-cell room the order was broadcast to + the city-wide BOARD_ROOM
   * for loc-less riders) — NOT the order room, which only the customer joins — so this mirrors
   * `emitBoardNewOrder`'s exact distribution so the same riders who saw the order see it close. Distinct
   * from `offers:changed`/`not_chosen` (someone else was picked). The server is the single expiry timer
   * authority; clients never drive this. Best-effort; never throws.
   */
  emitBidExpired(orderId: string, pickupLat?: number, pickupLng?: number): void {
    const payload: BidExpiredEvent = { orderId, at: new Date().toISOString() };
    let target = this.server?.to(BOARD_ROOM);
    if (target && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
      target = target.to(boardGeoRoom(boardCell(pickupLat as number, pickupLng as number)));
    }
    target?.emit(WS_EVENTS.bidExpired, payload);
  }

  /**
   * A customer picked a rider — signal `order:taken` to the BOARD with `emitBidExpired`'s exact
   * distribution (geo-cell + city-wide), so every rider who saw the card sees it close (rider-journey
   * 2·b1 / 3·b1): browsers drop the now-taken card, bidders who weren't picked show "not chosen"
   * (distinct from `bid:expired`, where NObody was picked). The selected rider learns they won via
   * the `assigned` push + their active-job feed, not this event. Best-effort; never throws.
   */
  emitOrderTaken(orderId: string, pickupLat?: number, pickupLng?: number): void {
    const payload: OrderTakenEvent = { orderId, at: new Date().toISOString() };
    let target = this.server?.to(BOARD_ROOM);
    if (target && Number.isFinite(pickupLat) && Number.isFinite(pickupLng)) {
      target = target.to(boardGeoRoom(boardCell(pickupLat as number, pickupLng as number)));
    }
    target?.emit(WS_EVENTS.orderTaken, payload);
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
   * The assigned rider bailed and the job was auto re-broadcast at the same price as a NEW open order
   * (INTERFACE-AUDIT F-01). Push `order:rebroadcast` to the OLD (now `cancelled`) order's room — where
   * the customer is subscribed — carrying the new order's id so the customer app moves itself to the
   * fresh auction instead of stranding on a dead "cancelled" terminal. Mirrors `emitJobCancelled`'s
   * shape (one action to `orderRoom(oldOrderId)`). Best-effort; never throws.
   */
  emitOrderRebroadcast(oldOrderId: string, newOrderId: string): void {
    const payload: OrderRebroadcastEvent = {
      orderId: oldOrderId,
      newOrderId,
      at: new Date().toISOString(),
    };
    this.server?.to(orderRoom(oldOrderId)).emit(WS_EVENTS.orderRebroadcast, payload);
  }

  /**
   * One watchdog pass (C5): escalate each dark counterparty ONCE. Two mirror directions, one interval:
   *  - RIDER: active rides whose rider heartbeat is older than `PRESENCE_ESCALATION_MS` (the DB
   *    liveness authority) → `presence:stale` role:"rider" so the customer's app pauses "live".
   *  - CUSTOMER: order rooms whose last customer socket dropped more than `PRESENCE_ESCALATION_MS`
   *    ago (in-memory `customerPresence`) AND whose ride is still active → `presence:stale`
   *    role:"customer" so the rider's app escalates. An order that recovers (counterparty reconnected)
   *    or ends drops out of its notified set, re-arming a future escalation. Best-effort — a scan
   *    failure must never crash the interval. Public so it's unit-testable without driving real timers.
   */
  async scanPresence(): Promise<void> {
    try {
      const stale = await this.tracking.findStaleRiderPresence(PRESENCE_ESCALATION_MS);
      const staleIds = new Set(stale.map((s) => s.orderId));
      // Drop recovered/ended orders so a reconnect re-arms the one-shot escalation — and release the
      // cluster-wide claim so the re-arm works across instances, not just this one.
      for (const id of this.staleNotified) {
        if (!staleIds.has(id)) {
          this.staleNotified.delete(id);
          void this.tracking.releasePresenceEscalation(`rider:${id}`);
        }
      }
      for (const s of stale) {
        if (this.staleNotified.has(s.orderId)) continue; // already handled here — don't spam every scan
        this.staleNotified.add(s.orderId);
        // Cluster-wide one-shot (multi-instance): only the instance that wins the claim emits; the
        // broadcast already fans out to every instance via the Redis adapter, so peers must stay quiet.
        if (await this.tracking.claimPresenceEscalation(`rider:${s.orderId}`, PRESENCE_STALE_DEDUP_TTL_S)) {
          this.emitPresenceStale(s.orderId, "rider", s.lastSeenAt);
        }
      }
    } catch (err) {
      this.logger.warn(`presence scan failed: ${(err as Error).message}`);
    }
    this.prunePositionRooms();
    await this.scanCustomerPresence();
  }

  /** Drop `positionEmit` coalesce entries that have gone quiet (no fix for POSITION_ROOM_TTL_MS and no
   *  pending trailing flush) so the map is bounded by CURRENTLY-active rides, not by every ride the
   *  instance has ever served. Public for unit testing without driving real timers. */
  prunePositionRooms(now: number = Date.now()): void {
    for (const [room, state] of this.positionEmit) {
      if (!state.timer && now - state.lastEmit > POSITION_ROOM_TTL_MS) {
        this.positionEmit.delete(room);
      }
    }
  }

  /** Customer half of the watchdog (C5 mirror). Split out so a failure in either direction can't
   *  starve the other. Only orders whose customer has been dark past the threshold are candidates;
   *  the DB round-trip confirms they're still active before escalating (a customer who backgrounded
   *  the app on a delivered/cancelled order is never flagged). */
  private async scanCustomerPresence(): Promise<void> {
    try {
      const now = Date.now();
      const candidates: string[] = [];
      for (const [orderId, p] of this.customerPresence) {
        if (p.darkSince != null && now - p.darkSince >= PRESENCE_ESCALATION_MS && !this.customerStaleNotified.has(orderId)) {
          candidates.push(orderId);
        }
      }
      // Check the fresh candidates AND the already-escalated set: an escalated order is excluded from
      // `candidates` forever, so without re-checking it here its entries would leak past the ride's end
      // (mirror of the rider-side prune at scanPresence). One DB round-trip over the union.
      const toCheck = [...new Set([...candidates, ...this.customerStaleNotified])];
      if (toCheck.length === 0) return;
      const active = await this.tracking.filterActiveOrders(toCheck);
      // Prune anything no longer active from BOTH sets — the ride ended while the customer was away;
      // dropping the entry stops the leak and re-arms a future escalation if they ever reconnect.
      for (const orderId of toCheck) {
        if (!active.has(orderId)) {
          this.customerPresence.delete(orderId);
          this.customerStaleNotified.delete(orderId);
          void this.tracking.releasePresenceEscalation(`customer:${orderId}`); // re-arm cluster-wide
        }
      }
      // Escalate the fresh candidates that are still active (one-shot; re-arms on reconnect). The
      // cluster-wide claim collapses N instances' escalations into one (each broadcast already reaches
      // every instance via the Redis adapter).
      for (const orderId of candidates) {
        if (!active.has(orderId)) continue; // pruned above
        // Multi-instance false-positive guard: `customerPresence`/`darkSince` is per-instance in-memory,
        // so a customer who reconnected to a DIFFERENT instance still looks dark here. The Socket.IO
        // Redis adapter makes room membership cluster-wide, so confirm via the adapter that no customer
        // socket sits in the order room before escalating; if one does, the customer is live elsewhere —
        // clear our stale local dark state, drop the (would-be) escalation, and release the claim.
        if (await this.customerLiveInRoom(orderId)) {
          const p = this.customerPresence.get(orderId);
          if (p) p.darkSince = null;
          this.customerStaleNotified.delete(orderId);
          void this.tracking.releasePresenceEscalation(`customer:${orderId}`);
          continue;
        }
        this.customerStaleNotified.add(orderId);
        if (await this.tracking.claimPresenceEscalation(`customer:${orderId}`, PRESENCE_STALE_DEDUP_TTL_S)) {
          const p = this.customerPresence.get(orderId);
          this.emitPresenceStale(orderId, "customer", p?.darkSince != null ? new Date(p.darkSince) : null);
        }
      }
    } catch (err) {
      this.logger.warn(`customer presence scan failed: ${(err as Error).message}`);
    }
  }

  /**
   * Is a customer socket currently joined to the order room anywhere in the cluster? With the Socket.IO
   * Redis adapter, `fetchSockets()` returns matching sockets across ALL instances, so this sees a
   * customer connected to a peer instance that this instance's in-memory `customerPresence` can't. Only
   * the order's customer can subscribe as customer-role to its room (subscribeOrder gates on
   * canAccessOrder + role), so any customer-role socket in the room IS that order's customer. Best-effort:
   * a missing server or a fetch error returns false, falling back to the per-instance dark decision.
   */
  private async customerLiveInRoom(orderId: string): Promise<boolean> {
    if (!this.server) return false;
    try {
      const sockets = await this.server.in(orderRoom(orderId)).fetchSockets();
      return sockets.some((s) => (s.data as { user?: SocketUser } | undefined)?.user?.role === "customer");
    } catch {
      return false;
    }
  }
}
