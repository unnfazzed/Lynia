import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * U33 review: `other` now reads as the venue's own cancel, so the ops and N-18 cancels that stored `other`
 * before the change are backfilled by migration 0087 (proved against a real database in
 * orders/cancel-reason-backfill.int.spec.ts). This pins its keys: the admin cancel's audit action, the
 * N-18 fingerprint, and never `cancel_reason` (a merchant reject sets it too).
 */
const file = resolve(__dirname, "../../prisma/migrations/0087_cancel_reason_backfill/migration.sql");

describe("migration 0087 — cancel-reason backfill", () => {
  it("exists, and keys ops cancels on the `order.cancel` audit row and N-18 on the approval deadline", () => {
    expect(existsSync(file)).toBe(true);
    const sql = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sql).toMatch(/SET "rejection_reason" = 'lynia_cancelled'[\s\S]*a\."action" = 'order\.cancel' AND a\."target" = o\."id"::text/);
    expect(sql).toMatch(/SET "rejection_reason" = 'item_approval_expired'[\s\S]*"cancelled_by" IS NULL[\s\S]*"cancelled_at" >= o\."item_approval_deadline_at"/);
    // Idempotent: only rows still at `other` move.
    expect(sql.match(/o\."rejection_reason" = 'other'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/cancel_reason/);
  });
});
