# Inputs for the Lynia GCP provisioning module.
# Defaults match the deploy contract already baked into .github/workflows/release.yml,
# apps/api/.env.example, and CONCEPT §10 — change them only if you also change those.

variable "project_id" {
  description = "GCP project id to provision into. Must already have billing linked (Track F step 1 — the founder-gated, non-codeable step) unless create_project = true. Defaults to the pilot project; override in terraform.tfvars for any other."
  type        = string
  default     = "lynia-500911"
}

variable "create_project" {
  description = "Whether Terraform should create the project itself. Requires org_id (or folder_id) and billing_account, plus org-level permissions. Default false: the founder creates + links billing, Terraform provisions everything inside it."
  type        = bool
  default     = false
}

variable "org_id" {
  description = "Organization id, used only when create_project = true (mutually exclusive with folder_id)."
  type        = string
  default     = null
}

variable "folder_id" {
  description = "Folder id, used only when create_project = true (mutually exclusive with org_id)."
  type        = string
  default     = null
}

variable "billing_account" {
  description = "Billing account id to link, used only when create_project = true."
  type        = string
  default     = null
}

variable "region" {
  description = "Primary region. africa-south1 (Johannesburg) is the lowest-latency GCP region to Harare (CONCEPT §10)."
  type        = string
  default     = "africa-south1"
}

# --- Cloud SQL (PostgreSQL 16 + PostGIS) ---
variable "db_version" {
  type    = string
  default = "POSTGRES_16"
}

variable "db_tier" {
  description = "Cloud SQL machine tier. db-custom-1-3840 = 1 vCPU / 3.75 GB — a sane pilot size. Downsize to db-g1-small to stretch credits; scale up before launch."
  type        = string
  default     = "db-custom-1-3840"
}

variable "db_disk_size_gb" {
  type    = number
  default = 10
}

variable "db_name" {
  description = "Application database name. Must match the DATABASE_URL path the app/migrations expect."
  type        = string
  default     = "lynia"
}

variable "db_user" {
  description = "Application database user. Cloud SQL grants it cloudsqlsuperuser, which is what lets the first Prisma migration run CREATE EXTENSION postgis."
  type        = string
  default     = "lynia"
}

# --- Memorystore (Redis) ---
variable "redis_version" {
  type    = string
  default = "REDIS_7_2"
}

variable "redis_memory_size_gb" {
  type    = number
  default = 1
}

variable "redis_tier" {
  description = "BASIC (no replica) is fine for the pilot; STANDARD_HA before launch."
  type        = string
  default     = "BASIC"
}

# --- Cloud Storage ---
variable "bucket_name" {
  description = "Object-storage bucket. Must equal STORAGE_BUCKET (default lynia-media) in the deploy env."
  type        = string
  default     = "lynia-media"
}

variable "bucket_cors_origins" {
  description = "Browser origins allowed to PUT/GET via V4 signed URLs. Native app uploads do NOT use CORS, so this defaults to [] (deny all cross-origin browser access). Add a specific admin/web-uploader origin only if you do browser-side uploads — never re-widen to [\"*\"]."
  type        = list(string)
  default     = []
}

variable "kyc_cmek_enabled" {
  description = "Encrypt the media bucket (KYC selfies + item photos) with a customer-managed KMS key (CMEK) instead of Google-managed keys, so key custody + rotation is ours. Default false (Google-managed, still encrypted at rest). Enabling creates a KMS keyring/key; applies to NEW objects. See docs/SECURITY.md P3-4."
  type        = bool
  default     = false
}

variable "kyc_retention_days" {
  description = "If > 0, auto-delete media-bucket objects older than this many days (data-minimization / privacy). 0 = disabled (default) — enable deliberately, mindful that KYC evidence may be needed for disputes/compliance. Objects are archived at this age then purged shortly after (bucket is versioned)."
  type        = number
  default     = 0
}

variable "db_public_ip_enabled" {
  description = "Cloud SQL public IP. Default true (needed by the GitHub-runner Auth-Proxy migration path). Set false for a PRIVATE-ONLY instance — then run the release workflow with the DB_PRIVATE_ONLY=true repo variable so migrations execute in-VPC as a Cloud Run job. Coordinated rollout; see docs/SECURITY.md P2-1."
  type        = bool
  default     = true
}

variable "redis_tls_enabled" {
  description = "Enable Memorystore in-transit TLS (transit_encryption_mode=SERVER_AUTHENTICATION) and switch REDIS_URL to rediss://. Default false to match the current deployed instance. Flip to true as a COORDINATED rollout: apply, then verify the app reconnects over TLS (the client honours rediss:// automatically; supply REDIS_CA_CERT if the managed CA isn't trusted). See docs/SECURITY.md P2-1."
  type        = bool
  default     = false
}

