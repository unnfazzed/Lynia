-- E5: turn the trip-history OR-scan into index-order reads as `orders` grows.
--
-- `historyForUser` filters `customer_id = $1 OR rider_id = $1` ordered by `created_at DESC`, and the
-- snapshot timeline reads `order_events` by `order_id` ordered `created_at ASC`. With only the old
-- single-column indexes these degrade to a seq-scan-then-sort. Composite (role, created_at) indexes
-- let Postgres resolve each side as an index scan and preserve ordering.
--
-- The (rider_id, created_at) / (order_id, created_at) composites also serve the plain
-- rider_id / order_id lookups the old single-column indexes covered (leftmost-prefix), so those are
-- dropped to avoid redundant indexes.

DROP INDEX "orders_rider_id_idx";
DROP INDEX "order_events_order_id_idx";

CREATE INDEX "orders_customer_id_created_at_idx" ON "orders" ("customer_id", "created_at");
CREATE INDEX "orders_rider_id_created_at_idx" ON "orders" ("rider_id", "created_at");
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events" ("order_id", "created_at");
