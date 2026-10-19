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
  // Admin console v2 §3: the funnels / stuck lists window orders, order events and offers by time (0093–0097).
  { model: "Order", attr: "@@index([createdAt])", table: "orders", columns: `"created_at"` },
  { model: "Order", attr: "@@index([status, createdAt])", table: "orders", columns: `"status", "created_at"` },
  { model: "Order", attr: "@@index([orderType, createdAt])", table: "orders", columns: `"order_type", "created_at"` },
  { model: "OrderEvent", attr: "@@index([status, createdAt])", table: "order_events", columns: `"status", "created_at"` },
  { model: "Offer", attr: "@@index([createdAt])", table: "offers", columns: `"created_at"` },
  // Admin console v2 §8: the audit viewer and the person timeline page audit rows by actor / target (0098–0099).
  { model: "AuditLog", attr: "@@index([actor, createdAt])", table: "audit_logs", columns: `"actor", "created_at"` },
  { model: "AuditLog", attr: "@@index([target, createdAt])", table: "audit_logs", columns: `"target", "created_at"` },
  // Admin console v2 §6: the platform money panel sums the ledger by day over 7 / 30 days (0102).
  { model: "CommissionLedger", attr: "@@index([createdAt])", table: "commission_ledger", columns: `"created_at"` },
  // Admin console v2 §4: the funnels pick each cohort by sign-up time (0103).
  { model: "Profile", attr: "@@index([createdAt])", table: "profiles", columns: `"created_at"` },
  // Own bikers E2: the roster and fleet rounds read riders by owner (0110); a branch's live fleet jobs and
  // weekly fleet rides read orders by fleet branch + status (0111).
  { model: "Rider", attr: "@@index([fleetOwnerProfileId])", table: "riders", columns: `"fleet_owner_profile_id"` },
  { model: "Order", attr: "@@index([fleetMerchantId, status])", table: "orders", columns: `"fleet_merchant_id", "status"` },
];

describe("hot-path indexes", () => {
  it.each(HOT_PATH_INDEXES)("$table ($columns) is declared in the schema and built concurrently", ({ model, attr, table, columns }) => {
    expect(modelBody(model)).toContain(attr);
    expect(migrations).toMatch(new RegExp(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "\\w+" ON "${table}" \\(${columns}\\)`));
  });
});