# --- Cloud Armor (armor.tf) ---
variable "armor_rate_limit_count" {
  description = "Cloud Armor per-IP request budget per interval before edge throttling (429)."
  type        = number
  default     = 600
}

variable "armor_rate_limit_interval_sec" {
  description = "Cloud Armor rate-limit window, in seconds (paired with armor_rate_limit_count)."
  type        = number
  default     = 60
}

variable "armor_waf_preview" {
  description = "Run the OWASP WAF rulesets in PREVIEW (log-only) instead of enforcing (deny 403). Default true so a launch can observe false positives against real traffic first; set false to enforce."
  type        = bool
  default     = true
}

# --- Artifact Registry / Cloud Run ---
variable "artifact_repo" {
  description = "Artifact Registry Docker repo id. Must match GCP_ARTIFACT_REPO in the release workflow."
  type        = string
  default     = "lynia"
}

variable "cloud_run_service" {
  description = "Cloud Run service name. Must match CLOUD_RUN_SERVICE in the release workflow. (This module creates the supporting resources + identity; the service itself is first created by the release workflow's `gcloud run deploy`.)"
  type        = string
  default     = "lynia-api"
}

# --- Observability ---
variable "alert_notification_channels" {
  description = "Cloud Monitoring notification-channel IDs the SLO alert policies page (e.g. [\"projects/<id>/notificationChannels/123\"]). Empty by default: policies still fire in the console but page no one — create a channel (email/SMS) and supply its id to actually get paged. See docs/OBSERVABILITY.md."
  type        = list(string)
  default     = []
}

# --- Safety / convenience ---
variable "deletion_protection" {
  description = "Guards Cloud SQL against accidental `terraform destroy`. Keep true outside throwaway tests."
  type        = bool
  default     = true
}

variable "emit_deployer_sa_key" {
  description = "Generate a JSON key for the CI deployer SA (legacy auth). Default false: CI uses keyless Workload Identity Federation (wif.tf), and most orgs disable key creation via constraints/iam.disableServiceAccountKeyCreation anyway. Leave false unless you have a specific need and key creation is permitted."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "owner/repo of the GitHub repository allowed to impersonate the deployer SA via Workload Identity Federation. Case-sensitive — must match the OIDC `repository` claim."
  type        = string
  default     = "unnfazzed/Lynia"
}

variable "labels" {
  description = "Labels applied to labellable resources."
  type        = map(string)
  default = {
    app        = "lynia"
    managed_by = "terraform"
  }
}

# --- External HTTPS Load Balancer (lb.tf) ---
variable "api_domain" {
  description = "Fully-qualified domain for the public API endpoint fronted by the global external HTTPS load balancer. A Google-managed certificate is issued for this domain, and the mobile app's device builds point at it (HTTPS for device builds). After apply, create a DNS A record for this domain pointing at the load_balancer_ip output, then wait for the managed cert to go ACTIVE."
  type        = string
  default     = "lyniago.lyniafinance.com"
}

# --- Cloudflare DNS (dns.tf) — off by default ---
variable "cloudflare_dns_enabled" {
  description = "Manage the product's DNS A records in Cloudflare via Terraform (dns.tf): api_domain (always), plus staging_api_domain / admin_domain when their tiers are armed, all pointing at load_balancer_ip. Off by default — zero diff, and existing hand-managed DNS is left untouched until you opt in. When enabling, also set cloudflare_api_token and cloudflare_zone_id."
  type        = bool
  default     = false
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token scoped to Zone:DNS:Edit on the lyniafinance.com zone. Only used when cloudflare_dns_enabled. Read/set via a *.tfvars kept out of VCS (mirrors admin_iap_oauth_client_secret)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare Zone ID for lyniafinance.com (Cloudflare dashboard → the zone → Overview → API section). Required when cloudflare_dns_enabled."
  type        = string
  default     = ""
}

# --- Admin console tier (admin.tf) — all gated off by default ---
variable "admin_enabled" {
  description = "Provision the admin console tier (admin.tf): the lynia-admin serverless NEG + IAP-protected backend + managed cert + runtime SA + ADMIN_API_TOKEN secret, exposed via the existing ALB at admin_domain. Off by default — zero diff until armed. Arming: docs/plans/2026-admin-console-deployment.md Phases 3/5/6."
  type        = bool
  default     = false
}

variable "admin_domain" {
  description = "Hostname for the admin console on the shared load balancer (own managed cert; same LB IP as api_domain — add a second A record)."
  type        = string
  default     = "lyniagoadmin.lyniafinance.com"
}

