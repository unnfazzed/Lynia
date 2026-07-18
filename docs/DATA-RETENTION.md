# Data retention & deletion policy (LR8)

> Lynia's PII retention schedule and the erasure mechanism, under Zimbabwe's **Cyber and Data
> Protection Act, 2021** (CDPA — mirrors GDPR): personal data must not be kept longer than necessary
> for the purpose it was collected (data minimisation), and a data subject has a **right to erasure**.
> Companion: `docs/SECURITY.md` (data classification), `docs/LAUNCH-READINESS.md` LR8.

## Principles

1. **Keep the minimum, for the minimum time.** Each PII category has a defined retention window + a
   trigger for removal.
2. **Erase means anonymise where a hard delete would break the ledger.** A `profiles` row is referenced
   by orders, ratings, and the audit log — rows we must keep for financial/dispute/legal reasons. So
   erasure **scrubs the PII in place** (name, phone, national ID, photos, saved addresses) while leaving
   the anonymised row + its `id` so the order/audit history stays referentially intact.
3. **Location data is sensitive.** Precise GPS (the `order_events` lat/lng trail) has no operational
   value after a delivery closes, so it is scrubbed on a short window even though the order row stays.
4. **The retention schedule above is declaratively enforced.** `apps/api/src/privacy/pii-manifest.ts`
   lists every PII-looking column's erasure disposition; its companion test fails if a new personal-data
   column is added to the schema without a manifest entry, or if `PrivacyService.eraseAccount` stops
   handling one that's listed — the write-time guard against the "scrubbed one representation, missed a
   sibling" class of bug (DS-01, DS15-03, DS15-07, DOC-16-01).

## Retention schedule

| PII category | Where | Retention | On expiry / erasure |
|---|---|---|---|
| **National ID** (encrypted) | `profiles.id_number` / `id_number_hash` | life of the account | cleared to `null` on erasure |
| **GPS trail** | `order_events.lat/lng` | **`GPS_RETENTION_DAYS` = 90** after the event | coords set to `null`; the status event row is kept for the timeline |
| **SOS location** | `sos_events.lat/lng` | **`GPS_RETENTION_DAYS` = 90** after the event (same clock as the GPS trail) | coords set to `null`; the SOS event row is kept for the safety/incident ledger |
| **Order contact phone** | `orders.pickup`/`orders.dropoff` embedded JSON `contactPhone` | life of the account | `contactPhone` nulled in place on erasure, for every order the erasing profile placed as customer |
| **Name / phone / email** | `profiles` | life of the account | anonymised on erasure (name → "Deleted User", email → null, phone → non-reusable tombstone) |
| **KYC media** (selfie, ID photo) | Cloud Storage `kyc/{userId}/…` | **legal minimum** (AML/KYC) after the rider goes inactive/rejected | deleted by the bucket lifecycle — the gated `kyc_retention_days` in `infra/terraform/storage.tf` (founder enables) |
| **Saved addresses** | `addresses` | life of the account | deleted on erasure |
| **Device tokens** | `device_tokens` | until sign-out | deleted on sign-out (already) + on erasure |
| **Sessions** (refresh tokens) | `sessions` | until expiry | expired sessions hard-deleted **`SESSION_RETENTION_DAYS` = 30** after they lapse |
| **Rider KYC fields** | `riders` (`bikeReg`, `photoUrl`, `kycRef`, `kycDeclineReason`, `suspendReason`) | life of the account | scrubbed on erasure; the row is kept (ledger) |
| **Orders, ratings, audit log** | `orders`, `ratings`, `audit_logs` | retained (financial/dispute/compliance record) | never deleted; PII references anonymise via the profile scrub, and each table's own free-text field is scrubbed directly on its author's erasure: `ratings.comment` (rater), `orders.cancelReason` (either party) |
| **Commission wallet ledger** | `commission_accounts`, `commission_ledger`, `top_ups` | retained (financial/compliance record, same class as the above row) | never deleted; the embedded `top_ups.phone` (mobile-money number) is nulled on erasure — see `docs/KNOWN_BUGS.md` DOC-16-01 (fixed) |
| **Rider live position** | `riders.geog` / `riders.position_updated_at` | until inactive/erasure | nulled via raw SQL on erasure (PostGIS `Unsupported` column) |
| **Order item photo / delivery proof** | `orders.item_photo_url`, `orders.pickup_photo_key`, `orders.delivery_proof_{key,lat,lng,at}` | life of the order | GCS object deleted + columns nulled on erasure |
| **Issue / report free text** | `issues.description`, `reports.note` | life of the account | scrubbed on the opener's/reporter's own erasure (`description` emptied to `""`, a `NOT NULL` column; `note` nulled) |

