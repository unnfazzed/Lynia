-- Ledger D-72 (owner 2026-10-02): "Popular" ranks venues by their delivered orders over the last 30 days.
-- That read is one aggregate over `orders` filtered by merchant_id and a created_at window; `orders` had
-- no merchant_id index at all, so it would seq-scan as the table grows. The same index also serves the
-- merchant's end-of-day and weekly money reads (merchant_id + created_at range). Expand-only, built
-- CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_merchant_id_created_at_idx"
  ON "orders" ("merchant_id", "created_at");
