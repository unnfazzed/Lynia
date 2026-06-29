# Provider + Terraform version pins for the Lynia GCP provisioning module.
# Ship-stage GCP provisioning as Infrastructure-as-Code (status: docs/PILOT-READINESS.md).

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state is strongly recommended (the module generates DB/JWT secrets that
  # land in state). Uncomment and point at a GCS bucket once the project exists.
  #
  # backend "gcs" {
  #   bucket = "lynia-tfstate"
  #   prefix = "infra/terraform"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
