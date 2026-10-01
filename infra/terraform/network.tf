# Private networking: a custom VPC, a private-services-access peering range for
# Cloud SQL private IP, and a Serverless VPC Access connector so Cloud Run can
# reach Memorystore (Redis) on its private address.
#
# Why the connector matters: Cloud Run is serverless and has NO route to a
# private VPC address by default. Memorystore is private-only, so without this
# connector the API cannot reach Redis at all — BullMQ jobs, Socket.IO pub/sub,
# and the OTP counters would all fail at runtime. (Cloud SQL is reached over the
# Auth Proxy unix socket via --add-cloudsql-instances, so it does not strictly
# need the connector — but private IP is provisioned for the VPC-internal
# migration hardening path noted in the README.)

resource "google_compute_network" "vpc" {
  name                    = "lynia-vpc"
  auto_create_subnetworks = false
  project                 = local.project_id
  depends_on              = [google_project_service.apis]
}

# Reserved range that Service Networking peers for Cloud SQL private IP + Redis
# (PRIVATE_SERVICE_ACCESS). Pinned to 10.10.0.0/16 so it can never overlap the
# VPC connector's 10.8.0.0/28 below.
resource "google_compute_global_address" "private_services" {
  name          = "lynia-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  address       = "10.10.0.0"
  prefix_length = 16
  network       = google_compute_network.vpc.id
  project       = local.project_id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
  depends_on              = [google_project_service.apis]
}

# Serverless VPC Access connector for Cloud Run → VPC (Redis). Its /28 must not
# overlap the private-services range above or any subnet.
resource "google_vpc_access_connector" "connector" {
  count         = var.vpc_connector_enabled ? 1 : 0
  name          = "lynia-connector"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 3
  project       = local.project_id
  depends_on    = [google_project_service.apis]
}

# --- Direct VPC egress (cost) -------------------------------------------------------------------
# The connector above bills as two always-on VMs regardless of traffic (~$12-18/mo at africa-south1
# list) to serve a pilot that is idle most of the day. Cloud Run's Direct VPC egress (GA 2024-04-23)
# reaches the same private addresses over a real subnet, at the SAME per-GB network rates, with NO
# compute charge, and it scales to zero with the service. Numbers and reasoning:
# docs/HOSTING-COST-COMPARISON.md §8; ordered rollout: docs/INFRA-HARDENING-ROLLOUT.md §7.
#
# Direct VPC egress needs something the connector did not: a real subnet. This VPC is
# auto_create_subnetworks = false and has none, so one is created here. Its range is chosen to be
# provably disjoint from both existing ranges:
#
#   10.8.0.0/28    the connector, above
#   10.9.0.0/24    THIS subnet — between the two, overlapping neither
#   10.10.0.0/16   private-services peering (Cloud SQL private IP + Redis)
#
# Cloud Run consumes one address per instance, so /24 (252 usable) sits far above --max-instances 10
# plus the churn of a blue/green revision swap. Unused addresses cost nothing, and widening the range
# later would be a destroy/create — size it once, generously.
resource "google_compute_subnetwork" "run_direct" {
  count         = var.direct_vpc_egress_enabled ? 1 : 0
  name          = "lynia-run-direct"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.direct_vpc_egress_cidr
  project       = local.project_id

  # Lets the service reach Google APIs over the private path rather than the internet if
  # --vpc-egress is ever widened past private-ranges-only. Free, and harmless today.
  private_ip_google_access = true
}

# Plan-time guard. Cloud Run's ONLY route to private-IP Redis is the connector or Direct VPC egress;
# with both off, the next deploy produces a service that builds, starts, passes CI and then fails
# every BullMQ job, Socket.IO broadcast and OTP counter op at runtime — the "green CI, dead service"
# class this module has been bitten by before (docs/ENG-REVIEW.md §3b). Cheaper to refuse the plan.
# terraform_data creates nothing in GCP; it exists purely to carry the precondition.
resource "terraform_data" "vpc_egress_path_guard" {
  input = "direct=${var.direct_vpc_egress_enabled},connector=${var.vpc_connector_enabled}"

  lifecycle {
    precondition {
      condition     = var.direct_vpc_egress_enabled || var.vpc_connector_enabled
      error_message = "Cloud Run would have no route to private-IP Redis: direct_vpc_egress_enabled and vpc_connector_enabled are both false. Enable one. To cut over, set direct_vpc_egress_enabled = true first, move the service with the DIRECT_VPC_EGRESS repo variable, verify /healthz reports redis: true, and only then set vpc_connector_enabled = false (docs/INFRA-HARDENING-ROLLOUT.md §7)."
    }
  }
}
