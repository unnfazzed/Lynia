import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard against a NEW migration repeating the online-lock hazard that migrations 0006/0007 shipped
 * before this check existed:
 *  - `ADD COLUMN … GENERATED ALWAYS AS (…) STORED` on a populated table → a full table rewrite under
 *    ACCESS EXCLUSIVE (0006 did this to `orders`).
 *  - `CREATE INDEX` (not `CONCURRENTLY`) on a pre-existing table → blocks writes for the build (0006/0007).
 *  - `DROP INDEX` without `IF EXISTS` → not re-runnable after a half-applied migration (0007).
 *
 * On a deployed pilot with a populated `orders` table these stall all order writes for the migration's
 * duration. The already-applied migrations are checksum-locked and can't be rewritten in place, so they
 * are grandfathered; this only enforces the safe pattern on migrations authored from here on. An index
 * on a table CREATEd in the same migration is exempt (the table is empty and not yet visible to other
 * transactions). See CONTRIBUTING "Changing the data model".
 */
const GRANDFATHERED_THROUGH = 17;
const MIGRATIONS_DIR = resolve(__dirname, "../../prisma/migrations");

/** Strip SQL line comments so keywords inside `-- …` prose don't trip the scanner. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

/** Tables created in this same migration — an index / stored column on a brand-new table is safe. */
function tablesCreatedIn(sql: string): Set<string> {
  const names = new Set<string>();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi;
  for (const m of sql.matchAll(re)) names.add(m[1].toLowerCase());
  return names;
}

/** Return the human-readable hazards in a migration's SQL (empty ⇒ safe). Exported shape kept simple
 *  so it can be exercised directly with synthetic SQL below. */
export function findMigrationHazards(rawSql: string): string[] {
  const sql = stripComments(rawSql);
  const created = tablesCreatedIn(sql);
  const hazards: string[] = [];

  // Split on `;` into statements so each CREATE/DROP/ALTER is scored on its own.
  for (const stmtRaw of sql.split(";")) {
    const stmt = stmtRaw.replace(/\s+/g, " ").trim();
    if (!stmt) continue;
    const upper = stmt.toUpperCase();

    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(stmt) && !/CONCURRENTLY/i.test(stmt)) {
      const on = stmt.match(/\bON\s+"?(\w+)"?/i);
      const table = on?.[1]?.toLowerCase();
      if (!table || !created.has(table)) {
        hazards.push(`CREATE INDEX without CONCURRENTLY on existing table "${table ?? "?"}"`);
      }
    }

    if (/^DROP\s+INDEX/i.test(stmt) && !/IF\s+EXISTS/i.test(stmt)) {
      hazards.push("DROP INDEX without IF EXISTS (not re-runnable on a partial apply)");
    }

    if (/^ALTER\s+TABLE/i.test(stmt) && upper.includes("GENERATED ALWAYS") && upper.includes("STORED")) {
      const on = stmt.match(/ALTER\s+TABLE\s+"?(\w+)"?/i);
      const table = on?.[1]?.toLowerCase();
      if (!table || !created.has(table)) {
        hazards.push(`ADD GENERATED … STORED column rewrites existing table "${table ?? "?"}" under ACCESS EXCLUSIVE`);
      }
    }
  }
  return hazards;
}

function migrationNumber(dir: string): number {
  const m = dir.match(/^(\d+)_/);
  return m ? Number(m[1]) : NaN;
}

describe("migration safety guard", () => {
  it("no new migration (> grandfathered baseline) takes an online lock on a populated table", () => {
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
      .map((d) => d.name);

    const offenders: Record<string, string[]> = {};
    for (const dir of dirs) {
      if (migrationNumber(dir) <= GRANDFATHERED_THROUGH) continue; // applied + immutable
      const sql = readFileSync(resolve(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      const hazards = findMigrationHazards(sql);
      if (hazards.length) offenders[dir] = hazards;
    }

    // A failure means a new migration must be reworked: nullable column + batched backfill, build
    // indexes CONCURRENTLY out-of-band, and add IF EXISTS to drops. See CONTRIBUTING.
    expect(offenders).toEqual({});
  });

  // Detection unit tests — prove the guard actually fires (and doesn't over-fire) on synthetic SQL.
  it("flags a non-concurrent index on a pre-existing table", () => {
    expect(findMigrationHazards(`CREATE INDEX "o_idx" ON "orders" ("status");`)).toHaveLength(1);
  });

  it("allows an index on a table created in the same migration", () => {
    const sql = `CREATE TABLE "widgets" ("id" uuid); CREATE INDEX "w_idx" ON "widgets" ("id");`;
    expect(findMigrationHazards(sql)).toEqual([]);
  });

  it("allows a CONCURRENTLY index on an existing table", () => {
    expect(findMigrationHazards(`CREATE INDEX CONCURRENTLY "o_idx" ON "orders" ("status");`)).toEqual([]);
  });

  it("flags DROP INDEX without IF EXISTS but allows it with", () => {
    expect(findMigrationHazards(`DROP INDEX "o_idx";`)).toHaveLength(1);
    expect(findMigrationHazards(`DROP INDEX IF EXISTS "o_idx";`)).toEqual([]);
  });

  it("flags a GENERATED … STORED column added to an existing table", () => {
    const sql = `ALTER TABLE "orders" ADD COLUMN "g" geography GENERATED ALWAYS AS (x) STORED;`;
    expect(findMigrationHazards(sql)).toHaveLength(1);
  });

  it("ignores keywords that appear only inside SQL comments", () => {
    expect(findMigrationHazards(`-- CREATE INDEX on orders someday\nSELECT 1;`)).toEqual([]);
  });
});
