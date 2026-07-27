# Provisioner SA — lets `terraform apply` run from CI behind a human approval gate
# (.github/workflows/terraform-apply.yml), so infra changes stop requiring a laptop with
# gcloud + terraform + state access. Companion to the read-only deployer SA in iam.tf.
#
# WHY A SECOND SA: the deployer (iam.tf) is deliberately read-only against infrastructure —
# roles/viewer, "read everything, change nothing", plus objectViewer on the state bucket. That is a
# blast-radius decision worth keeping: a compromised release pipeline must not be able to create or
# destroy infrastructure. This SA carries the provisioning power instead, and only the apply job of
# terraform-apply.yml — running in the human-reviewed `infra` environment, on main — can assume it.
#
# GATED OFF BY DEFAULT behind var.ci_provisioner_enabled (false): a zero-diff no-op until armed.
#
# BOOTSTRAP (chicken-and-egg): creating this SA requires provisioning rights, which is what it is
# for. The first creation happens once out of band — a local `terraform apply`, or Cloud Console
# clicks. Every apply after that, including changes to this file, runs from CI.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────
# RESIDUAL PRIVILEGE — READ THIS BEFORE TRUSTING THE ROLE LIST BELOW.
# This SA can escalate to full project control, and that is inherent to Terraform managing project
# IAM, not an oversight:
#   * roles/resourcemanager.projectIamAdmin can setIamPolicy on the project — it can grant itself
#     roles/owner.
#   * roles/iam.serviceAccountAdmin can setIamPolicy on service accounts — it can grant itself
#     tokenCreator on the runtime SA and impersonate it (which holds secretAccessor on runtime
#     secrets and objectAdmin on the media bucket).
# The custom roles below remove *casual* data-plane reach (secret payloads, media objects) so the
# common case is least-privilege, but they do NOT make this SA safe to expose. Its real containment
# is the WIF condition + the environment gate, not the role list. Treat any ability to run
# terraform-apply.yml as equivalent to project ownership.
# ─────────────────────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "provisioner" {
  count        = var.ci_provisioner_enabled ? 1 : 0
  account_id   = "lynia-provisioner"
  display_name = "Lynia CI terraform provisioner (gated apply)"
  project      = local.project_id
}

# Secrets: Terraform creates/updates/destroys secrets and their versions and sets their IAM — it
# never needs to READ a payload back. roles/secretmanager.admin would include
# secretmanager.versions.access (the payloads of JWT_SIGNING_SECRET, PII_ENCRYPTION_KEY,
# DIDIT_API_KEY, …), which iam.tf explicitly refuses to grant the deployer. Same stance here.
resource "google_project_iam_custom_role" "provisioner_secrets" {
  count       = var.ci_provisioner_enabled ? 1 : 0
  project     = local.project_id
  role_id     = "lyniaProvisionerSecrets"
  title       = "Lynia provisioner — secrets (no payload access)"
  description = "Manage Secret Manager secrets/versions/IAM without secretmanager.versions.access."
  permissions = [
    "secretmanager.secrets.create",
    "secretmanager.secrets.delete",
    "secretmanager.secrets.get",
    "secretmanager.secrets.list",
    "secretmanager.secrets.update",
    "secretmanager.secrets.getIamPolicy",
    "secretmanager.secrets.setIamPolicy",
    "secretmanager.versions.add",
    "secretmanager.versions.get",
    "secretmanager.versions.list",
    "secretmanager.versions.enable",
    "secretmanager.versions.disable",
    "secretmanager.versions.destroy",
  ]
}

# Storage: bucket-level only. Project-wide roles/storage.admin would carry storage.objects.* on
# EVERY bucket — including gs://lynia-media (KYC documents, the bucket kms.tf bothers to CMEK) and
# gs://lynia-tfstate. Object access to state is granted separately and narrowly below.
resource "google_project_iam_custom_role" "provisioner_buckets" {
  count       = var.ci_provisioner_enabled ? 1 : 0
  project     = local.project_id
  role_id     = "lyniaProvisionerBuckets"
  title       = "Lynia provisioner — buckets (no object access)"
  description = "Create/configure Cloud Storage buckets without read/write access to their objects."
  permissions = [
    "storage.buckets.create",
    "storage.buckets.delete",
    "storage.buckets.get",
    "storage.buckets.list",
    "storage.buckets.update",
    "storage.buckets.getIamPolicy",
    "storage.buckets.setIamPolicy",
  ]
}

# Predefined roles for resource classes where no data-plane concern exists. The list is derived from
# what this module actually declares — the five marked (added post-review) were missing from the
# first draft, which would have failed a full apply partway through with elevated credentials.
resource "google_project_iam_member" "provisioner_roles" {
  for_each = var.ci_provisioner_enabled ? toset([
    "roles/cloudsql.admin",                  # main.tf, staging.tf
    "roles/redis.admin",                     # memorystore
    "roles/run.admin",                       # cloud run services + iam
    "roles/compute.networkAdmin",            # vpc, ALB, addresses (lb.tf, network.tf)
    "roles/compute.securityAdmin",           # cloud armor (lb.tf)
    "roles/iam.serviceAccountAdmin",         # runtime/deployer SAs (iam.tf) — see RESIDUAL note
    "roles/resourcemanager.projectIamAdmin", # project bindings (iam.tf) — see RESIDUAL note
    "roles/artifactregistry.admin",          # api image repository
    "roles/cloudscheduler.admin",            # scheduler.tf
    "roles/serviceusage.serviceUsageAdmin",  # enabling APIs
    "roles/monitoring.admin",                # alert policies / channels
    "roles/cloudkms.admin",                  # kms.tf key ring + crypto keys        (added post-review)
    "roles/iam.workloadIdentityPoolAdmin",   # wif.tf pool + provider               (added post-review)
    "roles/vpcaccess.admin",                 # network.tf serverless connector      (added post-review)
    "roles/servicenetworking.networksAdmin", # network.tf private service access    (added post-review)
    "roles/iap.admin",                       # admin.tf IAP backend bindings        (added post-review)
  ]) : toset([])
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.provisioner[0].email}"
}

resource "google_project_iam_member" "provisioner_custom_roles" {
  for_each = var.ci_provisioner_enabled ? toset([
    google_project_iam_custom_role.provisioner_secrets[0].id,
    google_project_iam_custom_role.provisioner_buckets[0].id,
  ]) : toset([])
  project = local.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# State objects: read + write + lock, scoped to the state bucket alone. objectAdmin (not
# storage.admin on the bucket) is the least privilege that allows creating, replacing and deleting
# state objects; it cannot delete the bucket. The bucket itself is deliberately unmanaged by this
# module — it HOLDS the state, so managing it from within would be circular (same reasoning as the
# deployer's binding in iam.tf).
resource "google_storage_bucket_iam_member" "provisioner_tfstate_write" {
  count  = var.ci_provisioner_enabled ? 1 : 0
  bucket = "lynia-tfstate"
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# Cloud Run services run AS the runtime SA, so Terraform must be able to actAs it.
resource "google_service_account_iam_member" "provisioner_actas_runtime" {
  count              = var.ci_provisioner_enabled ? 1 : 0
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.provisioner[0].email}"
}

# WIF binding — the load-bearing containment. principalSet on attribute.environment/infra means only
# a job declaring `environment: infra` can impersonate this SA; the provider's attribute_condition
# (wif.tf) additionally pins the ref to main, so GCP — not a GitHub checkbox — enforces the branch
# boundary. Both matter: the environment gate alone would let any branch's edited workflow through.
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