## Erasure (right to be forgotten)

`DELETE /auth/me` (self-service, JWT-scoped to the caller) and the admin path invoke
`PrivacyService.eraseAccount(profileId)`, which in one transaction:

- **Refuses while a delivery is live** (`ConflictException`) — a customer with an active order, or a
  rider mid-ride (`ACTIVE_RIDE_STATUSES`), must finish or cancel first, so erasure can't strand a delivery.
- **Anonymises the profile** — `firstName="Deleted"`, `lastName="User"`, `email=null`,
  `idNumber=null`, `idNumberHash=null`, `photoUrl=null`, and `phone` → a unique, non-dialable tombstone
  (`erased:<id>`) so the account can't be logged into or re-identified, and the real number is free for
  a genuine re-signup (which creates a fresh profile).
- **Scrubs rider PII** (bike reg, photo, KYC refs/reasons, last position) — row kept for the ledger.
- **Deletes** saved addresses, device tokens, and sessions (logs every device out).
- **Nulls the GPS trail** on all of the user's orders' `order_events`.
- **Nulls the precise location** on every `SosEvent` this profile raised — the same treatment as the
  GPS trail, since an SOS event carries the most sensitive location data in the system (an emergency
  moment) tied to the (now anonymised) profile.
- **Nulls the embedded `contactPhone`** in the `pickup`/`dropoff` JSON of every order this profile
  placed as customer (read-modify-write per order — the dialable contact PII isn't reachable via a
  bulk column update since it lives inside a JSON blob).
- **Deletes the rider's pickup-photo GCS object** and nulls `orders.pickupPhotoKey`, alongside the
  existing delivery-proof photo purge, for every order this profile rode as rider.
- **Scrubs user-authored free text** on the erasing profile's own rows: `ratings.comment` (as
  rater), `issues.description` (as opener, emptied to `""` — a `NOT NULL` column), `reports.note`
  (as reporter), and `orders.cancelReason` (as either party to the order).
- **Idempotent** — safe to re-run (an already-erased profile is a no-op).

Orders, ratings, and audit rows are **kept** (anonymised by reference) — the delivery/financial record
survives, but nothing in it identifies the person.

## Retention sweep

`POST /admin/retention/purge` (admin-guarded; intended to be driven by **Cloud Scheduler** daily, the
same pattern as the settlement auto-pause — no in-process cron dependency) invokes
`PrivacyService.purgeExpiredData()`:

- **GPS scrub** — `order_events` older than `GPS_RETENTION_DAYS` have their coords nulled.
- **SOS GPS scrub** — `sos_events` older than `GPS_RETENTION_DAYS` (same clock) have their coords
  nulled; the event row is kept.
- **Session purge** — sessions that lapsed more than `SESSION_RETENTION_DAYS` ago are deleted.

Returns the counts. A standalone run is also possible via the same service.

## Founder steps

1. **Ratify the windows** — the 90-day GPS / 30-day session / KYC-media legal-minimum defaults above are
   proposals; confirm against legal advice and set `GPS_RETENTION_DAYS` / `SESSION_RETENTION_DAYS` if
   different.
2. **Enable the KYC-media bucket lifecycle** — flip the gated `kyc_retention_days` in
   `infra/terraform/storage.tf` and `terraform apply` (this is the one category enforced by the bucket,
   not the app).
3. **Schedule the sweep** — a Cloud Scheduler job (OIDC-authed) hitting `POST /admin/retention/purge`
   daily.
4. **Publish a privacy notice** telling users what's collected, the retention windows, and how to request
   erasure (the app's account-deletion action calls `DELETE /auth/me`).
