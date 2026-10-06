import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * First Run v2 E4 backfill (migration 0079, owner 2026-10-06: existing plates go to ops review). Pins the
 * data migration's contract without a database (the int lane runs it for real:
 * plate-review-backfill.int.spec.ts): ONE idempotent UPDATE, `none` → `checking`, real plates only.
 */
const SQL = readFileSync(resolve(__dirname, "../../prisma/migrations/0079_rider_plate_review_backfill/migration.sql"), "utf8");
const statements = SQL.split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("0079_rider_plate_review_backfill", () => {
  it("is a single data-only UPDATE on riders (no schema change; migration-safety.spec scans it for lock hazards)", () => {
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE "riders" SET "plate_status" = 'checking' WHERE /);
  });

  it("touches only never-checked rows with a real plate, so a re-run changes nothing", () => {
    const where = statements[0]!.split(" WHERE ")[1]!;
    expect(where).toContain(`"plate_status" = 'none'`);
    expect(where).toContain(`"bike_reg" IS NOT NULL`);
    // Erased riders keep bike_reg = '' (privacy.service): a blank plate is not sent for review.
    expect(where).toContain(`btrim("bike_reg") <> ''`);
  });
});
