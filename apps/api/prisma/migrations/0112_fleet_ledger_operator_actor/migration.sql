-- Own bikers T7 (docs/designs/own-bikers.md E3/OV-F6): an adjustment to a fleet bill is written from the console,
-- whose operator is an email (X-Operator), not a profile, so `actor_profile_id` (a uuid) can't name them. A
-- nullable text column holds the operator; the charge-shape check now asks for either. Nullable column: no
-- rewrite. The new check goes on NOT VALID (no scan under the lock); 0113 validates it online.
ALTER TABLE "merchant_fleet_ledger" ADD COLUMN IF NOT EXISTS "actor" TEXT;

ALTER TABLE "merchant_fleet_ledger" DROP CONSTRAINT IF EXISTS "merchant_fleet_ledger_charge_shape";
ALTER TABLE "merchant_fleet_ledger" ADD CONSTRAINT "merchant_fleet_ledger_charge_shape" CHECK (
  ("kind" <> 'adjustment' AND "order_id" IS NOT NULL AND "fee" >= 0)
  OR ("kind" = 'adjustment' AND ("actor_profile_id" IS NOT NULL OR "actor" IS NOT NULL) AND "reason" IS NOT NULL)
) NOT VALID;
