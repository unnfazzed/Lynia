-- Manual KYC (owner 2026-11-04, ledger D-122): the biker's document photos (storage keys), the typed
-- driving licence and its expiry. Expand-only and online-safe: nullable columns, no default, no backfill.
ALTER TABLE "riders" ADD COLUMN "kyc_id_front_key" TEXT;
ALTER TABLE "riders" ADD COLUMN "kyc_licence_key" TEXT;
ALTER TABLE "riders" ADD COLUMN "kyc_selfie_id_key" TEXT;
ALTER TABLE "riders" ADD COLUMN "kyc_docs_alerted_at" TIMESTAMP(3);
ALTER TABLE "riders" ADD COLUMN "licence_number" TEXT;
ALTER TABLE "riders" ADD COLUMN "licence_expires_on" DATE;
ALTER TABLE "riders" ADD COLUMN "licence_reminded_at" TIMESTAMP(3);
