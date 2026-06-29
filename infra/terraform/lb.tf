# Global external HTTPS Application Load Balancer fronting the EXISTING Cloud Run
# service (var.cloud_run_service = "lynia-api", region africa-south1).
#
# Why this exists: the org disables the default *.run.app URL at Google's edge
# (CIS-style hardening - the same org enforces iam.disableServiceAccountKeyCreation),
# so external requests to the default URL get a bare edge 404. Exposing the service
# through this ALB gives the mobile app a stable, org-allowed HTTPS endpoint
# (BACKLOG "HTTPS for device builds"), with TLS terminated by a Google-managed cert.
#
# IMPORTANT: Terraform does NOT create/manage the Cloud Run service itself - that
# is done by `gcloud run deploy` in .github/workflows/release.yml. This LB only
# *references* the existing service by name + region via a Serverless NEG, so the
# two never fight over ownership of the service resource.
#
# compute.googleapis.com is already enabled in project.tf (google_project_service.apis),
# which these resources depend on transitively via local.project_id + the NEG's
# explicit depends_on below.

# --- Serverless NEG: the bridge from the LB to the Cloud Run service ---
# A regional NEG in the SAME region as the service (africa-south1). This is the
# load-bearing correctness constraint: a serverless NEG can only target a Cloud Run
# service in its own region, so region MUST equal the Cloud Run region.
# network_endpoint_type must be SERVERLESS; the cloud_run block targets the service
# by name (not URL), so it keeps working across redeploys.
resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "lynia-api-neg"
  region                = var.region
  project               = local.project_id
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.cloud_run_service
  }

  depends_on = [google_project_service.apis]
}

# --- Backend service ---
# EXTERNAL_MANAGED = the global external ALB data plane (required to pair with a
# global forwarding rule using the same scheme). A SERVERLESS NEG backend takes NO
# balancing mode / capacity / health-check settings, and NO port_name (port_name is
# only meaningful for instance-group / zonal-NEG named ports - it is ignored for
# serverless). protocol is HTTP per Google's canonical serverless-NEG pattern; the
# user-facing TLS is terminated at the target HTTPS proxy, not on the LB->Cloud Run hop.
# (google_compute_backend_service does not accept `labels` - correctly omitted.)
resource "google_compute_backend_service" "api" {
  name                  = "lynia-api-backend"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# --- URL map: route every host/path to the single backend ---
resource "google_compute_url_map" "api" {
  name            = "lynia-api-urlmap"
  project         = local.project_id
  default_service = google_compute_backend_service.api.id
}

# --- Google-managed TLS certificate for the API domain ---
# Provisions and auto-renews once the forwarding rule is live AND var.api_domain's
# DNS A record points at the LB IP (google_compute_global_address.api below).
resource "google_compute_managed_ssl_certificate" "api" {
  name    = "lynia-api-cert"
  project = local.project_id

  managed {
    domains = [var.api_domain]
  }
}

# --- HTTPS target proxy: terminates TLS, hands traffic to the url map ---
resource "google_compute_target_https_proxy" "api" {
  name             = "lynia-api-https-proxy"
  project          = local.project_id
  url_map          = google_compute_url_map.api.id
  ssl_certificates = [google_compute_managed_ssl_certificate.api.id]
}

# --- Static global anycast IP: the single address DNS points at (A record) ---
# Shared by both the :443 and :80 forwarding rules. Named `api` to avoid colliding
# with the existing INTERNAL google_compute_global_address.private_services (network.tf).
resource "google_compute_global_address" "api" {
  name       = "lynia-api-ip"
  project    = local.project_id
  ip_version = "IPV4"
  depends_on = [google_project_service.apis]
}

# --- HTTPS forwarding rule (:443) ---
# Scheme must match the backend service (EXTERNAL_MANAGED). port_range, not
# all_ports, for an HTTPS ALB.
resource "google_compute_global_forwarding_rule" "https" {
  name                  = "lynia-api-https-fr"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "443"
  target                = google_compute_target_https_proxy.api.id
  ip_address            = google_compute_global_address.api.id
  labels                = var.labels
}

# --- HTTP -> HTTPS redirect (:80) ---
# A dedicated url map whose only job is a 301 to https://, an HTTP target proxy,
# and a :80 forwarding rule reusing the SAME global address so plain-HTTP clients
# get bounced to TLS instead of hitting a dead port.
resource "google_compute_url_map" "https_redirect" {
  name    = "lynia-api-https-redirect"
  project = local.project_id

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "lynia-api-http-proxy"
  project = local.project_id
  url_map = google_compute_url_map.https_redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "lynia-api-http-fr"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  ip_address            = google_compute_global_address.api.id
  labels                = var.labels
}
