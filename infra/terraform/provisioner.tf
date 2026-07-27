# Provisioner SA — lets `terraform apply` run from CI behind a human approval gate
# (.github/workflows/terraform-apply.yml), so infra changes stop requiring a laptop with
# gcloud + terraform + state access. Companion to the read-only deployer SA in iam.tf.
#
# WHY A SECOND SA: the deployer (iam.tf) is deliberately read-only against infrastructure —
# roles/viewer, "read everything, change nothing", plus objectViewer on the state bucket. That
# is a blast-radius decision worth keeping: a compromised release pipeline must not be able to
# create or destroy infrastructure. This SA carries the provisioning power instead, and only
# terraform-apply.yml federates to it — a workflow that cannot run without a human clicking
# Approve on the `infra` GitHub Environment.
#
# GATED OFF BY DEFAULT: every resource is behind var.ci_provisioner_enabled (false), so this
# file is a zero-diff no-op until the founder opts in.
#
# BOOTSTRAP (the chicken-and-egg): creating this SA requires provisioning rights, which is what
# it is for. So the FIRST creation happens once, out of band — either an existing local
# `terraform apply`, or ~5 clicks in the Cloud Console (IAM → Service Accounts → Create
# `lynia-provisioner`; grant the roles below; then add the WIF principalSet binding). After that
# one bootstrap, every subsequent apply — including changes to this file — runs from CI.

resource "google_service_account" "provisioner" {
  count        = var.ci_provisioner_enabled ? 1 : 0
  account_id   = "lynia-provisioner"
  display_name = "Lynia CI terraform provisioner (gated apply)"
  project      = local.project_id
}

# Roles sized to what infra/terraform actually manages today. Deliberately NOT roles/owner or
# roles/editor: those additionally carry data-plane access (read/write the app's Cloud Storage
# objects and Cloud SQL data), which an infrastructure provisioner never needs. Each role below
# maps to resources in this module — add a role only when a new resource type demands it.
resource "google_project_iam_member" "provisioner_roles" {
  for_each = var.ci_provisioner_enabled ? toset([
    "roles/cloudsql.admin",             # sql instances/databases/users (main.tf, staging.tf)
    "roles/redis.admin",                # memorystore instances
    "roles/run.admin",                  # cloud run services + iam
    "roles/compute.networkAdmin",       # vpc, connector, ALB, addresses (lb.tf)
    "roles/compute.securityAdmin",      # cloud armor policies (lb.tf)
    "roles/storage.admin",              # media buckets (NOT the state bucket — bound separately)
    "roles/secretmanager.admin",        # secrets + versions + per-secret iam (secrets.tf)
    "roles/iam.serviceAccountAdmin",    # create/manage the runtime + deployer SAs (iam.tf)
    "roles/resourcemanager.projectIamAdmin", # project-level role bindings this module declares
    "roles/artifactregistry.admin",     # the api image repository
    "roles/cloudscheduler.admin",       # retention purge jobs (scheduler.tf)
    "roles/serviceusage.serviceUsageAdmin", # enabling APIs
    "roles/monitoring.admin",           # alert policies / notification channels
  ]) : toset([])
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# Terraform must READ and WRITE recorded state, and take the lock. objectAdmin (not storage.admin
# on the bucket) is the least privilege that allows create/update/delete of state objects — it
# cannot delete the bucket itself. The bucket is deliberately unmanaged by this module (it HOLDS
# the state; managing it from within would be circular — same reasoning as the deployer's binding).
resource "google_storage_bucket_iam_member" "provisioner_tfstate_write" {
  count  = var.ci_provisioner_enabled ? 1 : 0
  bucket = "lynia-tfstate"
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# Terraform sets service accounts on the resources it creates (Cloud Run services run AS the
# runtime SA), which requires actAs on them.
resource "google_service_account_iam_member" "provisioner_actas_runtime" {
  count              = var.ci_provisioner_enabled ? 1 : 0
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# Workload Identity Federation: only THIS repository, and only workflows running in the `infra`
# GitHub Environment (the one carrying the required-reviewer gate), may impersonate this SA.
# The environment scoping is the load-bearing part — without it, any workflow in the repo could
# federate to a provisioner. Mirrors the existing deployer WIF binding's principalSet shape.
resource "google_service_account_iam_member" "provisioner_wif" {
  count              = var.ci_provisioner_enabled ? 1 : 0
  service_account_id = google_service_account.provisioner[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.environment/infra"
}

output "CI_PROVISIONER_SERVICE_ACCOUNT" {
  description = "Set as the repo Variable GCP_PROVISIONER_SERVICE_ACCOUNT to arm terraform-apply.yml."
  value       = var.ci_provisioner_enabled ? google_service_account.provisioner[0].email : ""
}
