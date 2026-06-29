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
  name          = "lynia-connector"
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.8.0.0/28"
  min_instances = 2
  max_instances = 3
  project       = local.project_id
  depends_on    = [google_project_service.apis]
}
