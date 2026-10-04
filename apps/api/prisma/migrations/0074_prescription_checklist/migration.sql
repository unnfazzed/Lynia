-- Merchant v2 P1 (ledger D-77): the pharmacist's three ticks (name matches the patient, signed and
-- stamped, dated in the last 6 months), stored with the check for the audit trail. Expand-only: one
-- nullable column, no default, no rewrite; existing rows stay null.
ALTER TABLE "order_prescriptions" ADD COLUMN "checklist" JSONB;
