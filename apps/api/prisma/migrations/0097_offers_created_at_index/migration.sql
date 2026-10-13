-- Admin console v2 §3: bid-history / first-bid reads window offers by created_at. Expand-only, built
-- CONCURRENTLY, the only statement in the file. Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "offers_created_at_idx"
  ON "offers" ("created_at");
