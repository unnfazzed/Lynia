import { ConflictException, ForbiddenException, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { captureException } from "../observability/sentry";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Own bikers (docs/designs/own-bikers.md, ledger D-117): an Own biker (`riders.fleet_owner_profile_id` set)
 * only ever carries their owner's jobs, and a public biker never carries a fleet job (`orders.fleet_merchant_id`
 * set). One rule, both directions: the rider's fleet owner must equal the owner of the order's fleet branch,
 * with NULL = NULL meaning "public on both sides".
 *
 * The database is the guarantee: migration 0108's constraint trigger refuses an out-of-scope assignment at
 * commit, whatever path wrote it. These helpers are the doors in front of it, so a biker is told no before
 * the write (with a readable refusal) and an out-of-scope biker is never shown, pushed or offered a job in
 * the first place. Lives in `common/` (like commission-cover and merchant-debt-lock) so the parcel and
 * merchant sides both import it without importing each other.
 */

type Db = PrismaService | Prisma.TransactionClient;

export const FLEET_SCOPE_REFUSAL = {
  reason: "fleet_scope",
  message: "This job isn't one you can take.",
} as const;

/** Audit action for an Own biker giving a "My bikers" booking back before pickup (OrderLifecycleService.cancel). */
export const FLEET_DROP_ACTION = "merchant.fleet.drop";

/** Whether a biker whose fleet owner is `riderOwner` may serve a job whose fleet owner is `orderOwner`. */
export function inFleetScope(riderOwner: string | null, orderOwner: string | null): boolean {
  return riderOwner === orderOwner;
}

/** The owner of an order's fleet branch, or null for a public order (or a branch with no owner). */
export async function orderFleetOwner(db: Db, fleetMerchantId: string | null): Promise<string | null> {
  if (!fleetMerchantId) return null;
  const m = await db.merchant.findUnique({ where: { id: fleetMerchantId }, select: { ownerProfileId: true } });
  return m?.ownerProfileId ?? null;
}

/** The fleet owner of each rider in `riderIds` (absent from the map = not a rider). */
export async function riderFleetOwners(db: Db, riderIds: string[]): Promise<Map<string, string | null>> {
  if (riderIds.length === 0) return new Map();
  const rows = await db.rider.findMany({
    where: { profileId: { in: riderIds } },
    select: { profileId: true, fleetOwnerProfileId: true },
  });
  return new Map(rows.map((r) => [r.profileId, r.fleetOwnerProfileId]));
}

/** The riders in `riderIds` who may serve a job of the fleet branch `fleetMerchantId` (null = a public job). */
export async function ridersInFleetScope(db: Db, riderIds: string[], fleetMerchantId: string | null): Promise<Set<string>> {
  const [owners, orderOwner] = await Promise.all([riderFleetOwners(db, riderIds), orderFleetOwner(db, fleetMerchantId)]);
  return new Set(riderIds.filter((id) => owners.has(id) && inFleetScope(owners.get(id) ?? null, orderOwner)));
}

/** Throw the `fleet_scope` refusal when `riderId` may not serve a job of the fleet branch `fleetMerchantId`. */
export async function assertRiderInFleetScope(db: Db, riderId: string, fleetMerchantId: string | null): Promise<void> {
  const ok = await ridersInFleetScope(db, [riderId], fleetMerchantId);
  if (!ok.has(riderId)) throw new ForbiddenException(FLEET_SCOPE_REFUSAL);
}

/**
 * Whether `err` is the database guard refusing an out-of-scope write (migration 0108: SQLSTATE 23514, constraint
 * `orders_fleet_scope` or `riders_fleet_link`). Prisma surfaces a trigger error raised at commit as an unknown
 * request error, so the message is what identifies it. A door that checked first only meets this on a race
 * (a Join between its check and its commit).
 */
export function isFleetScopeViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /\bfleet_scope\b|\bfleet_link\b/.test(message);
}

const logger = new Logger("FleetScope");
let alertSink: ((text: string) => void) | null = null;

/** OwnerAlertsService registers its Telegram send here at construction (common/ takes no Nest dependencies). */
export function setFleetScopeAlertSink(sink: ((text: string) => void) | null): void {
  alertSink = sink;
}

/**
 * E1: the database refused an out-of-scope write. Every door checks first, so this means a door was missed or
 * lost a race (a Join between its check and its commit). Either way someone should look: a structured log line,
 * a Sentry error and a Telegram alert. The caller still answers the user with its own 409.
 */
export function reportFleetScopeViolation(err: unknown, ctx: { path: string; orderId?: string | null; riderId?: string | null }): void {
  const detail = { path: ctx.path, orderId: ctx.orderId ?? null, riderId: ctx.riderId ?? null };
  logger.error(`fleet_scope_violation ${JSON.stringify(detail)}`);
  captureException(err, { fleetScopeViolation: detail });
  alertSink?.(`⚠️ Own bikers: the database refused an out-of-scope write at ${detail.path} (order ${detail.orderId ?? "-"}, biker ${detail.riderId ?? "-"}). A check was missed or raced.`);
}

/** Re-throw a database fleet-scope refusal as a 409 the apps can read (reported, E1); anything else unchanged. */
export function rethrowFleetScope(err: unknown, ctx: { path: string; orderId?: string | null; riderId?: string | null }): never {
  if (isFleetScopeViolation(err)) {
    reportFleetScopeViolation(err, ctx);
    throw new ConflictException(FLEET_SCOPE_REFUSAL);
  }
  throw err;
}
