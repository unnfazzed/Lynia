# Review — GCP provisioning IaC (engineering / cloud)

> Engineering + cloud-architecture review of the Terraform that provisions Track F
> (`infra/terraform/`), against `CONCEPT.md` §10, `ENG-REVIEW.md` (ET8/ET9 D7 seam),
> and the deploy contract in `.github/workflows/release.yml`.
> Branch: `claude/project-next-steps-y3ce3g`. Date: 2026-06-29.
>
> **Method note (honest):** the gstack `/plan-eng-review` skill could not be run in
> this session — the container's egress policy blocks cloning `garrytan/gstack`
> (GitHub access is scoped to `unnfazzed/lynia`), and `terraform`/`tofu` are not
> installed, so `terraform validate` was not executed here. This is a structured
> staff-engineer review applying the same gates; **run `terraform validate` +
> `terraform plan` locally, and a gstack `/review` over the diff, before apply.**

## Scope

Greenfield IaC: VPC + private services access + Serverless VPC connector, Cloud SQL
(Postgres 16/PostGIS), Memorystore Redis, Cloud Storage, Artifact Registry, Secret
Manager, and runtime/deployer service accounts. Plus the matching `release.yml` edits.

## Verdict: **LAND WITH FIXES** (fixes applied in this same change)

The review surfaced three P1 correctness gaps between a naive provisioning runbook and
a Cloud Run service that actually boots. All three are fixed in this change, not deferred.

### Confirmed correct
- **D7 portability preserved (ET9).** Secrets are injected as env via `--set-secrets`
  (no managed-identity), DB auth is a plain connection string, and storage abstracts URL
  generation — the Azure adapter remains a drop-in. The IaC adds no GCP-only lock-in
  beyond the deliberately-chosen managed services.
- **PostGIS path.** No Postgres provider / manual `CREATE EXTENSION` — migration
  `0001_init` runs `CREATE EXTENSION IF NOT EXISTS postgis`, and the app user has
  `cloudsqlsuperuser`, so it succeeds on first `migrate deploy`. Verified against the
  migration source.
- **Least privilege on the runtime SA.** Bucket Object Admin is bucket-scoped (not
  project storage); secret access is per-secret (not project-wide); Cloud SQL Client only.

### Findings

| Sev | Finding | Resolution |
|-----|---------|------------|
| **P1** | **Cloud Run could not reach Redis.** Memorystore is private-only and serverless Cloud Run has no VPC route by default. The original `release.yml` set no VPC connector, so every BullMQ job / Socket.IO broadcast / OTP-counter op would fail at runtime — an outage that only shows up post-deploy. | ✅ **Fixed** — added `google_vpc_access_connector.lynia-connector`; `release.yml` now passes `--vpc-connector` + `--vpc-egress private-ranges-only`, wired to a new `VPC_CONNECTOR` repo variable (emitted as a TF output). |
| **P1** | **Service ran as the default compute SA.** `gcloud run deploy` set no `--service-account`, so the service would run as the over-privileged default compute SA instead of a scoped identity — and the keyless V4 signing grant would be on the wrong principal. | ✅ **Fixed** — dedicated `lynia-run` runtime SA; `release.yml` passes `--service-account`, wired to a new `CLOUD_RUN_SERVICE_ACCOUNT` repo variable. Deployer gets `actAs` on it. |
| **P1** | **Keyless V4 signed URLs need self-`signBlob`.** `gcs.storage.ts` signs via ADC (no exported key); that requires the runtime SA to hold `serviceAccountTokenCreator` **on itself**, or every signed-URL mint 500s. | ✅ **Fixed** — `google_service_account_iam_member.runtime_sign_self`. Also set `GCP_STORAGE_PROJECT_ID` in the deploy env (the adapter reads it). |
| **P2** | **Cloud SQL public IP is enabled.** Needed so the GitHub-hosted runner's Auth Proxy can run migrations (a private-only instance is unreachable from the runner). Public IP widens surface. | ◐ **Accepted with guardrails + follow-up** — `ssl_mode = ENCRYPTED_ONLY`, **no** `authorized_networks` (only the IAM-authed Auth Proxy connects), private IP also provisioned. Follow-up logged: move migrations to a VPC-internal runner / Cloud Run Job, then set `ipv4_enabled = false`. |
| **P2** | **Deployer SA JSON key lives in TF state.** `google_service_account_key` exposes a long-lived credential. | ◐ **Accepted with follow-up** — gated behind `emit_deployer_sa_key` (so it can be turned off), README mandates private remote state, and WIF is the documented next step (the workflow already requests `id-token: write`). Set the flag false once WIF lands. |
| **NIT** | Bucket CORS defaults to `origin = ["*"]`. | **Deferred** — fine for the pilot (signed URLs are the actual gate; CORS only affects browser uploaders). `bucket_cors_origins` is a variable; tighten to the admin origin before launch. Logged. |
| **NIT** | Private-services peering range could overlap the connector `/28`. | ✅ **Fixed** — peering range pinned to `10.10.0.0/16`, connector on `10.8.0.0/28`; provably disjoint. |

## Cost (pilot, rough, africa-south1)

`db-custom-1-3840` Cloud SQL (~$50/mo) + Memorystore BASIC 1 GB (~$35/mo) + VPC
connector min-2 instances (~$10/mo) dominate; Cloud Run / Storage / AR are
usage-priced and ~$0 at pilot traffic. **~$95–110/mo** before Google for Startups
credits, which should cover it. Downsize `db_tier` to `db-g1-small` to stretch further.

## Residual risks / explicitly out of scope
- **Live `terraform validate` + `plan` not run here** (no binary, restricted egress). Run locally first.
- **First `gcloud run deploy` creates the service** — the IaC creates its dependencies
  (SA, connector, secrets, SQL) but not the service. Order: `terraform apply` → arm → push.
- **No HA** (Redis BASIC, Cloud SQL ZONAL) — intentional for pilot; logged as a pre-launch follow-up.

## Verdict line
**LAND WITH FIXES applied.** The three P1s that would have produced a green CI deploy
of a non-functional service (no Redis, wrong identity, broken signed URLs) are closed in
this change. Remaining items are hardening follow-ups with explicit triggers, consistent
with how prior stages booked deferred work.
