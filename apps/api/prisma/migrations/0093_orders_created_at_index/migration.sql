-- Admin console v2 §3: the funnels and stuck lists window every order by created_at. Expand-only, built
-- CONCURRENTLY, the only statement in the file (CONCURRENTLY can't run inside a transaction). Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_created_at_idx"
  ON "orders" ("created_at");
