-- U33 (C8, wave 4 lane C, ledger D-94): `rejection_reason = 'other'` now reads as the venue's own
-- "Something else" everywhere (packages/shared order-outcome.ts). Before this change two LyniaGo cancels
-- borrowed `other` too, so without this backfill their history rows would flip to "{venue} couldn't take
-- your order":
--   1. an ops cancel from the admin console (AdminOrdersService.cancelOrder, audit action `order.cancel`,
--      target = the order id) — now stamped `lynia_cancelled`;
--   2. N-18, the customer not answering the item-approval window (FoodOrderService.sweepExpiredItemApprovals)
--      — now stamped `item_approval_expired`. Identified by what only that sweep leaves behind: no canceller,
--      the item-approval deadline still on the row (an answer clears it, a decline stamps `cancelled_by`),
--      and the cancel at or after that deadline. A wallet refund (`refund_reference`) is the venue's.
-- Never keyed on `cancel_reason`: a merchant reject sets it too.
--
-- Data-only and idempotent (the 0064 / 0079 precedent): each pass touches only rows still at `other`, so a
-- re-run changes nothing. Ops first, so an ops cancel of an order waiting on an approval stays LyniaGo's ops.
UPDATE "orders" AS o SET "rejection_reason" = 'lynia_cancelled'
WHERE o."status" = 'cancelled' AND o."rejection_reason" = 'other'
  AND EXISTS (SELECT 1 FROM "audit_logs" AS a WHERE a."action" = 'order.cancel' AND a."target" = o."id"::text);

UPDATE "orders" AS o SET "rejection_reason" = 'item_approval_expired'
WHERE o."status" = 'cancelled' AND o."rejection_reason" = 'other'
  AND o."cancelled_by" IS NULL
  AND o."refund_reference" IS NULL
  AND o."item_approval_deadline_at" IS NOT NULL
  AND o."cancelled_at" IS NOT NULL
  AND o."cancelled_at" >= o."item_approval_deadline_at";
