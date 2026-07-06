-- Rider rates the sender after delivery (rider-journey 4·7). A separate, additive table mirroring
-- `ratings` in the other direction (rider → sender) — the customer→rider rating flow is untouched.
-- One row per order (unique order_id); recorded-only, it never changes the order status.

CREATE TABLE "sender_ratings" (
  "id"            UUID PRIMARY KEY,
  "order_id"      UUID NOT NULL UNIQUE REFERENCES "orders"("id") ON DELETE CASCADE,
  "by_profile_id" UUID NOT NULL REFERENCES "profiles"("id"),
  "score"         INTEGER NOT NULL,
  "comment"       TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT now()
);
