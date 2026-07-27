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
  # Environment may impersonate a provisioner, not merely "any workflow in this repo".
  #
  # The has() guards are NOT decoration. The OIDC token carries an `environment` claim ONLY when the
  # job declares one, and a mapping expression that dereferences an ABSENT claim rejects the token
  # exchange outright — it does not yield an empty attribute. Without the guard, every existing
  # no-environment job (ci.yml, gcp-drift-detect.yml, release.yml's build steps, terraform-apply's
  # own plan job) would lose keyless auth the moment this applied: all CI deploys, simultaneously.
  # An earlier revision of this block shipped unguarded; it was never applied, and this corrects it.
  # Verify with a no-environment job on a scratch branch before arming, and confirm the plan says
  # "update in-place", never "must be replaced".
  attribute_mapping = {
    "google.subject"        = "assertion.sub"
    "attribute.repository"  = "assertion.repository"
    "attribute.environment" = "has(assertion.environment) ? assertion.environment : \"none\""
    "attribute.ref"         = "has(assertion.ref) ? assertion.ref : \"none\""
    # Composite claim so privileged principalSets can be REPO-qualified. Binding the provisioner to
    # attribute.environment/infra alone would match ANY identity in this pool carrying an `infra`
    # environment — adding a second provider to github-pool later would silently widen it to another
    # repo's `infra` environment. repo_env pins repo AND environment in one value.
    "attribute.repo_env"    = "assertion.repository + \":\" + (has(assertion.environment) ? assertion.environment : \"none\")"
  }

  # Hard gate: only OIDC tokens minted for THIS repo may use the provider.
  # The ref clause makes the branch boundary GCP-enforced rather than delegated to a GitHub setting.
  # workflow_dispatch runs the *branch's* copy of a workflow, so someone with commit access could
  # otherwise edit terraform-apply.yml on a branch and dispatch it — every control inside that file
  # is attacker-editable. Scoped to the `infra` environment ONLY (review P2-3): deploy-staging
  # (environment: staging), deploy-admin and rollback.yml (environment: production) all support
  # workflow_dispatch from a branch, and rollback.yml is the BREAK-GLASS path — an incident
  # responder on a hotfix branch must never find the token exchange refusing them. Tokens without
  # an environment claim, and tokens for environments other than `infra`, keep working from any
  # ref; only the environment that can reach the provisioner principalSet is pinned to main.
  attribute_condition = "assertion.repository == \"${var.github_repository}\" && (!has(assertion.environment) || assertion.environment != \"infra\" || assertion.ref == \"refs/heads/main\")"

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
