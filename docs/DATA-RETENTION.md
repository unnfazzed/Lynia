# Data retention & deletion policy (LR8)

> Lynia's PII retention schedule and the erasure mechanism, under Zimbabwe's **Cyber and Data
> Protection Act, 2021** (CDPA — mirrors GDPR): personal data must not be kept longer than necessary
> for the purpose it was collected (data minimisation), and a data subject has a **right to erasure**.
> Companion: `docs/SECURITY.md` (data classification). The published privacy notice is generated from
> this policy and the PII manifest (`apps/api/src/legal/legal.content.ts`).

## Principles

1. **Keep the minimum, for the minimum time.** Each PII category has a retention window and a trigger
   for removal.
2. **Erase means anonymise where a hard delete would break the ledger.** A `profiles` row is referenced
   by orders, ratings, the commission ledger and the audit log. So erasure **scrubs the PII in place**
   and keeps the anonymised row and its `id`, so the order and audit history stay intact.
3. **Location data is sensitive.** Precise GPS has no operational value after a delivery closes, so it
   is scrubbed on a short window even though the order row stays.
4. **The schedule is enforced by a manifest.** `apps/api/src/privacy/pii-manifest.ts` lists every
   PII-looking column (table-qualified) with its erasure disposition. Its companion test fails if a new
   personal-data column appears in `schema.prisma` without an entry, or if `PrivacyService.eraseAccount`
   stops handling a listed one.

## Retention schedule

| PII category | Where | Retention | On expiry / erasure |
|---|---|---|---|
| **National ID** (encrypted) | `profiles.id_number`; rider `verified_id_number` | life of the account | ciphertext nulled on erasure; the one-way hashes (`id_number_hash`, `verified_id_hash`) are kept as the duplicate-ID signal |
| **Name / phone / email** | `profiles` | life of the account | anonymised on erasure (name → "Deleted User", email → null, phone → non-dialable `erased:<id>` tombstone) |
| **GPS trail** | `order_events.lat/lng` | **`GPS_RETENTION_DAYS` = 90** after the event | coords nulled; the status event row is kept |
| **SOS location** | `sos_events.lat/lng` | 90 days (same clock) | coords nulled; the incident row is kept |
| **Rider live position** | `riders.current_lat/lng`, `riders.geog`, `position_updated_at` | until offline / erasure | nulled on erasure (`geog` via raw SQL) |
| **Order contact phone** | `contactPhone` inside `orders.pickup` / `orders.dropoff` JSON | life of the account | stripped per row on erasure, for orders the user placed |
| **Order free text** | `orders.note`, `orders.cancel_reason` | life of the account | nulled on erasure (`note` for the customer; `cancel_reason` for either party) |
| **Merchant order item notes** | `merchant_order_items.note` (per-dish note on a restaurant/shop/pharmacy order) | life of the account | nulled on erasure, for orders the customer placed |
| **Mobile-money reference** | `orders.merchant_payment_reference` | life of the account | nulled on erasure |
| **Prescriptions** (health data) | `order_prescriptions` (`photo_keys`, `patient_name`, `decline_note`); images under `rx/<customerId>/` | held with the order as a dispute record | the **row is deleted** and every page image deleted on the customer's erasure. No time-based purge exists today. |
| **Order photos and proof** | `orders.item_photo_url`, `pickup_photo_key`/`_at`, `delivery_proof_{key,lat,lng,at,reason,handed_to}` | life of the order | references nulled and the storage objects deleted on erasure (item photo for the customer; pickup/proof for the rider; `handed_to` for both) |
| **Rider KYC fields** | `riders` (`bike_reg`, `photo_url`, `kyc_ref`, `kyc_decline_reason`, `kyc_session_*`, `kyc_id_expires_on`, `kyc_vendor_status*`, `suspend_reason`, …) | life of the account | nulled on erasure; the row is kept |
| **KYC media in our storage** (rider photo/selfie) | Blob container `lynia-media`, keys `kyc/<userId>/…` | life of the account | deleted on erasure. **No time-based lifecycle rule exists** (see below). |
| **KYC media at the vendor** (ID images, selfie, decision) | Didit | Didit's own retention | the rider's **current** session is deleted at Didit on erasure (best-effort; a failure is logged for manual deletion). Older replaced sessions are not tracked. |
| **Saved addresses** | `addresses` | life of the account | deleted on erasure |
| **Device tokens** | `device_tokens` | until sign-out | deleted on sign-out and on erasure |
| **Sessions** | `sessions` | until expiry (`REFRESH_TTL_SECONDS`, rolling) | hard-deleted **`SESSION_RETENTION_DAYS` = 30** after they lapse or are revoked; all deleted on erasure |
| **Merchant team and riders** | `merchant_members.display_name`, `merchant_invites` (phone, name), `merchant_preferred_riders.phone` | while the business keeps them | rows deleted on the person's erasure; unanswered invites are purged by the sweep after 14 days |
| **Commission wallet** | `commission_accounts`, `commission_ledger`, `top_ups` | retained (financial record) | never deleted; `top_ups.phone` is nulled on erasure |
| **Ratings, issues, reports** | `ratings.comment`, `issues.description`, `reports.note` | life of the account | the author's free text is scrubbed on their erasure; scores and rows are kept |
| **Orders, audit log** | `orders`, `audit_logs` | retained (financial / dispute / compliance record) | never deleted; anonymised by reference through the profile scrub |

