import { Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

/**
 * Admin console v2 §3 (docs/plans/2026-10-13-admin-console-v2.md): the append-only `domain_events` table the
 * funnels, stuck lists and money pages read. This file is the ONLY writer.
 *
 * The rules every call site relies on:
 *  - **Same transaction when there is one.** Pass the domain change's `tx`, so the event commits or rolls back
 *    with it and can never disagree with it. Outside a transaction pass the PrismaService (best-effort).
 *  - **Never fails the caller.** A write error is logged and swallowed. The insert itself has nothing that can
 *    reject it (no foreign keys, no unique beyond the random uuid, free-text columns), so inside a transaction
 *    an error means the connection is already broken and the domain write would fail on its own anyway.
 *  - **Cheap and small.** One INSERT. `data` holds ids, amounts and codes only — never GPS (the table sits
 *    outside the GPS_RETENTION_DAYS purge) and never PII (names, phones, notes).
 *  - Tolerates a client without the `domainEvent` delegate (a unit-test double), so adding an event to a hot
 *    path never breaks an unrelated spec's hand-rolled Prisma mock.
 */

export type DomainActorRole = "customer" | "rider" | "merchant" | "admin" | "system";

export type DomainEventType =
  | "rider.online"
  | "rider.offline"
  | "rider.onboarding_step"
  | "kyc.attempt"
  | "order.assigned"
  | "order.broadcast"
  | "order.fare_raise"
  | "offer.bid"
  | "offer.rebid"
  | "offer.withdraw"
  | "merchant.phase"
  | "merchant.availability"
  | "merchant.application"
  | "menu.stock"
  | "topup.anomaly";

export type DomainSubjectType = "rider" | "order" | "offer" | "merchant" | "dish" | "topup";

/** The steps of the biker funnel (plan §4) this PR records. */
export type RiderOnboardingStep =
  | "become"
  | "didit_started"
  | "plate_set"
  | "plate_verified"
  | "first_online"
  | "first_job"
  | "job_10"
  | "first_topup";

/** The venue steps `merchant.phase` records (data.phase). */
export type MerchantPhaseStep = "accept" | "accept_partial" | "kitchen_confirmed" | "reject" | "payment_confirmed" | "ready" | "cancel";

/** The steps of a merchant's application (plan §5) that `merchant.application` records (data.step). */
export type MerchantApplicationStep =
  | "submitted"
  | "called"
  | "reviewing"
  | "approved"
  | "rejected"
  | "docs_ok"
  | "live"
  | "suspended"
  | "resumed";

/** Why a rider went offline (`rider.offline` data.reason). */
export type RiderOfflineReason =
  | "manual"
  | "cancel_strike_cooldown"
  | "dispute_strike_cooldown"
  | "reliability_hold"
  | "admin_suspend"
  | "admin_ban"
  | "kyc_change"
  | "id_expired";

type JsonScalar = string | number | boolean | null;
export type DomainEventData = Record<string, JsonScalar | JsonScalar[] | undefined>;

export interface DomainEventInput {
  type: DomainEventType;
  actorId?: string | null;
  actorRole?: DomainActorRole | null;
  subjectType: DomainSubjectType;
  subjectId: string;
  orderId?: string | null;
  data?: DomainEventData;
}

/** Anything that carries the `domainEvent` delegate: the PrismaService or an interactive-transaction client. */
export type DomainEventsDb = Pick<Prisma.TransactionClient, "domainEvent">;

const logger = new Logger("DomainEvents");

/** Keys whose values must never reach `data` (GPS and contact details). Stripped defensively. */
const FORBIDDEN_DATA_KEYS = new Set(["lat", "lng", "latitude", "longitude", "point", "phone", "geog", "location"]);

function cleanData(data: DomainEventData | undefined): Prisma.InputJsonValue | undefined {
  if (!data) return undefined;
  const out: Record<string, JsonScalar | JsonScalar[]> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || FORBIDDEN_DATA_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? (out as Prisma.InputJsonValue) : undefined;
}

/** The create args for one event (exported for the batch-transaction form and for specs). */
export function domainEventCreateArgs(e: DomainEventInput): Prisma.DomainEventCreateArgs {
  const data = cleanData(e.data);
  return {
    data: {
      type: e.type,
      actorId: e.actorId ?? null,
      actorRole: e.actorRole ?? null,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      orderId: e.orderId ?? null,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

function hasDelegate(db: unknown): db is DomainEventsDb {
  const d = (db as { domainEvent?: { create?: unknown } } | null | undefined)?.domainEvent;
  return typeof d?.create === "function";
}

export class DomainEventsService {
  /**
   * Record one event. Await it inside a transaction (so it commits with the change); outside one it may be
   * fired with `void` — it never rejects.
   */
  async record(db: unknown, e: DomainEventInput): Promise<void> {
    if (!hasDelegate(db)) return;
    try {
      await db.domainEvent.create(domainEventCreateArgs(e));
    } catch (err) {
      logger.warn(`domain_event_write_failed type=${e.type} subject=${e.subjectType}:${e.subjectId} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Record several events (each independently best-effort), in order. */
  async recordMany(db: unknown, events: DomainEventInput[]): Promise<void> {
    for (const e of events) await this.record(db, e);
  }

  /**
   * For a BATCH `$transaction([...])`: the event's create as an array of zero or one Prisma promise, to spread
   * into the batch so it commits with the rest. Empty when the client has no delegate (a test double).
   */
  batchOps(db: unknown, e: DomainEventInput): Prisma.PrismaPromise<unknown>[] {
    if (!hasDelegate(db)) return [];
    return [db.domainEvent.create(domainEventCreateArgs(e))];
  }

  /**
   * A rider taken offline (by themselves, or forced by a demotion: hold, cooldown, suspend/ban, KYC change,
   * stale heartbeat). Written where the forced `isOnline: false` is written, so a rider already offline
   * may get one — harmless for supply-hours maths, which pairs each online with the next offline.
   */
  riderOffline(
    db: unknown,
    riderId: string,
    reason: RiderOfflineReason,
    extra: { actorId?: string | null; actorRole?: DomainActorRole; orderId?: string | null } = {},
  ): Promise<void> {
    return this.record(db, {
      type: "rider.offline",
      actorId: extra.actorId ?? null,
      actorRole: extra.actorRole ?? "system",
      subjectType: "rider",
      subjectId: riderId,
      orderId: extra.orderId ?? null,
      data: { reason },
    });
  }

  /** A venue's step on one of its orders (accept, reject, payment confirmed, ready…) — sugar over {@link record}. */
  merchantPhase(
    db: unknown,
    args: {
      orderId: string;
      merchantId: string | null;
      phase: MerchantPhaseStep;
      actorId?: string | null;
      actorRole?: DomainActorRole;
      data?: DomainEventData;
    },
  ): Promise<void> {
    return this.record(db, {
      type: "merchant.phase",
      actorId: args.actorId ?? null,
      actorRole: args.actorRole ?? "merchant",
      subjectType: "order",
      subjectId: args.orderId,
      orderId: args.orderId,
      data: { phase: args.phase, merchantId: args.merchantId, ...args.data },
    });
  }

  /** A merchant application step (plan §5) — sugar over {@link record}. `data` carries codes only, never notes. */
  merchantApplication(
    db: unknown,
    merchantId: string,
    step: MerchantApplicationStep,
    extra: { actorId?: string | null; actorRole?: DomainActorRole; data?: DomainEventData } = {},
  ): Promise<void> {
    return this.record(db, {
      type: "merchant.application",
      actorId: extra.actorId ?? null,
      actorRole: extra.actorRole ?? "admin",
      subjectType: "merchant",
      subjectId: merchantId,
      data: { step, ...extra.data },
    });
  }

  /** A biker funnel step (plan §4) — sugar over {@link record}. */
  riderStep(
    db: unknown,
    riderId: string,
    step: RiderOnboardingStep,
    extra: { actorId?: string | null; actorRole?: DomainActorRole; orderId?: string | null; data?: DomainEventData } = {},
  ): Promise<void> {
    return this.record(db, {
      type: "rider.onboarding_step",
      // An explicit null (a system step) stays null; only an omitted actor defaults to the rider.
      actorId: extra.actorId !== undefined ? extra.actorId : riderId,
      actorRole: extra.actorRole ?? "rider",
      subjectType: "rider",
      subjectId: riderId,
      orderId: extra.orderId ?? null,
      data: { step, ...extra.data },
    });
  }
}

/** The process-wide writer. Stateless, so services import it rather than threading a DI token everywhere. */
export const domainEvents = new DomainEventsService();
