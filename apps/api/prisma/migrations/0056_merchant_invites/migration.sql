-- Merchant web upgrade L4 (docs/plans/2026-09-29-merchant-web-upgrade-plan.md §7, design doc "L4 — Team"):
-- pending invites to join a business as Staff. The owner invites a name and a phone; the person sees the
-- invite when they sign in with that number and chooses Join or Not me. An invite never reserves the number:
-- several businesses may invite the same phone and the first Join wins (merchant_members.profile_id stays
-- unique). Invites expire after 14 days.
-- A new table: none of CONTRIBUTING's online-safety rules for existing tables apply. `invited_by_profile_id`
-- is a plain id, not a foreign key, so a team change or an erased profile never takes an invite with it.

CREATE TABLE "merchant_invites" (
  "id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "invited_by_profile_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchant_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_invites_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One pending invite per business and number (a re-invite refreshes it).
CREATE UNIQUE INDEX "merchant_invites_merchant_id_phone_key" ON "merchant_invites" ("merchant_id", "phone");
-- What's waiting for a number when its owner signs in.
CREATE INDEX "merchant_invites_phone_idx" ON "merchant_invites" ("phone");