variable "admin_cloud_run_service" {
  description = "Name of the admin Cloud Run service (created by deploy-admin.yml, referenced by the admin serverless NEG). Must equal the ADMIN_CLOUD_RUN_SERVICE repo variable."
  type        = string
  default     = "lynia-admin"
}

variable "admin_iap_oauth_client_id" {
  description = "IAP OAuth 2.0 client id for the admin backend service. Founder-created (OAuth consent screen + client, docs/SECURITY-OPS.md §A) — Terraform does not create the brand/client. Required when admin_enabled."
  type        = string
  default     = ""
}

variable "admin_iap_oauth_client_secret" {
  description = "IAP OAuth 2.0 client secret paired with admin_iap_oauth_client_id. Required when admin_enabled. Read/set via a *.tfvars kept out of VCS."
  type        = string
  default     = ""
  sensitive   = true
}

variable "admin_iap_members" {
  description = "Operator identities granted roles/iap.httpsResourceAccessor on the admin backend (e.g. [\"user:alice@corp.com\", \"group:ops@corp.com\"]). MFA is enforced at the Workspace level."
  type        = list(string)
  default     = []
}

# --- Staging stack (staging.tf) — all gated off by default ---
variable "staging_enabled" {
  description = "Provision the staging tier (staging.tf): its own Cloud SQL + Redis + secrets + runtime SA + media bucket, exposed via the existing ALB at staging_api_domain. Off by default — zero diff until armed. Arming guide: docs/LAUNCH-EXECUTION-RUNBOOK.md §8e."
  type        = bool
  default     = false
}

variable "staging_api_domain" {
  description = "Hostname for the staging API on the shared load balancer (own managed cert; same LB IP as api_domain — add a second A record)."
  type        = string
  default     = "staging.lyniafinance.com"
}

variable "staging_cloud_run_service" {
  description = "Name of the staging Cloud Run service (created by deploy-staging.yml, referenced by the staging serverless NEG). Must equal the STAGING_CLOUD_RUN_SERVICE repo variable."
  type        = string
  default     = "lynia-api-staging"
}

variable "staging_db_tier" {
  description = "Cloud SQL machine tier for the staging instance. Shared-core by default — staging correctness matters, staging performance headroom does not (bump temporarily for load-envelope runs if the DB itself is the bottleneck under ×5)."
  type        = string
  default     = "db-f1-micro"
}

variable "slo_alerts_enabled" {
  description = "Create the PromQL SLO alert policies (monitoring.tf). MUST stay false until the OTEL collector (LR9) is live: Cloud Monitoring validates the PromQL metric names at policy creation, so applying before the series exist in GMP fails with 'PromQL metric(s) are invalid'. Flip to true as the last step of docs/OBSERVABILITY.md §Production activation."
  type        = bool
  default     = false
}

# --- Cloud Scheduler cron jobs (scheduler.tf) ---
variable "scheduler_jobs_enabled" {
  description = "Create the daily retention-purge Cloud Scheduler job (LR8, docs/LAUNCH-EXECUTION-RUNBOOK.md §2). ON by default: the API side (AdminOrSchedulerGuard + SCHEDULER_SERVICE_ACCOUNT injection) has been live since 2026-07-08 while the job itself was never created, so the purge has never run — the next apply closes that gap. Requires DNS for api_domain to be live (the OIDC audience is pinned to the public URL)."
  type        = bool
  default     = true
}

variable "scheduler_region" {
  description = "Region for Cloud Scheduler jobs. NOT the API region: Cloud Scheduler is not offered in africa-south1 (learned 2026-07-08, runbook §2); the job is a plain daily HTTPS cron so its own region is irrelevant to the API."
  type        = string
  default     = "europe-west1"
}

variable "settlement_autopause_enabled" {
  description = "Also create the daily settlement auto-pause job (LR5). Off until monetization is on — commission is 0% for the pilot, so there are no settlements to pause (docs/PILOT-READINESS.md)."
  type        = bool
  default     = false
}

# --- CI terraform provisioner (provisioner.tf + .github/workflows/terraform-apply.yml) ---
variable "ci_provisioner_enabled" {
  description = "Create the lynia-provisioner SA that lets `terraform apply` run from CI behind the human-reviewed `infra` GitHub Environment, instead of from a founder laptop. Off by default — zero diff until you opt in. Keeps the release deployer SA read-only against infrastructure (iam.tf), so a compromised release pipeline still cannot create or destroy infra. NOTE: this SA can escalate to project owner via projectIamAdmin — read the RESIDUAL PRIVILEGE block in provisioner.tf before arming. Bootstrap: the first creation needs provisioning rights, so do it once out of band (a local apply, or Console clicks)."
  type        = bool
  default     = false
}
