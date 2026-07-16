-- WD-015: drop the blanket (rider_id, order_id, type) unique index. It forced every `adjustment` row's
-- order_id to stay NULL (a second fare correction on the same order would otherwise collide on the
-- constraint), which broke settlements.service's per-order ledger reconciliation query — a NULL never
-- matches an `orderId: { in: [...] } }` filter, so a corrected order's "commission accrued" figure
-- silently reverted to the pre-correction amount. The real invariant this index was protecting — exactly
-- one ride_commission row per order, ever — is rebuilt as a PARTIAL unique index in the next migration
-- (0031), scoped to `type = 'ride_commission'` only, so `adjustment` rows can now safely carry their real
-- order_id without colliding across multiple corrections on the same order.
DROP INDEX IF EXISTS "commission_ledger_rider_order_type_key";
