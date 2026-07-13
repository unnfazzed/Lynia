# Lynia — GCP provisioning (Terraform)

Infrastructure-as-Code for the **Ship stage** GCP provisioning (status: `docs/PILOT-READINESS.md`).
It provisions the target architecture from `CONCEPT.md` §10 — **Cloud Run + Cloud SQL
(PostGIS) + Memorystore (Redis) + Cloud Storage + Secret Manager** in
**`africa-south1` (Johannesburg)** — and emits exactly the values needed to arm
`.github/workflows/release.yml` (the `/ship` step).

This replaces the manual click-runbook with something reviewable, version-controlled,
and re-runnable. It went through an engineering/cloud review pass —
`docs/ENG-REVIEW.md` §3b (Ship), incl. the post-apply addendum.

## What it creates

| Resource | Name | Notes |
|---|---|---|
| VPC + private services peering | `lynia-vpc` | custom-mode; `/16` peering range for Cloud SQL private IP |
| Serverless VPC Access connector | `lynia-connector` | **so Cloud Run can reach Redis** (serverless has no VPC route otherwise) |
| Cloud SQL Postgres 16 | `lynia-pg` | private IP + public IP (for the CI Auth Proxy); PostGIS enabled by migration `0001_init` |
| Memorystore Redis | `lynia-redis` | private, AUTH on |
| Cloud Storage bucket | `lynia-media` | uniform access, public access **enforced-off**, CORS deny-all by default (`bucket_cors_origins = []` — set the real admin origin to allow browser PUT/GET; never `["*"]`) |
| Artifact Registry (Docker) | `lynia` | the API image repo |
| Runtime SA | `lynia-run@…` | Cloud SQL Client, bucket Object Admin, **self `signBlob`** for keyless V4 signed URLs, per-secret accessor |
| Deployer SA | `lynia-deployer@…` | Run Admin, AR Writer, Cloud SQL Client, actAs runtime SA |
| Workload Identity pool/provider | `github-pool` / `github-provider` | **keyless CI auth**; OIDC scoped to `unnfazzed/Lynia` (no SA key) |
| External HTTPS load balancer | `lynia-api-*` | global ALB + managed cert fronting Cloud Run (`api_domain`); stable HTTPS for device builds |
| Secrets | `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET` | generated + populated |
| Cloud Scheduler jobs | `lynia-retention-purge` (+ `lynia-settlement-autopause`, gated) | daily crons in `europe-west1` (Scheduler doesn't exist in africa-south1); OIDC as the runtime SA, audience pinned to the route URL (`scheduler.tf`) |

> **Live state ≠ committed defaults.** The applied `terraform.tfvars` is gitignored, so
> flag defaults in `variables.tf` (e.g. `staging_enabled = false`) do NOT describe the
> live project — staging is applied and armed in `lynia-500911` despite the `false`
> default. To audit what actually exists, run the read-only
> `scripts/gcp-provisioning-verify.sh`, and see the latest
> `docs/GCP-PENDING-REVIEW-*.md` for the current gap list.

## The one thing Terraform can't do: billing

Creating the project and **linking a billing account** is the founder-gated,
non-codeable step (Track F step 1 — and the one Zimbabwe-eligibility risk to retire
early). Two ways in:

- **Recommended:** founder creates the project + links billing in the console, then:
  `project_id = "<that-project>"`, `create_project = false` (default).
- **Org-owned:** set `create_project = true` + `org_id`/`folder_id` + `billing_account`
  and let Terraform create it (needs org-level permissions).

## Prerequisites

- `terraform >= 1.5`, `gcloud` authenticated as a principal with the roles to create
  the above (Owner on the project, or the granular equivalent).
- A billing-linked project id (see above).
- Recommended: a GCS bucket for remote state, then uncomment the `backend "gcs"` block
  in `versions.tf`. **State holds the generated DB password + JWT secret + the deployer
  key — keep it in a private, access-controlled bucket, never in git.**

## Run it

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set project_id
terraform init
terraform plan      # review — note the Cloud SQL + connector creation (slow: ~10-15 min)
terraform apply
```

## Arm the release workflow

`terraform output arming_guide` prints the full checklist. In short — set repo
**Variables** `GCP_DEPLOY_ENABLED=true`, `GCP_PROJECT_ID`, `GCP_REGION`,
`GCP_ARTIFACT_REPO`, `CLOUD_RUN_SERVICE`, `CLOUD_SQL_INSTANCE`, `VPC_CONNECTOR`,
`CLOUD_RUN_SERVICE_ACCOUNT`, plus the **keyless** auth pair
`GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT`; set the one repo
**Secret** `MIGRATE_DATABASE_URL` (`terraform output -raw MIGRATE_DATABASE_URL`).
Push to `main` → first Cloud Run deploy.

> **CI auth is keyless (Workload Identity Federation) — there is no `GCP_SA_KEY`.**
> The org enforces `constraints/iam.disableServiceAccountKeyCreation`, so `wif.tf`
> provisions an OIDC pool/provider scoped to this repo and `release.yml` authenticates
> via `workload_identity_provider` + `service_account`. `emit_deployer_sa_key` stays
> `false` (default); no long-lived key ever exists.

## Hardening follow-ups (deliberately deferred)

Every deferral is coded behind a flag; the sequenced flip plan (order, blast radius,
rollback) is `docs/INFRA-HARDENING-ROLLOUT.md`. Current flags and defaults:

- **Drop Cloud SQL public IP** — `db_public_ip_enabled` (default `true`). It exists only
  so the GitHub-hosted runner's Auth Proxy can migrate. First set the `DB_PRIVATE_ONLY=true`
  repo Variable (switches release.yml to the in-VPC `lynia-migrate` Cloud Run Job), then
  flip the flag.
- **Redis STANDARD_HA + TLS** — `redis_tier` (default `BASIC`), `redis_tls_enabled`
  (default `false`). Both recreate/disrupt the instance — do in a window.
- **Cloud SQL REGIONAL** — `availability_type` is hardcoded `ZONAL` in `sql.tf`; edit
  before launch.
- **Cloud Armor OWASP enforcement** — `armor_waf_preview` (default `true` = log-only;
  the rate-limit rule is always enforced). Flip after reviewing preview logs.
- **CMEK on the media bucket** — `kyc_cmek_enabled` (default `false`); before real KYC
  data lands.
- **KYC-media retention lifecycle** — `kyc_retention_days` (default `0` = off); legal
  decision.
- **`bucket_cors_origins`** — default `[]` (deny-all). Set the real admin origin when
  browser uploads need it; never re-widen to `["*"]`.
