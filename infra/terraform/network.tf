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

# Subnet for Cloud Run DIRECT VPC EGRESS — the replacement for the connector below.
#
# Until now this VPC had NO subnet at all (auto_create_subnetworks = false, and nothing declared one):
# the connector carves its own /28 internally and Cloud SQL rides the 10.10.0.0/16 service-networking
# peering, so neither needed one. Direct VPC egress does: it assigns each Cloud Run instance a real
# address out of a real subnet, which is exactly what lets it skip the connector VMs entirely.
#
# Why that is worth doing: the connector runs min_instances = 2 (2 is the enforced floor, not a
# choice), and those are the ONLY Compute Engine resources in this project. The 2026-08-17..09-15 SKU
# export prices them precisely — 360.01 E2 core-hours and 1,440.03 E2 GiB-hours over 720 hours, i.e.
# 0.5 vCPU and 2 GiB held continuously, which is 2x e2-micro to the decimal — at $12.94/month, billed
# whether or not a request is served. Direct VPC egress has no such standing cost and removes a hop.
#
# CIDR: 10.20.0.0/24, deliberately clear of BOTH existing ranges (10.10.0.0/16 private services,
# 10.8.0.0/28 connector) so this can coexist with the connector through the cutover rather than
# forcing a flag-day. A /24 is 254 usable addresses against a ceiling of ~24 concurrent instances
# (prod --max-instances 10 + staging 2, doubled while a revision rolls over).
#
# NOT yet wired: release.yml and deploy-staging.yml still pass --vpc-connector. Creating the subnet is
# additive and safe to apply on its own; switching the deploy flags and then deleting the connector
# are separate, ordered steps, because deleting a connector a live revision still references breaks
# that revision's path to Redis.
resource "google_compute_subnetwork" "serverless" {
  name          = "lynia-serverless"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.20.0.0/24"
  project       = local.project_id

  # Lets instances reach Google APIs (Secret Manager, Cloud SQL admin) over internal addressing rather
  # than egressing to the internet — matches the posture --vpc-egress private-ranges-only already sets.
  private_ip_google_access = true

  depends_on = [google_project_service.apis]
}

# Serverless VPC Access connector for Cloud Run → VPC (Redis). Its /28 must not
# overlap the private-services range above or any subnet.
#
# SUPERSEDED, pending cutover: google_compute_subnetwork.serverless above exists to replace this.
# Removal is deliberately NOT part of the change that adds the subnet — see that comment for the
# ordering constraint.
resource "google_vpc_access_connector" "connector" {
  name          = "lynia-connector"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 3
  project       = local.project_id
  depends_on    = [google_project_service.apis]
}
