import type { Prisma } from "@prisma/client";
import { OFFER_WINDOW_MS } from "@lynia/shared";

/**
 * Prisma predicates over a parcel auction's end (`offerWindowEndsAt`, owner 2026-10-12). The column is
 * null on rows written before migration 0089, whose end is the old `createdAt + OFFER_WINDOW_MS` — the
 * same fallback `offerWindowEndsAt()` in @lynia/shared applies in TS. Every CAS that used to pin the
 * window on `createdAt` pins it through one of these, so the DB and the TS reads agree on the end.
 */

/** The order's window had ended by `atMs`. */
export function offerWindowEndedBy(atMs: number): Prisma.OrderWhereInput {
  return {
    OR: [
      { offerWindowEndsAt: { lte: new Date(atMs) } },
      { offerWindowEndsAt: null, createdAt: { lte: new Date(atMs - OFFER_WINDOW_MS) } },
    ],
  };
}

/** The order's window was still open at `atMs`. */
export function offerWindowOpenAt(atMs: number): Prisma.OrderWhereInput {
  return {
    OR: [
      { offerWindowEndsAt: { gt: new Date(atMs) } },
      { offerWindowEndsAt: null, createdAt: { gt: new Date(atMs - OFFER_WINDOW_MS) } },
    ],
  };
}
