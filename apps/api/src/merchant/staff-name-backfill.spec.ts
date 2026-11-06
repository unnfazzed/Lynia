import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-124 backfill (migration 0117, owner 2026-11-05): staff go on record under the name they registered with, not
 * the one the owner typed on the invite. Pins the data migration's contract without a database: ONE idempotent
 * UPDATE on merchant_members, staff only, from the person's own profile, never from an erased or nameless one.
 */
const SQL = readFileSync(resolve(__dirname, "../../prisma/migrations/0117_merchant_staff_name_backfill/migration.sql"), "utf8");
const statements = SQL.split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("0117_merchant_staff_name_backfill", () => {
  it("is a single data-only UPDATE on merchant_members (no schema change)", () => {
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE "merchant_members" AS mm SET "display_name" = left\(btrim\(p\."first_name" \|\| ' ' \|\| p\."last_name"\), 60\) FROM "profiles" AS p WHERE /);
  });

  it("touches staff only, skips erased and nameless accounts, and a re-run changes nothing", () => {
    const where = statements[0]!.split(" WHERE ")[1]!;
    expect(where).toContain(`mm."profile_id" = p."id"`);
    expect(where).toContain(`mm."role" = 'staff'`);
    expect(where).toContain(`p."phone" NOT LIKE 'erased:%'`);
    expect(where).toContain(`btrim(p."first_name" || ' ' || p."last_name") <> ''`);
    expect(where).toContain(`mm."display_name" IS DISTINCT FROM`);
  });
});
