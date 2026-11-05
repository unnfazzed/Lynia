import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-124 (migration 0118, owner 2026-11-05): a business's name is never a person's name. Pins the data migration's
 * contract without a database: ONE idempotent UPDATE that gives a team row named after its business the person's
 * own profile name, only where that profile has a real name (not erased, not itself the business's name).
 */
const SQL = readFileSync(resolve(__dirname, "../../prisma/migrations/0118_merchant_member_name_not_business/migration.sql"), "utf8");
const statements = SQL.split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("0118_merchant_member_name_not_business", () => {
  it("is a single data-only UPDATE on merchant_members", () => {
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^UPDATE "merchant_members" AS mm SET "display_name" = left\(btrim\(p\."first_name" \|\| ' ' \|\| p\."last_name"\), 60\) FROM "profiles" AS p, "merchants" AS m WHERE /);
  });

  it("touches only rows named after their business, from a real profile name, so a re-run changes nothing", () => {
    const where = statements[0]!.split(" WHERE ")[1]!;
    expect(where).toContain(`lower(btrim(mm."display_name")) = lower(btrim(m."name"))`);
    expect(where).toContain(`p."phone" NOT LIKE 'erased:%'`);
    expect(where).toContain(`btrim(p."first_name" || ' ' || p."last_name") <> ''`);
    expect(where).toContain(`lower(btrim(p."first_name" || ' ' || p."last_name")) <> lower(btrim(m."name"))`);
  });
});
