-- Own bikers T7: validate the check 0112 added NOT VALID. VALIDATE takes SHARE UPDATE EXCLUSIVE (reads and writes
-- carry on). Every existing adjustment already has actor_profile_id, so nothing can fail.
ALTER TABLE "merchant_fleet_ledger" VALIDATE CONSTRAINT "merchant_fleet_ledger_charge_shape";
