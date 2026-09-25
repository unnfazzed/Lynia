# Inputs. Every variable has a default so `terraform validate` runs with no tfvars
# (the CI "defaults only" contract), and the workflows only ever pass `environment`
# plus the few owner-specific values below as TF_VAR_* from GitHub Variables.

variable "environment" {
  description = "Which stack this state describes: staging or production. Pick the matching state key at init (staging.tfstate / production.tfstate)."
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be \"staging\" or \"production\"."
  }
}

variable "location" {
  description = "Azure region. South Africa North keeps data residency unchanged from africa-south1 (D2)."
  type        = string
  default     = "southafricanorth"
}

variable "github_repository" {
  description = "owner/repo whose GitHub environments the CI identities trust (E14). Case-sensitive."
  type        = string
  default     = "unnfazzed/Lynia"
}

# --- Bootstrap-owned resources (infra/azure/bootstrap.sh). Terraform only reads these. ---

variable "tfstate_resource_group" {
  description = "Resource group bootstrap.sh created. It holds the state account, the Key Vault and the three CI identities."
  type        = string
  default     = "rg-lynia-tfstate"
}

variable "key_vault_name" {
  description = "Name of the bootstrap-created Key Vault. Empty = derive it exactly as bootstrap.sh does: kv-lynia-<first 6 hex of sha1(subscription id)>."
  type        = string
  default     = ""
}

# --- Hostnames (custom domains + free managed certificates, E11) ---

variable "api_hostname" {
  description = "Public API hostname. Empty = the environment default (production: api.lyniago.com, staging: staging-api.lyniago.com)."
  type        = string
  default     = ""
}

variable "admin_hostname" {
  description = "Admin console hostname. Empty = production: admin.lyniago.com; staging: no custom domain (use the *.azurecontainerapps.io FQDN)."
  type        = string
  default     = ""
}

variable "merchant_hostname" {
  description = "Merchant dashboard hostname. Empty = production: merchant.lyniago.com; staging: no custom domain. It (or the FQDN) is also the Blob CORS origin (D5)."
  type        = string
  default     = ""
}

# --- Sizing (pilot, §2 / E9) ---

variable "api_max_replicas" {
  description = "API replica cap. 5 × DATABASE_CONNECTION_LIMIT 5 = 25 connections under B1ms's ~50 (E9). Raise ONLY together with the Postgres SKU."
  type        = number
  default     = 5

  validation {
    condition     = var.api_max_replicas >= 1 && var.api_max_replicas <= 5
    error_message = "B1ms allows ~50 connections; keep api_max_replicas <= 5 until the Postgres SKU is raised (E9)."
  }
}

variable "api_min_replicas" {
  description = "API floor. Null = 1 in production (the in-process sweeps and BullMQ workers need a live replica, H1) and 0 in staging (on demand, Q6)."
  type        = number
  default     = null
}

variable "api_session_affinity" {
  description = <<-EOT
    Turn on ingress sticky sessions for the API (E4). OFF by default because Azure documents
    session affinity as supported ONLY in single revision mode, and the API runs in multiple
    revision mode for the canary (H18). Setting this true while revision mode is Multiple is
    expected to be rejected (or ignored) by the platform. Owner decision pending; see README.
  EOT
  type        = bool
  default     = false
}

variable "postgres_sku" {
  description = "Flexible Server SKU (D4)."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "Flexible Server storage (32 GiB)."
  type        = number
  default     = 32768
}

variable "redis_sku" {
  description = "Azure Managed Redis SKU (D3). If B0 is not offered in the region, see plan §13 R2."
  type        = string
  default     = "Balanced_B0"
}

variable "data_tier_enabled" {
  description = "false HIBERNATES staging: removes Postgres, Redis (+ its private endpoint) and the two secrets Terraform writes, keeping the apps, domain, certificate and identities, so waking needs no DNS change. Staging only; production must stay true. The cost lever from the 2026-09-24 savings review."
  type        = bool
  default     = true

  validation {
    condition     = var.data_tier_enabled || var.environment == "staging"
    error_message = "data_tier_enabled = false (hibernate) is allowed for staging only."
  }
}

