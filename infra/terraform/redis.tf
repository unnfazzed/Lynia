# Memorystore (Redis) — BullMQ jobs + Socket.IO pub/sub + OTP attempt counters.
# Private, in-VPC, AUTH enabled. Reached from Cloud Run via the VPC connector.

resource "google_redis_instance" "main" {
  name               = "lynia-redis"
  tier               = var.redis_tier
  memory_size_gb     = var.redis_memory_size_gb
  region             = var.region
  redis_version      = var.redis_version
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  auth_enabled       = true
  project            = local.project_id
  labels             = var.labels

  # Reuse the same service-networking peering as Cloud SQL.
  depends_on = [google_service_networking_connection.private_vpc]
}
