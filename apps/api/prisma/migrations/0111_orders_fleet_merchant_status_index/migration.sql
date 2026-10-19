-- Own bikers E2: a branch's live fleet jobs and its weekly fleet rides read orders by fleet branch and status.
-- Expand-only, built CONCURRENTLY, the only statement in the file. Mirrors 0102.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_fleet_merchant_id_status_idx"
  ON "orders" ("fleet_merchant_id", "status");
