/**
 * PII ERASURE MANIFEST (Class-C guard).
 *
 * The recurring erasure bug in this repo (DS-01 SosEvent GPS, DS15-03 GCS objects, DS15-07 Order.note,
 * DOC-16-01 top_ups.phone, and the geog gap fixed alongside this file) is always the same shape:
 * `eraseAccount` scrubs SOME representations of a personal-data field and misses a sibling one, because
 * "what counts as PII and how erasure must handle it" lived only in the imperative body of eraseAccount.
 *
 * This manifest makes that knowledge DECLARATIVE and single-sourced. Every column/store that holds
 * personal data for an account is listed here with the disposition erasure applies to it. The companion
 * test (`pii-manifest.spec.ts`) enforces it in BOTH directions:
 *   1. Every PII-looking column in `schema.prisma` (matched by name pattern) must appear here — so a NEW
 *      personal-data column added to the schema FAILS the test until someone records how erasure handles
 *      it. That is the write-time guard that ends the "missed a sibling field" class.
 *   2. Every scrub/tombstone/delete/raw-sql entry here must be referenced by `privacy.service.ts` — so
 *      deleting a scrub from eraseAccount without updating the manifest also fails.
 *
 * Disposition legend:
 *  - "null"        — Prisma write sets the column to null/empty in eraseAccount.
 *  - "tombstone"   — replaced with a non-identifying placeholder (a UNIQUE/NOT NULL column, e.g. phone).
 *  - "raw-sql-null"— nulled via raw SQL because it's a Prisma `Unsupported(...)` column (e.g. PostGIS geog).
 *  - "scrub-json"  — a personal-data key inside a JSON column, read-modify-written per row.
 *  - "delete-row"  — the whole row is deleted (standalone PII store).
 *  - "delete-object"— an external storage object (GCS) is deleted, not just the DB reference.
 *  - "keep"        — deliberately retained; `note` MUST justify why it isn't erasable PII.
 */

export type PiiDisposition =
  | "null"
  | "tombstone"
  | "raw-sql-null"
  | "scrub-json"
  | "delete-row"
  | "delete-object"
  | "keep";

export interface PiiEntry {
  /** DB column name (schema `@map`, or the field name when unmapped), or a logical store name. */
  readonly column: string;
  /** Table(s)/store this column lives in — documentation for multi-table columns like `phone`. */
  readonly where: string;
  /**
   * The DB table name(s) this column actually lives in, used for TABLE-QUALIFIED coverage. Coverage is
   * checked per `table.column` pair, not by bare column name — otherwise one entry (e.g. `note` in
   * `orders`) silently "covers" a same-named but distinct PII column in another table (e.g. `reports.note`),
   * the false-positive DS18-02 fixed. A genuinely multi-table column (e.g. `phone` in profiles + top_ups)
   * lists every table here.
   */
  readonly tables: readonly string[];
  readonly disposition: PiiDisposition;
  readonly note: string;
}

/**
 * Keyed by a manifest-local id (usually the DB column name, but qualified — e.g. `sos_lat`, `report_note` —
 * when the same column name recurs in multiple tables). Each entry's `tables` × `column` is what the
 * schema-coverage guard checks, so a same-named column in a DIFFERENT table needs its own entry. Keep this
 * in lockstep with `PrivacyService.eraseAccount` / `purgeExpiredData`.
 */
