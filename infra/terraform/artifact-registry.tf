# Docker repo the release workflow pushes the API image to:
#   ${region}-docker.pkg.dev/${project}/${artifact_repo}/lynia-api
resource "google_artifact_registry_repository" "api" {
  repository_id = var.artifact_repo
  location      = var.region
  format        = "DOCKER"
  description   = "Lynia API container images"
  project       = local.project_id
  labels        = var.labels
  depends_on    = [google_project_service.apis]

  # --- Retention (added 2026-09-16) ---
  # This repo had NO cleanup policy, so every image release.yml ever pushed was still here: the
  # 2026-08-17..09-15 SKU export billed 127.38 GiB-month of Artifact Registry storage plus 25.21 GiB
  # of intercontinental egress, ~$15/mo, the large majority of it layers nothing can deploy any more.
  #
  # Two policies, and the interaction between them is the whole design. Artifact Registry applies
  # KEEP before DELETE, so the keep_count below protects the recent releases from the untagged sweep
  # as well; the sweep is aimed at what is left, which is old orphaned manifests (including stale
  # buildx cache children). Both run in dry-run until var.artifact_cleanup_dry_run is flipped.
  cleanup_policy_dry_run = var.artifact_cleanup_dry_run

  cleanup_policies {
    id     = "keep-recent-releases"
    action = "KEEP"
    most_recent_versions {
      # No package_name_prefixes: this repo pushes one package (lynia-api) plus its :buildcache, and
      # naming them here would silently stop protecting anything a future package adds.
      keep_count = var.artifact_keep_recent_versions
    }
  }

  cleanup_policies {
    id     = "delete-stale-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = var.artifact_untagged_retention
    }
  }
}
