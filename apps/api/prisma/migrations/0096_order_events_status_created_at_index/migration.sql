-- Admin console v2 §3: funnel steps count order_events of one status over a created_at window (e.g. orders
-- delivered today). Expand-only, built CONCURRENTLY, the only statement in the file. Mirrors 0071.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "order_events_status_created_at_idx"
  ON "order_events" ("status", "created_at");
