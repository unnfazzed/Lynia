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
}
