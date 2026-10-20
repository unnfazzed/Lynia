import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

/**
 * R-3 (QA 2026-10-20): the one copy of the idempotency-key pattern five write endpoints each hand-rolled — parcel
 * orders, food orders, merchant bookings, top-ups and issues. A client sends a key it made for one attempt; a
 * timeout + retry or a double tap with the same key must return the SAME row, never a second order, charge or report.
 *
 *   replayFirst(key, find) ──── hit ──► the stored row (cheap: before any other work)
 *        │ miss
 *   createOnce({ key, create, find, heldElsewhere })
 *        ├─ create succeeds                                   ► { created: true, row }
 *        └─ unique violation (a concurrent duplicate won the index)
 *             ├─ find() finds the winner in this scope       ► { created: false, row }
 *             ├─ heldElsewhere(): the key belongs to another
 *             │  row the index covers (another order type,
 *             │  another order)                                ► 409 idempotency_key_reused
 *             └─ otherwise                                     ► rethrow (not a key collision)
 *
 * Before this, a parcel key reused on a food order hit the shared (customer_id, idempotency_key) index, the food
 * re-find (filtered to merchant orders) found nothing and the P2002 surfaced as a 500; a parcel create could replay
 * a food order as a parcel; and an issue key reused on another order returned the other order's issue.
 *
 * Replay semantics are unchanged: the request body is not compared, so a replay returns the original row.
 */

export const IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused";

/** The unique-index violation a concurrent duplicate submit raises. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function idempotencyKeyReused(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    reason: IDEMPOTENCY_KEY_REUSED,
    message: "That request was already used for something else. Please try again.",
  });
}

/** A create that either made the row or found the one a duplicate submit already made. */
export type Once<T> = { created: true; row: T } | { created: false; row: T };

/** The row this key already made, or null when there is no key or no row yet. */
export async function replayFirst<T>(key: string | null | undefined, find: () => Promise<T | null>): Promise<T | null> {
  return key ? find() : null;
}

/**
 * Run `create`; if a concurrent duplicate won the key's unique index, return its row (`created: false`) so the
 * caller skips its post-create work. A key the index says is taken by a row outside this endpoint's scope is a
 * 409, not a 500 and not someone else's row.
 */
export async function createOnce<T>(args: {
  key: string | null | undefined;
  create: () => Promise<T>;
  /** The row this key made in this endpoint's scope. */
  find: () => Promise<T | null>;
  /** Whether another row in the unique index's scope holds the key. Omit when `find`'s scope IS the index scope. */
  heldElsewhere?: () => Promise<boolean>;
}): Promise<Once<T>> {
  try {
    return { created: true, row: await args.create() };
  } catch (err) {
    if (!args.key || !isUniqueViolation(err)) throw err;
    const winner = await args.find();
    if (winner) return { created: false, row: winner };
    if (args.heldElsewhere && (await args.heldElsewhere())) throw idempotencyKeyReused();
    throw err;
  }
}
