# Cloud SQL for PostgreSQL 16. PostGIS is enabled by the first Prisma migration
# (0001_init: CREATE EXTENSION IF NOT EXISTS postgis), which the app db_user can
# run because Cloud SQL grants it cloudsqlsuperuser — so no Postgres provider /
# manual extension step is needed here.

resource "google_sql_database_instance" "main" {
  name                = "lynia-pg"
  database_version    = var.db_version
  region              = var.region
  project             = local.project_id
  deletion_protection = var.deletion_protection

  depends_on = [google_service_networking_connection.private_vpc]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL" # pilot; flip to REGIONAL for HA before launch
    disk_type         = "PD_SSD"
    disk_size         = var.db_disk_size_gb
    disk_autoresize   = true
    user_labels       = var.labels

    ip_configuration {
      # Private IP for in-VPC access (the hardening path). Public IP stays ON so
      # the GitHub-hosted runner's Cloud SQL Auth Proxy can reach the instance
      # for `prisma migrate deploy`; the proxy still IAM-auths + encrypts, and no
      # authorized_networks are opened. ssl_mode rejects any non-proxy plaintext.
      ipv4_enabled                                  = true
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00" # ~04:00 Harare (CAT, UTC+2)
    }

    maintenance_window {
      day          = 7 # Sunday
      hour         = 2
      update_track = "stable"
    }
  }
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
  project  = local.project_id
}

# URL-safe charset (no characters that need percent-encoding in a connection string).
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "-_"
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
  project  = local.project_id
}