export const PII_MANIFEST: Readonly<Record<string, PiiEntry>> = {
  // --- Profile (account root) ---
  first_name: { column: "first_name", where: "profiles", tables: ["profiles"], disposition: "tombstone", note: "Set to 'Deleted' on erase." },
  last_name: { column: "last_name", where: "profiles", tables: ["profiles"], disposition: "tombstone", note: "Set to 'User' on erase." },
  email: { column: "email", where: "profiles", tables: ["profiles"], disposition: "null", note: "Nulled on erase." },
  phone: {
    column: "phone",
    where: "profiles (UNIQUE/NOT NULL), top_ups",
    tables: ["profiles", "top_ups"],
    disposition: "tombstone",
    note: "profiles.phone → non-dialable `erased:<id>` tombstone (frees the real number for re-signup); top_ups.phone → nulled (DOC-16-01).",
  },
  id_number: { column: "id_number", where: "profiles", tables: ["profiles"], disposition: "null", note: "Encrypted national-ID ciphertext nulled on erase." },
  id_number_hash: {
    column: "id_number_hash",
    where: "profiles",
    tables: ["profiles"],
    disposition: "keep",
    note: "DS15-02(b): one-way HMAC (never raw PII), the SOLE ban-evasion duplicate-ID signal. Nulling it blinds duplicate detection for anyone who ever erased. Raw ciphertext (id_number) is still scrubbed.",
  },
  photo_url: {
    column: "photo_url",
    where: "profiles, riders",
    tables: ["profiles", "riders"],
    disposition: "null",
    note: "DB reference nulled; the GCS object itself is deleted via the `kyc-object` entry (DS15-03).",
  },

  // --- Rider ---
  bike_reg: { column: "bike_reg", where: "riders", tables: ["riders"], disposition: "null", note: "Emptied on erase (NOT NULL column)." },
  vehicle_info: { column: "vehicle_info", where: "riders", tables: ["riders"], disposition: "null", note: "Nulled on erase." },
  kyc_ref: { column: "kyc_ref", where: "riders", tables: ["riders"], disposition: "null", note: "Nulled on erase." },
  kyc_decline_reason: { column: "kyc_decline_reason", where: "riders", tables: ["riders"], disposition: "null", note: "Nulled on erase." },
  suspend_reason: { column: "suspend_reason", where: "riders", tables: ["riders"], disposition: "null", note: "Nulled on erase." },
  current_lat: { column: "current_lat", where: "riders", tables: ["riders"], disposition: "null", note: "Readable last-position latitude nulled on erase." },
  current_lng: { column: "current_lng", where: "riders", tables: ["riders"], disposition: "null", note: "Readable last-position longitude nulled on erase." },
  geog: {
    column: "geog",
    where: "riders",
    tables: ["riders"],
    disposition: "raw-sql-null",
    note: "PostGIS point of the rider's last position (the nearby-index source). Unsupported() column → nulled via raw SQL in the erase tx; current_lat/lng alone left this residual location PII behind.",
  },
  position_updated_at: {
    column: "position_updated_at",
    where: "riders",
    tables: ["riders"],
    disposition: "raw-sql-null",
    note: "Timestamp of the last position write; nulled via raw SQL alongside geog so no stale 'live position' marker survives erase.",
  },

  // --- Order / event / SOS location + free-text PII ---
  lat: { column: "lat", where: "order_events", tables: ["order_events"], disposition: "null", note: "GPS trail nulled on every order the user was part of (keep the status event)." },
  lng: { column: "lng", where: "order_events", tables: ["order_events"], disposition: "null", note: "GPS trail nulled on every order the user was part of." },
  sos_lat: { column: "lat", where: "sos_events", tables: ["sos_events"], disposition: "null", note: "DS-01: exact SOS location nulled (keep the incident row)." },
  sos_lng: { column: "lng", where: "sos_events", tables: ["sos_events"], disposition: "null", note: "DS-01: exact SOS location nulled." },
  note: { column: "note", where: "orders", tables: ["orders"], disposition: "null", note: "DS15-07: free-text order note (dialable/address PII) nulled on orders the erasing customer placed." },
  merchant_order_item_note: {
    column: "note",
    where: "merchant_order_items",
    tables: ["merchant_order_items"],
    disposition: "null",
    note: "C2: free-text per-dish note (D-35, e.g. 'leg portion, not breast') on a food order the erasing customer placed — same DS15-07 class as orders.note, distinct table-qualified entry per this file's own false-positive lesson (DS18-02).",
  },
  cancel_reason: {
    column: "cancel_reason",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "DS18-02: free-text cancellation reason, authored by whichever party cancelled (customer or rider). Nulled on erasure when the erasing user is EITHER party to the order (customerId OR riderId).",
  },
  comment: {
    column: "comment",
    where: "ratings",
    tables: ["ratings"],
    disposition: "null",
    note: "DS18-02: free-text rating comment authored by the rater (customer or rider). Nulled on the AUTHOR's erasure (byProfileId) — the numeric score itself is retained (aggregate/ledger).",
  },
  description: {
    column: "description",
    where: "issues",
    tables: ["issues"],
    disposition: "null",
    note: "DS18-02: free-text dispute description authored by the issue opener. Emptied (NOT NULL column) on the OPENER's erasure (openedByProfileId); the issue row + resolution stay for the audit trail.",
  },
  report_note: {
    column: "note",
    where: "reports",
    tables: ["reports"],
    disposition: "null",
    note: "DS18-02: free-text report note authored by the reporter. Nulled on the REPORTER's erasure (reporterProfileId). DISTINCT entry from orders.note — table-qualified coverage stops orders.note falsely covering it.",
  },
  item_photo_url: {
    column: "item_photo_url",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "Customer-uploaded parcel photo on their own placed orders (can show address labels/IDs). Reference nulled and the GCS object deleted post-commit, scoped to customerId — surfaced by this manifest guard.",
  },
  pickup_photo_key: {
    column: "pickup_photo_key",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "DS18-01: rider-captured proof-of-pickup photo (their content, GCS key under `pickup/<riderId>/`). Reference nulled + GCS object deleted post-commit on rider erasure, scoped to riderId — same treatment as delivery_proof_key.",
  },
  delivery_proof_key: {
    column: "delivery_proof_key",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "KB-POD-DISPUTE Phase A: rider-captured proof-of-drop photo (their content). Reference nulled + GCS object deleted post-commit on rider erasure, scoped to riderId.",
  },
  delivery_proof_lat: {
    column: "delivery_proof_lat",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "The rider's precise GPS latitude at a disputed drop-off — location PII of the erasing rider; nulled on rider erasure, scoped to riderId (like the OrderEvent GPS scrub).",
  },
  delivery_proof_lng: {
    column: "delivery_proof_lng",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "The rider's precise GPS longitude at a disputed drop-off; nulled on rider erasure, scoped to riderId.",
  },
  delivery_proof_at: {
    column: "delivery_proof_at",
    where: "orders",
    tables: ["orders"],
    disposition: "null",
    note: "Timestamp of the proof-of-drop capture; nulled alongside the GPS/photo on rider erasure so no residual capture record survives.",
  },
  pickup: { column: "pickup", where: "orders", tables: ["orders"], disposition: "scrub-json", note: "Dialable contactPhone inside the waypoint JSON stripped per row on orders the user placed." },
  dropoff: { column: "dropoff", where: "orders", tables: ["orders"], disposition: "scrub-json", note: "Dialable contactPhone inside the waypoint JSON stripped per row on orders the user placed." },

  // --- Standalone PII stores ---
  address_store: { column: "Address", where: "addresses", tables: ["addresses"], disposition: "delete-row", note: "Saved addresses deleted outright on erase." },
  device_token_store: { column: "DeviceToken", where: "device_tokens", tables: ["device_tokens"], disposition: "delete-row", note: "Push tokens deleted (also logs every device out)." },
  session_store: { column: "Session", where: "sessions", tables: ["sessions"], disposition: "delete-row", note: "All sessions deleted on erase." },
  "kyc-object": { column: "kyc-object", where: "GCS (KYC photo/selfie)", tables: ["GCS"], disposition: "delete-object", note: "DS15-03: the referenced storage object itself is deleted, not just the DB pointer." },
} as const;

