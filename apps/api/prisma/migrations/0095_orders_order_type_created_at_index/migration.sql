-- Admin console v2 §3: parcel vs merchant funnels read orders by order_type over a created_at window.
-- Expand-only, built CONCURRENTLY, the only statement in the file. Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_order_type_created_at_idx"
  ON "orders" ("order_type", "created_at");
