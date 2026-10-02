-- Order flow v2 backend (packages/design/handoff/order-flow-v2, ledger D-59): substitution rounds,
-- proof photos on merchant orders, venue rating.
--
-- Expand-only and online-safe: every column added to an existing table is nullable with no default (no
-- table rewrite, no long lock); every index is on a table CREATEd in this same migration (empty, not yet
-- visible to other transactions — exempt per CONTRIBUTING "Changing the data model"). Nothing is dropped,
-- renamed or retyped, so the previous API release keeps working against this schema (deploy order:
-- migrate, then API).
--
-- 1. orders.out_of_stock_pref          BRIEF §7 "If something's out of stock": ask | remove (null = ask).
-- 2. orders.pickup_photo_at / pickup_bag_sealed
--                                      BRIEF §9 pickup proof on merchant orders (the photo key itself is the
--                                      existing pickup_photo_key).
-- 3. orders.delivery_proof_reason / delivery_proof_handed_to
--                                      BRIEF §9 door proof when the code can't be used (the photo is the
--                                      existing delivery_proof_key).
-- 4. merchant_order_items.replaces_item_id
--                                      the line an accepted swap replaced.
-- 5. merchant_order_substitutions (+ _lines)
--                                      BRIEF §8 per-line proposals and answers; at most one OPEN round per
--                                      order (partial unique index).
-- 6. venue_ratings                     BRIEF §11 the customer's venue rating, one per order.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "out_of_stock_pref" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_photo_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pickup_bag_sealed" BOOLEAN;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_proof_reason" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_proof_handed_to" TEXT;

ALTER TABLE "merchant_order_items" ADD COLUMN IF NOT EXISTS "replaces_item_id" UUID;

CREATE TABLE IF NOT EXISTS "merchant_order_substitutions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deadline_at" TIMESTAMP(3),
    "was_total" DECIMAL(10,2) NOT NULL,
    "created_by_profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "merchant_order_substitutions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "merchant_order_substitutions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "merchant_order_substitutions_order_id_created_at_idx" ON "merchant_order_substitutions"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "merchant_order_substitutions_status_deadline_at_idx" ON "merchant_order_substitutions"("status", "deadline_at");
-- One open round per order, enforced by the database (the service's pre-check races a double tap).
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_order_substitutions_one_open" ON "merchant_order_substitutions"("order_id") WHERE "status" = 'open';

CREATE TABLE IF NOT EXISTS "merchant_order_substitution_lines" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "from_quantity" INTEGER NOT NULL,
    "to_quantity" INTEGER,
    "swap_dish_id" UUID,
    "swap_name_snapshot" TEXT,
    "swap_price_usd" DECIMAL(10,2),
    "swap_quantity" INTEGER,
    "answer" TEXT,
    "result_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_order_substitution_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "merchant_order_substitution_lines_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "merchant_order_substitutions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "merchant_order_substitution_lines_round_id_idx" ON "merchant_order_substitution_lines"("round_id");

CREATE TABLE IF NOT EXISTS "venue_ratings" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "venue_ratings_order_id_key" ON "venue_ratings"("order_id");
CREATE INDEX IF NOT EXISTS "venue_ratings_merchant_id_idx" ON "venue_ratings"("merchant_id");
