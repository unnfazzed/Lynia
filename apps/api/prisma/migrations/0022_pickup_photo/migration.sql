-- Proof-of-pickup photo (§5c "parcel is with your rider — photo attached"): the GCS object KEY of
-- the rider's optional parcel photo, taken at collection and served to BOTH parties on the order
-- snapshot (read URLs are minted on demand, mirroring riders.photo_url — never a stored URL).
-- Nullable, no default, no backfill — additive/expand-only, no table rewrite; old rows and old
-- clients (which simply never attach or read the field) are unaffected.
ALTER TABLE "orders" ADD COLUMN "pickup_photo_key" TEXT;