variable "log_daily_quota_gb" {
  description = "Log Analytics daily ingestion cap in GB. Null = 0.2 in production, 0.1 in staging (a pilot logs far less; the cap bounds a runaway-log bill at ~$2/month over the 5 GB free grant)."
  type        = number
  default     = null
}

# --- Alerting and cost ---

variable "alert_emails" {
  description = "Addresses the action group mails for job failures, missed runs, Postgres connections and the budget. Empty = alerts exist but notify nobody."
  type        = list(string)
  default     = []
}

variable "alert_webhook_url" {
  description = "Optional action-group webhook (e.g. a relay that files a GitHub deploy-failure issue, E7). Empty = email only."
  type        = string
  default     = ""
  sensitive   = true
}

variable "monthly_budget_usd" {
  description = "Resource-group budget. Null = 150 in production (Phase 0 figure), 60 in staging."
  type        = number
  default     = null
}

variable "budget_start_date" {
  description = "First month of the budget (must be the 1st of a month, RFC3339). Ignored after creation."
  type        = string
  default     = "2026-09-01T00:00:00Z"
}

variable "job_success_reasons" {
  description = "ContainerAppSystemLogs Reason values that mean a job execution succeeded, for the missed-run alert (E7). Verify on staging (gate G-JOB) and adjust here if the platform's wording differs."
  type        = list(string)
  default     = ["Completed", "SuccessfulExecution"]
}

# --- Container shells (CI owns the real images and revisions) ---

variable "placeholder_image" {
  description = "Image the app shells start with before the first CI deploy. It honours ASPNETCORE_HTTP_PORTS, so it listens on whichever port the real app will use."
  type        = string
  default     = "mcr.microsoft.com/dotnet/samples:aspnetapp"
}

variable "cron_image" {
  description = "Image the two scheduled jobs run: anything with /bin/sh and curl. Import it into ACR (az acr import) if Docker Hub pull limits ever bite."
  type        = string
  default     = "docker.io/curlimages/curl:8.10.1"
}

variable "retention_paths" {
  description = "API paths the retention job POSTs, in order. The orphan-blob sweep (E2) is appended here once the API exposes it."
  type        = list(string)
  default     = ["/admin/retention/purge"]
}

variable "wallet_integrity_paths" {
  description = "API paths the wallet-integrity job POSTs."
  type        = list(string)
  default     = ["/admin/wallet/integrity-check"]
}

variable "vendor_secrets" {
  description = <<-EOT
    Opt-in vendor secrets (§10) to reference from the API, as ENV_VAR = Key Vault base name
    (hyphens; staging gets the -STAGING suffix automatically). Reference one ONLY once its
    secret exists in the vault and its feature flag is on: a missing Key Vault secret fails
    the revision. Example: { SENTRY_DSN = "SENTRY-DSN", BIRD_ACCESS_KEY = "BIRD-ACCESS-KEY" }.
  EOT
  type        = map(string)
  default     = {}
}

variable "admin_auth_client_id" {
  description = "Client id of the Entra app registration Easy Auth uses for the admin console (D9, 'Assignment required = Yes'). Empty = Easy Auth is not configured yet; the console then relies on its own fail-closed checks."
  type        = string
  default     = ""
}

variable "scheduler_role_assignment_via_terraform" {
  description = <<-EOT
    true = Terraform assigns Scheduler.Invoke to the jobs identity itself. That needs Graph
    AppRoleAssignment.ReadWrite.All on the infra identity, which is tenant-admin-equivalent,
    so it is OFF: bootstrap.sh (re-run after the first apply) makes the one assignment with
    the owner's own rights instead (S5 least privilege).
  EOT
  type        = bool
  default     = false
}