The manifest is the authority on every column; this table groups it. If they disagree, the manifest wins
and this table is stale.

## Erasure (right to be forgotten)

`DELETE /auth/me` (self-service) and the admin path call `PrivacyService.eraseAccount(profileId)`
(`apps/api/src/privacy/privacy.service.ts`). In one transaction it:

- **Refuses while a delivery is live** — a customer with an active order or a rider mid-ride must
  finish or cancel first.
- **Anonymises the profile** and nulls the national-ID ciphertext. The one-way ID hashes stay; erased
  tombstones are excluded from the one-ID-one-account block, so a returning user is never locked out of
  their own ID.
- **Scrubs rider PII** (bike reg, photo, KYC refs and session, last position). The row is kept.
- **Deletes** saved addresses, device tokens, sessions, the person's merchant-team and invite rows, and
  the prescription rows on their own orders.
- **Nulls** the GPS trail, SOS coordinates, embedded contact phones, order notes, per-dish notes,
  mobile-money references, and the person's own free text (rating comments, issue descriptions, report
  notes, cancel reasons).

After commit, best-effort (a failure is logged, never fails the erasure):

- **Deletes storage objects** — KYC/profile photo, item photo, pickup and proof photos, prescription
  pages (`AzureBlobStorage.deleteObject`, `apps/api/src/adapters/storage/azure-blob.storage.ts`).
- **Deletes the rider's current Didit session** (`KycVendor.deleteSession`).
- **Evicts an erased rider from live supply** (Redis geo index and the WebSocket board room).

It is **idempotent**: an already-erased profile is a no-op.

## Retention sweep

`POST /admin/retention/purge` (`apps/api/src/privacy/privacy.controller.ts`) is guarded by
`AdminOrSchedulerGuard`. On Azure it is called daily at 01:00 UTC by the Container Apps job
`caj-lynia-retention` (`infra/azure/jobs.tf`), which authenticates with an Entra managed-identity token
(`SCHEDULER_AUTH=azure`). It runs `PrivacyService.purgeExpiredData()`:

- **GPS scrub** — `order_events` and `sos_events` older than `GPS_RETENTION_DAYS` lose their coords.
- **Session purge** — sessions lapsed or revoked more than `SESSION_RETENTION_DAYS` ago are deleted.
  The revoked arm is what bounds the table: each refresh rotates a row out but leaves its original
  expiry.
- **Invite purge** — merchant invites unanswered after their 14 days are deleted.

Then, in its own try/catch, the **orphan upload sweep** (`StorageSweeper.sweepOrphans`) deletes
uploads older than 24 h that no row references.

## Storage on Azure: what is and isn't enforced

The media container is `lynia-media` on a StorageV2 account (`infra/azure/data.tf`). Facts from the
Terraform:

- **No lifecycle management policy exists** in `infra/azure`. Nothing deletes KYC media, prescription
  images or any other blob by age. The only deletions are erasure and the orphan sweep.
- **Blob versioning is on**, with 14-day soft delete for blobs and containers. With versioning, deleting
  a blob keeps its previous version until something deletes that version. `deleteObject` calls
  `deleteIfExists()` on the current blob only. So, unless a policy is added, **an "erased" image can
  survive as a previous version**. This is a gap against the right to erasure.
- The legal notice says biker ID and face images are deleted automatically after the KYC retention
  period once an account is inactive or rejected (`legal.content.ts`). **Nothing on Azure does that
  today.** (The old GCP `kyc_retention_days` rule in `infra/terraform/` is not deployed.)

## Owner steps

1. **Ratify the windows.** The 90-day GPS and 30-day session defaults are proposals. Confirm them with
   legal advice and set `GPS_RETENTION_DAYS` / `SESSION_RETENTION_DAYS` if different. Decide a
   retention period for prescriptions and for KYC media.
2. **Add a Blob lifecycle policy** in `infra/azure/data.tf` that (a) deletes previous versions after a
   short window, so erasure actually removes images, and (b) deletes `kyc/` objects by age, if the
   legal notice's automatic KYC deletion is to stay true. Until then, change the notice or accept the gap.
3. **Keep the privacy notice in step** with this doc — it is generated from `legal.content.ts`, which
   cites this file.
