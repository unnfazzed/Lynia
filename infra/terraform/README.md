# Lynia — GCP provisioning (Terraform)

Infrastructure-as-Code for **Track F** of the Ship stage (`docs/NEXT-STAGE.md`). It
provisions the target architecture from `CONCEPT.md` §10 — **Cloud Run + Cloud SQL
(PostGIS) + Memorystore (Redis) + Cloud Storage + Secret Manager** in
**`africa-south1` (Johannesburg)** — and emits exactly the values needed to arm
`.github/workflows/release.yml` (the `/ship` step).

This replaces the manual click-runbook with something reviewable, version-controlled,
and re-runnable. It went through an engineering/cloud review pass —
`docs/REVIEW-GCP-PROVISIONING.md`.

## What it creates

| Resource | Name | Notes |
|---|---|---|
| VPC + private services peering | `lynia-vpc` | custom-mode; `/16` peering range for Cloud SQL private IP |
| Serverless VPC Access connector | `lynia-connector` | **so Cloud Run can reach Redis** (serverless has no VPC route otherwise) |
| Cloud SQL Postgres 16 | `lynia-pg` | private IP + public IP (for the CI Auth Proxy); PostGIS enabled by migration `0001_init` |
| Memorystore Redis | `lynia-redis` | private, AUTH on |
| Cloud Storage bucket | `lynia-media` | uniform access, public access **enforced-off**, CORS for signed-URL PUT/GET |
| Artifact Registry (Docker) | `lynia` | the API image repo |
| Runtime SA | `lynia-run@…` | Cloud SQL Client, bucket Object Admin, **self `signBlob`** for keyless V4 signed URLs, per-secret accessor |
| Deployer SA | `lynia-deployer@…` | Run Admin, AR Writer, Cloud SQL Client, actAs runtime SA; optional JSON key |
| Secrets | `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_SECRET` | generated + populated |

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
`CLOUD_RUN_SERVICE_ACCOUNT`; set repo **Secrets** `GCP_SA_KEY`
(`terraform output -raw deployer_sa_key | base64 -d`) and `MIGRATE_DATABASE_URL`
(`terraform output -raw MIGRATE_DATABASE_URL`). Push to `main` → first Cloud Run deploy.

## Hardening follow-ups (deliberately deferred)

- **Workload Identity Federation** instead of the deployer JSON key. The workflow already
  requests `id-token: write` and has the WIF lines commented in. Once wired, set
  `emit_deployer_sa_key = false` so no long-lived key exists in state.
- **Drop Cloud SQL public IP.** It exists only so the GitHub-hosted runner's Auth Proxy
  can migrate. Move migrations to a VPC-internal runner (or a Cloud Run Job) and set
  `ipv4_enabled = false`.
- **Redis STANDARD_HA + Cloud SQL REGIONAL** before launch (pilot uses BASIC/ZONAL).
- **Tighten `bucket_cors_origins`** from `*` to the real admin origin.
