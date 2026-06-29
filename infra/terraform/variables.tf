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
  description = "Origins allowed to PUT/GET via V4 signed URLs (admin web + any browser uploader). Native app uploads do not need CORS; tighten this to real origins before launch."
  type        = list(string)
  default     = ["*"]
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

# --- Safety / convenience ---
variable "deletion_protection" {
  description = "Guards Cloud SQL against accidental `terraform destroy`. Keep true outside throwaway tests."
  type        = bool
  default     = true
}

variable "emit_deployer_sa_key" {
  description = "Generate a JSON key for the CI deployer SA and expose it as the (sensitive) deployer_sa_key output, to paste into the GCP_SA_KEY GitHub secret. The key lands in Terraform state — prefer Workload Identity Federation (see README) and set this false once WIF is wired."
  type        = bool
  default     = true
}

variable "labels" {
  description = "Labels applied to labellable resources."
  type        = map(string)
  default = {
    app       = "lynia"
    managed_by = "terraform"
  }
}
