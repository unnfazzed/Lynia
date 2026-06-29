# Optional project creation + the API enablement that everything else depends on.

# Create the project only when asked; otherwise adopt an existing, billing-linked one.
resource "google_project" "this" {
  count           = var.create_project ? 1 : 0
  name            = var.project_id
  project_id      = var.project_id
  org_id          = var.org_id
  folder_id       = var.folder_id
  billing_account = var.billing_account
  labels          = var.labels
}

locals {
  # Reference the created project if we made one, else the caller-supplied id.
  project_id = var.create_project ? google_project.this[0].project_id : var.project_id
}

# Every API the stack touches. disable_on_destroy = false so a `destroy` of the
# stack doesn't rip APIs out from under anything else in a shared project.
resource "google_project_service" "apis" {
  for_each = toset([
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com", # signBlob, for GCS V4 signed URLs via ADC
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "vpcaccess.googleapis.com",
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "firebase.googleapis.com",               # link Firebase to the project (FCM, A4)
    "firebasecloudmessaging.googleapis.com", # FCM HTTP v1 send from the runtime SA
  ])

  project            = local.project_id
  service            = each.value
  disable_on_destroy = false
}
