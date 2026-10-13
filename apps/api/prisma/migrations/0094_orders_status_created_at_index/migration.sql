-- Admin console v2 §3: stuck lists read orders in one status over a created_at window (e.g. expired with no
-- biker, oldest first). Expand-only, built CONCURRENTLY, the only statement in the file. Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_status_created_at_idx"
  ON "orders" ("status", "created_at");
