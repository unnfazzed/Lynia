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

  # Remote state (the module generates DB/JWT secrets that land in state).
  # Migrated 2026-07-08: state lives in the private, versioned gs://lynia-tfstate
  # bucket — a fresh clone + `terraform init` finds the live state, so a plan can
  # never mistake existing infra for "create everything from scratch".
  backend "gcs" {
    bucket = "lynia-tfstate"
    prefix = "infra/terraform"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}
