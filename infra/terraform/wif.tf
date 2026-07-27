# Workload Identity Federation — keyless CI auth.
#
# The org disables long-lived SA keys (constraints/iam.disableServiceAccountKeyCreation),
# which is the right default. Instead, GitHub Actions presents its OIDC token and
# federates into the deployer SA: no secret key ever exists. The release workflow's
# Authenticate step uses `workload_identity_provider` + `service_account` (keyless);
# there is no `GCP_SA_KEY`.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
  description               = "OIDC federation for GitHub Actions deploys"
  project                   = local.project_id
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"
  project                            = local.project_id

  # `attribute.environment` carries the GitHub Environment a job declares (`environment: infra`).
  # It exists so the gated-apply SA (provisioner.tf) can be bound to principalSet
  # .../attribute.environment/infra — i.e. only a workflow running in the human-reviewed `infra`
  # Environment may impersonate a provisioner, not merely "any workflow in this repo". Jobs that
  # declare no environment simply carry no such claim, so every existing repository-scoped
  # binding (the deployer) is unaffected. Adding a mapping is an in-place provider update —
  # confirm the plan says "update in-place", never "must be replaced" (a replacement would break
  # keyless auth for the running deploy workflows until it settles).
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "assertion.environment"
  }

  # Hard gate: only OIDC tokens minted for THIS repo may use the provider.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Allow workflows from the repo to impersonate the deployer SA.
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