/**
 * `table.column` pairs whose column NAME matches a PII pattern (see pii-manifest.spec) but which are NOT
 * personal data, so they're deliberately absent from the manifest. Keyed by `table.column` (table-qualified,
 * DS18-02) so a retained column in one table can't accidentally exempt a real-PII column of the same name in
 * another. Every entry needs a reason — the explicit opt-out the schema-scan guard checks against, so "it
 * looked like PII but isn't" is a recorded decision, never a silent omission.
 */
export const NON_PII_COLUMNS: Readonly<Record<string, string>> = {
  // Non-personal geo: order pickup/dropoff *points* are delivery geography, not a person's live location,
  // and are covered as JSON scrubs (pickup/dropoff) for the contactPhone they embed.
  "orders.pickup_geog": "Order pickup geography (generated from the pickup waypoint) — delivery location, not a person; the dialable contactPhone in the JSON is scrubbed via the `pickup` entry.",
  "issues.resolution_note": "Issue.resolutionNote is ops-authored free-text ABOUT a dispute resolution — part of the incident/audit trail (retained like AuditLog rows and the SosEvent row), not personal data the erasing account supplied.",
  // DS18-02: the two ops-authored `note` columns that the old bare-name coverage let orders.note falsely
  // cover. Both are staff-authored records ABOUT an account, not PII the account supplied — retained like
  // the resolution_note / AuditLog / SosEvent incident trail. reports.note (user-authored) is NOT here — it
  // gets a real scrub via the `report_note` manifest entry.
  "audit_logs.note": "AuditLog.note is the admin's ConfirmModal justification for a destructive console action (suspend/ban/refund/…) — append-only compliance trail authored by ops, must outlive its subject; not erasable PII.",
  "commission_ledger.note": "CommissionLedger.note is an ops/system annotation on a wallet-ledger row (manual credit/adjustment rationale) — part of the immutable financial ledger, staff-authored, not personal data the rider supplied.",
  // Restaurants vertical (C1): shop-front and menu content is business/public-listing data ABOUT the
  // shop or a dish, not personal data about the merchant owner as a person — the owner's actual PII
  // (name, phone) lives on their Profile row and already goes through the normal erasure path.
  // Mirrors the audit_logs.note/resolution_note reasoning: content authored FOR a public listing,
  // not personal data supplied to describe the account holder.
  "merchants.description": "Merchant.description is the shop's own one-line blurb on its public storefront (D-30) — business-listing copy, not personal data about the owner.",
  "merchants.cover_photo_url": "Merchant.coverPhotoUrl is the shop's public cover banner (D-30) — a storefront photo of the business, not of or about a person.",
  "merchant_dishes.description": "MerchantDish.description is the menu-item description on the public menu — business content, not personal data.",
  "merchant_dishes.photo_url": "MerchantDish.photoUrl is the dish's own menu photo (D-31/D-32) — a photo of food, not of or about a person.",
} as const;
