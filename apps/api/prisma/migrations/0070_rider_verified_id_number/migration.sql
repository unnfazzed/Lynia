-- D-70 (Calm Mint v2 "Didit ID prefill"): the vendor-verified national ID number, AES-256-GCM
-- ciphertext (same regime as profiles.id_number), so the app can prefill/confirm the rider's ID from
-- the ID check. Expand-only: a nullable column, no default, no rewrite; every existing row reads NULL.
ALTER TABLE "riders" ADD COLUMN "verified_id_number" TEXT;
