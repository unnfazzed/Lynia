-- Admin console v2 §5 (docs/plans/2026-10-13-admin-console-v2.md, PR 4): merchant registration → approval.
-- Expand-only and online-safe (CONTRIBUTING "Changing the data model"):
--
--  * MerchantApplicationStatus is a NEW type, so using it in this same migration is fine (the "don't use a
--    value in the transaction that added it" rule is about ALTER TYPE … ADD VALUE on an existing enum).
--  * merchants.application_status is NOT NULL with a constant default: PostgreSQL 11+ stores it in the catalog
--    ("fast default"), no table rewrite. The still-live old revision never reads or writes it, and a merchant
--    it creates during the rollout lands as `applied` — what a sign-up is.
--  * The backfill keeps every live business live: pilot_enabled = true → `live`; everything else stays the
--    default `applied`. Pharmacies that are already live stay live (grandfathered; the console shows a warning
--    row for a missing licence instead). The merchants table is small (pilot) and the UPDATE takes row locks.
--  * application_status_at / application_reason_code are nullable, no default (catalog-only).
--  * merchant_documents is a new, empty table; its unique index is built here (exempt: brand-new table).

CREATE TYPE "MerchantApplicationStatus" AS ENUM ('applied', 'reviewing', 'approved', 'live', 'rejected', 'suspended');

CREATE TYPE "MerchantDocumentKind" AS ENUM ('pharmacy_licence');

ALTER TABLE "merchants" ADD COLUMN "application_status" "MerchantApplicationStatus" NOT NULL DEFAULT 'applied';
ALTER TABLE "merchants" ADD COLUMN "application_status_at" TIMESTAMP(3);
ALTER TABLE "merchants" ADD COLUMN "application_reason_code" TEXT;

UPDATE "merchants" SET "application_status" = 'live' WHERE "pilot_enabled" = true;

CREATE TABLE "merchant_documents" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "kind" "MerchantDocumentKind" NOT NULL,
    "reference" TEXT,
    "licence_number" TEXT,
    "pharmacist_name" TEXT,
    "recorded_by" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchant_documents_merchant_id_kind_key" ON "merchant_documents"("merchant_id", "kind");

ALTER TABLE "merchant_documents" ADD CONSTRAINT "merchant_documents_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
