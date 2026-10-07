import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Indexes the hot reads depend on (PW-LC1 / PW-LC2). Each must be declared on the model in schema.prisma
 * AND built by a migration, CONCURRENTLY (migration-safety.spec.ts), so dropping one from either side —
 * or a schema-only `@@index` that never reaches the database — fails here rather than as a slow page.
 */
const PRISMA_DIR = resolve(__dirname, "../../prisma");
const schema = readFileSync(resolve(PRISMA_DIR, "schema.prisma"), "utf8");
const migrations = readdirSync(resolve(PRISMA_DIR, "migrations"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
  .map((d) => readFileSync(resolve(PRISMA_DIR, "migrations", d.name, "migration.sql"), "utf8").replace(/\s+/g, " "))
  .join("\n");

/** The body of `model <name> { … }` in schema.prisma. */
function modelBody(name: string): string {
  const m = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`model ${name} not found`);
  return m[1];
}

const HOT_PATH_INDEXES = [
  // PW-LC1: the notifications feed reads audit rows back by target + action, several times per open.
  { model: "AuditLog", attr: "@@index([target, action])", table: "audit_logs", columns: `"target", "action"` },
  // PW-LC2: the merchant queue polls orders by merchant_id every 5s (built by 0071, leading on merchant_id).
  { model: "Order", attr: "@@index([merchantId, createdAt])", table: "orders", columns: `"merchant_id", "created_at"` },
];

describe("hot-path indexes", () => {
  it.each(HOT_PATH_INDEXES)("$table ($columns) is declared in the schema and built concurrently", ({ model, attr, table, columns }) => {
    expect(modelBody(model)).toContain(attr);
    expect(migrations).toMatch(new RegExp(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "\\w+" ON "${table}" \\(${columns}\\)`));
  });
});
