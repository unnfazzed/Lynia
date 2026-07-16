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
  readonly disposition: PiiDisposition;
  readonly note: string;
}

/**
 * Keyed by DB column name. Multi-table columns (e.g. `phone`) get ONE entry whose `where`/`note` cover
 * every table. Keep this in lockstep with `PrivacyService.eraseAccount` / `purgeExpiredData`.
 */
export const PII_MANIFEST: Readonly<Record<string, PiiEntry>> = {
  // --- Profile (account root) ---
  first_name: { column: "first_name", where: "profiles", disposition: "tombstone", note: "Set to 'Deleted' on erase." },
  last_name: { column: "last_name", where: "profiles", disposition: "tombstone", note: "Set to 'User' on erase." },
  email: { column: "email", where: "profiles", disposition: "null", note: "Nulled on erase." },
  phone: {
    column: "phone",
    where: "profiles (UNIQUE/NOT NULL), top_ups",
    disposition: "tombstone",
    note: "profiles.phone → non-dialable `erased:<id>` tombstone (frees the real number for re-signup); top_ups.phone → nulled (DOC-16-01).",
  },
  id_number: { column: "id_number", where: "profiles", disposition: "null", note: "Encrypted national-ID ciphertext nulled on erase." },
  id_number_hash: {
    column: "id_number_hash",
    where: "profiles",
    disposition: "keep",
    note: "DS15-02(b): one-way HMAC (never raw PII), the SOLE ban-evasion duplicate-ID signal. Nulling it blinds duplicate detection for anyone who ever erased. Raw ciphertext (id_number) is still scrubbed.",
  },
  photo_url: {
    column: "photo_url",
    where: "profiles, riders",
    disposition: "null",
    note: "DB reference nulled; the GCS object itself is deleted via the `kyc-object` entry (DS15-03).",
  },

  // --- Rider ---
  bike_reg: { column: "bike_reg", where: "riders", disposition: "null", note: "Emptied on erase (NOT NULL column)." },
  vehicle_info: { column: "vehicle_info", where: "riders", disposition: "null", note: "Nulled on erase." },
  kyc_ref: { column: "kyc_ref", where: "riders", disposition: "null", note: "Nulled on erase." },
  kyc_decline_reason: { column: "kyc_decline_reason", where: "riders", disposition: "null", note: "Nulled on erase." },
  suspend_reason: { column: "suspend_reason", where: "riders", disposition: "null", note: "Nulled on erase." },
  current_lat: { column: "current_lat", where: "riders", disposition: "null", note: "Readable last-position latitude nulled on erase." },
  current_lng: { column: "current_lng", where: "riders", disposition: "null", note: "Readable last-position longitude nulled on erase." },
  geog: {
    column: "geog",
    where: "riders",
    disposition: "raw-sql-null",
    note: "PostGIS point of the rider's last position (the nearby-index source). Unsupported() column → nulled via raw SQL in the erase tx; current_lat/lng alone left this residual location PII behind.",
  },
  position_updated_at: {
    column: "position_updated_at",
    where: "riders",
    disposition: "raw-sql-null",
    note: "Timestamp of the last position write; nulled via raw SQL alongside geog so no stale 'live position' marker survives erase.",
  },

  // --- Order / event / SOS location + free-text PII ---
  lat: { column: "lat", where: "order_events", disposition: "null", note: "GPS trail nulled on every order the user was part of (keep the status event)." },
  lng: { column: "lng", where: "order_events", disposition: "null", note: "GPS trail nulled on every order the user was part of." },
  sos_lat: { column: "lat", where: "sos_events", disposition: "null", note: "DS-01: exact SOS location nulled (keep the incident row)." },
  sos_lng: { column: "lng", where: "sos_events", disposition: "null", note: "DS-01: exact SOS location nulled." },
  note: { column: "note", where: "orders", disposition: "null", note: "DS15-07: free-text order note (dialable/address PII) nulled on orders the erasing customer placed." },
  item_photo_url: {
    column: "item_photo_url",
    where: "orders",
    disposition: "null",
    note: "Customer-uploaded parcel photo on their own placed orders (can show address labels/IDs). Reference nulled and the GCS object deleted post-commit, scoped to customerId — surfaced by this manifest guard.",
  },
  pickup: { column: "pickup", where: "orders", disposition: "scrub-json", note: "Dialable contactPhone inside the waypoint JSON stripped per row on orders the user placed." },
  dropoff: { column: "dropoff", where: "orders", disposition: "scrub-json", note: "Dialable contactPhone inside the waypoint JSON stripped per row on orders the user placed." },

  // --- Standalone PII stores ---
  address_store: { column: "Address", where: "addresses", disposition: "delete-row", note: "Saved addresses deleted outright on erase." },
  device_token_store: { column: "DeviceToken", where: "device_tokens", disposition: "delete-row", note: "Push tokens deleted (also logs every device out)." },
  session_store: { column: "Session", where: "sessions", disposition: "delete-row", note: "All sessions deleted on erase." },
  "kyc-object": { column: "kyc-object", where: "GCS (KYC photo/selfie)", disposition: "delete-object", note: "DS15-03: the referenced storage object itself is deleted, not just the DB pointer." },
} as const;

/**
 * DB columns whose NAME matches a PII pattern (see pii-manifest.spec) but which are NOT personal data, so
 * they're deliberately absent from the manifest. Every entry needs a reason — this is the explicit
 * opt-out the schema-scan guard checks against, so "it looked like PII but isn't" is a recorded decision,
 * never a silent omission.
 */
export const NON_PII_COLUMNS: Readonly<Record<string, string>> = {
  // Non-personal geo: order pickup/dropoff *points* are delivery geography, not a person's live location,
  // and are covered as JSON scrubs (pickup/dropoff) for the contactPhone they embed.
  pickup_geog: "Order pickup geography (generated from the pickup waypoint) — delivery location, not a person; the dialable contactPhone in the JSON is scrubbed via the `pickup` entry.",
  resolution_note: "Issue.resolutionNote is ops-authored free-text ABOUT a dispute resolution — part of the incident/audit trail (retained like AuditLog rows and the SosEvent row), not personal data the erasing account supplied.",
} as const;
