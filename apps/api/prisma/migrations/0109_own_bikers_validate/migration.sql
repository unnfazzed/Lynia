-- Own bikers: validate the constraints 0108 added NOT VALID on the populated `orders` and `riders` tables.
-- VALIDATE takes SHARE UPDATE EXCLUSIVE, which doesn't block reads or writes, so the scan runs online. Every
-- existing row has NULL in the new columns, so nothing can fail.
ALTER TABLE "riders" VALIDATE CONSTRAINT "riders_fleet_owner_profile_id_fkey";
ALTER TABLE "riders" VALIDATE CONSTRAINT "riders_fleet_home_merchant_id_fkey";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_fleet_merchant_id_fkey";
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_fleet_fee_pairs_branch";
